/**
 * jev-todo-audit — Pi extension.
 *
 * Every `interval` completed agent loops, replays the rpiv-todo board from the
 * session branch, asks the jev model (TypeSafe Choice) whether the board
 * matches what the agent is actually doing, and injects a corrective custom
 * message when it does not. Purely advisory: failures never touch the loop.
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { SettingsManager } from "@earendil-works/pi-coding-agent";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { agentConfigPath, legacyConfigPath, loadConfig, projectConfigPath, resolveApiKey, type AuditConfig } from "./config.js";
import { replayBoardWithAges, staleTaskIds, unfinishedTasks, visibleTasks, inProgressTasks as inProgressBoardTasks } from "./board.js";
import { collectContext, digest, object, redact } from "./context.js";
import { freshCounter, onTurnEnd, onUserMessage, replayCounter, shouldAudit, type LoopCounter } from "./counter.js";
import { JUDGMENT_VERSION, newEvaluationCache, type Attempt, type EvaluationCache, type TerminalStopInfo } from "./typesafe.js";
import { diagnose, isOwnBookkeeping, restoreLedger, writeLedger } from "./ledger.js";
import { processedEntries, reviewRolling, type Rolling } from "./rolling.js";
import { decide } from "./verdict.js";

/** Neutral bus channel shared with pi-continue-watchdog — plain data, no imports. */
const SEMANTIC_HOOK_CHANNEL = "pi:semantic-hook:v1";
const USER_READY_HOOK = "user-ready";
const VALID_STOP_KINDS = new Set(["AI_UNLOCK", "ERROR_UNLOCK", "EXHAUSTED", "DECISION_FAILED"]);

/** Narrow a `pi:semantic-hook:v1` payload to a valid user-ready envelope. */
function parseUserReady(data: unknown): TerminalStopInfo | undefined {
	if (!data || typeof data !== "object") return undefined;
	const e = data as { version?: unknown; name?: unknown; values?: unknown };
	if (e.version !== 1 || e.name !== USER_READY_HOOK) return undefined;
	const v = e.values as Record<string, unknown> | undefined;
	const kind = v?.STOP_KIND;
	if (typeof kind !== "string" || !VALID_STOP_KINDS.has(kind)) return undefined;
	const out: TerminalStopInfo = { stopKind: kind };
	if (typeof v?.REASON_TYPE === "string" && v.REASON_TYPE.trim()) out.reasonType = v.REASON_TYPE;
	if (typeof v?.REASON === "string" && v.REASON.trim()) out.reason = v.REASON;
	return out;
}

type Ctx = { sessionManager: { getSessionId(): string; getBranch(): Iterable<unknown>; buildContextEntries?: () => Iterable<unknown> }; cwd?: string; isProjectTrusted?: () => boolean; signal?: AbortSignal };
const sid = (ctx: Ctx) => ctx.sessionManager.getSessionId() ?? "";

/** Same retry settings the agent loop uses (settings.json `retry` block). */
function retrySettingsFor(ctx: Ctx): { maxRetries: number; baseDelayMs: number } {
	const fallback = { maxRetries: 0, baseDelayMs: 2_000 };
	try {
		const s = SettingsManager.create(ctx.cwd ?? process.cwd(), undefined, {
			projectTrusted: ctx.isProjectTrusted?.() ?? false,
		}).getRetrySettings();
		return s.enabled ? { maxRetries: s.maxRetries, baseDelayMs: s.baseDelayMs } : { ...fallback, baseDelayMs: s.baseDelayMs };
	} catch {
		return fallback;
	}
}


export default function (pi: ExtensionAPI, cfgOverride?: AuditConfig) {
	// Global layer resolved eagerly; project layer merges on first session_start
	// once we can see ctx.cwd + ctx.isProjectTrusted().
	let cfg: AuditConfig = cfgOverride ?? loadConfig({ globalPath: agentConfigPath() });
	if (!cfg.enabled) return;

	const counters = new Map<string, LoopCounter>();
	/** Same-session evaluation memory; never shared across sessions. */
	const caches = new Map<string, EvaluationCache>();
	const cacheFor = (id: string) => caches.get(id) ?? (caches.set(id, newEvaluationCache()), caches.get(id)!);
	/** Latest durable processing receipt per session (cumulative; replaced, never accumulated). */
	const rollings = new Map<string, Rolling | undefined>();
	/** Per-load prefix: the sequence restarts on reload, so ids stay unique within a session branch. */
	const LOAD_ID = randomUUID();
	let auditSeq = 0;
	/** Token of an unfinished `/jev-audit full` per session. */
	const fullReviews = new Map<string, string>();
	/** Rebuild same-session memory from the active branch (reload, compaction, tree navigation). */
	const restoreMemory = (ctx: Ctx) => {
		const cache = newEvaluationCache();
		rollings.set(sid(ctx), restoreLedger(ctx.sessionManager.getBranch(), cache));
		caches.set(sid(ctx), cache);
	};
	const append = (pi as { appendEntry?: ExtensionAPI["appendEntry"] }).appendEntry?.bind(pi);
	/** Own ledger entries are neither evidence nor a boundary change. */
	const withoutBookkeeping = (entries: Iterable<unknown>) => [...entries].filter((e) => !isOwnBookkeeping(e));
	const counterFor = (id: string) => counters.get(id) ?? freshCounter();
	let inFlight = false;
	let projectMerged = false;
	/** Latest ctx seen on session_start — used by the semantic-hook listener. */
	let lastCtx: (Ctx & { ui?: { notify?: (m: string, l?: "error" | "warning" | "info") => void } }) | undefined;
	const sentKeys = new Set<string>();
	const noticeKeys = new Set<string>();
	let warnedBudget = false;
	let lastStopKey = "";
	const contextFor = (ctx: Ctx, board = replayBoardWithAges(ctx.sessionManager.getBranch())) => {
		return collectContext(
			withoutBookkeeping(ctx.sessionManager.buildContextEntries?.() ?? ctx.sessionManager.getBranch()),
			visibleTasks(board).map((task) => {
				const origin = board.firstActive.get(task.id);
				// Task-long macro span: first in_progress turn through now; updates/waits/resumes do not reset it.
				const revisions = board.revisions.filter((r) => r.changed.includes(task.id) && (!origin || r.turn >= origin.turn));
				// Bounded and derived from the branch alone, so an unchanged repeat keeps an identical supplement
				// (0 requests). Every revision still appears in order as a projected `todo` tool event.
				const trajectory = {
					firstActive: origin ? { turn: origin.turn, source: origin.source } : task.status === "in_progress" ? "unknown: not reconstructable from the branch" : "not started",
					revisionCount: revisions.length,
					segments: revisions.slice(-5).map((r) => ({ turn: r.turn, source: r.source })),
				};
				return { id: `task:${task.id}`, value: { ...task, trajectory } };
			}),
			!!ctx.sessionManager.buildContextEntries,
			[resolveApiKey(cfg) ?? ""],
		);
	};
	const evidenceVersionFor = (ctx: Ctx) => digest([...ctx.sessionManager.getBranch()].flatMap((raw) => {
		const e = object(raw), m = e.type === "custom_message" ? e : object(e.message);
		const visibleCustom = m.customType && m.display !== false && m.customType !== "jev-todo-audit";
		if (m.role === "user" || (m.role === "toolResult" && m.toolName !== "todo") ||
			(m.role === "bashExecution" && !m.excludeFromContext) || visibleCustom)
			return [[e.id, m.role, m.customType, m.content, m.command, m.output, m.exitCode, m.isError]];
		return [];
	}));
	const boundaryFor = (ctx: Ctx) => {
		const branch = withoutBookkeeping(ctx.sessionManager.getBranch());
		return digest({ session: sid(ctx), board: replayBoardWithAges(branch).tasks,
			entries: branch.map((raw) => { const e = object(raw); return [e.id, e.type, e.message?.role === "user" ? e.message.content : undefined]; }) });
	};
	/** Entry id of the branch tip when the audit started; used to detect a branch switch. */
	const leafId = (ctx: Ctx) => {
		let id: string | undefined;
		for (const raw of ctx.sessionManager.getBranch()) { const e = object(raw); if (typeof e.id === "string") id = e.id; }
		return id;
	};
	/** The entry the audit started on is still on the branch (appends keep it; a branch switch removes it). */
	const onSameBranch = (ctx: Ctx, leaf: string | undefined) =>
		leaf === undefined || [...ctx.sessionManager.getBranch()].some((raw) => object(raw).id === leaf);
	const restoreKeys = (ctx: Ctx) => {
		for (const raw of ctx.sessionManager.getBranch()) {
			const e = object(raw), m = e.type === "custom_message" ? e : object(e.message);
			if (m.customType !== "jev-todo-audit") continue;
			for (const key of Array.isArray(m.details?.auditKeys) ? m.details.auditKeys : []) if (typeof key === "string") sentKeys.add(key);
		}
	};
	/** Single-level queue: newest distinct stop epoch seen while an audit ran. */
	let pendingStop: { key: string; stop: TerminalStopInfo } | undefined;
	/** Aborts the in-flight audit's retry backoff + fetch when the session ends/switches. */
	let auditAbort: AbortController | undefined;

	/** Shared audit body: replay board → call jev → act on verdict. */
	async function auditNow(
		ctx: Ctx & { ui?: { notify?: (m: string, l?: "error" | "warning" | "info") => void } },
		label: string,
		opts: { terminalStop?: TerminalStopInfo; full?: boolean } = {},
	) {
		if (!cfg.enabled || inFlight) return;
		const apiKey = resolveApiKey(cfg);
		if (!apiKey) {
			ctx.ui?.notify?.(`[jev audit] no API key: set ${cfg.apiKeyEnvVar} or apiKey in ${agentConfigPath()}`, "warning");
			return;
		}
		const c = counterFor(sid(ctx));
		inFlight = true;
		const ac = new AbortController();
		// Compose user/agent abort (ctx.signal) with the session-lifecycle abort.
		// Handler must be removable — once:true only fires on abort, completed
		// audits would otherwise leak a listener per call.
		const onCtxAbort = () => ac.abort();
		if (ctx.signal) {
			if (ctx.signal.aborted) ac.abort();
			else ctx.signal.addEventListener("abort", onCtxAbort, { once: true });
		}
		auditAbort = ac;
		const mySid = sid(ctx);
		try {
			const board = replayBoardWithAges(ctx.sessionManager.getBranch());
			// Terminal-stop short-circuit: nothing unfinished → nothing to check.
			if (opts.terminalStop && unfinishedTasks(board).length === 0) return;
			const boundary = boundaryFor(ctx);
			const startLeaf = leafId(ctx);
			const current = (c: Ctx | undefined) => !!c && !ac.signal.aborted && sid(c) === mySid && onSameBranch(c, startLeaf);
			const evidenceVersion = evidenceVersionFor(ctx);
			// Already processed input is represented by the last receipt; a receipt from another branch is not applicable.
			// `full` reassesses the whole projected history from scratch (never restoring tool bodies); an unfinished
			// full review keeps its token so a retry reuses the parts it already completed.
			const fresh = opts.full ? (fullReviews.get(mySid) ?? (fullReviews.set(mySid, `full:${randomUUID()}`), fullReviews.get(mySid)!)) : undefined;
			let rolling = fresh ? undefined : rollings.get(mySid);
			let processed = processedEntries(ctx.sessionManager.getBranch(), rolling?.through);
			if (!processed) { rolling = undefined; processed = new Set(); }
			const initialContext = contextFor(ctx, board);
			const staleIds = staleTaskIds(board, c.totalLoops, cfg.interval, cfg.staleAuditSpans);
			// Diagnostic age, not a split decision or a task-size threshold.
			for (const task of inProgressBoardTasks(board)) {
				const record = initialContext.records.find((r) => r.id === `task:${task.id}`);
				// Only the flag enters the payload: an exact loop count would change every loop and defeat reuse.
				if (record) record.text += `\nAge review flag=${staleIds.includes(task.id)}. Age alone does not justify splitting.`;
			}
			const inputKey = digest({ v: JUDGMENT_VERSION, endpoint: cfg.apiUrl, model: cfg.model, stop: opts.terminalStop, omissions: initialContext.omissions,
				records: initialContext.records.map((r) => [r.id, r.text]) });
			const attempts: Attempt[] = [];
			const outcome = await reviewRolling({ board, context: initialContext, processed, rolling, inputKey, model: cfg.model, stop: opts.terminalStop,
				opts: { apiUrl: cfg.apiUrl, apiKey, timeoutMs: cfg.timeoutMs, signal: ac.signal, cache: cacheFor(mySid), fresh, ...retrySettingsFor(ctx),
					onAttempt: (a) => attempts.push(a),
					// Answers are immutable facts about their captured input; persist even if delivery later becomes stale.
					onStore: (answers, { model }) => { if (current(lastCtx)) writeLedger(append, { kind: "eval", answers, model }); },
					onReject: (envelope) => { if (current(lastCtx)) writeLedger(append, { kind: "rejected", envelope }); } },
				// Progress advances only on a durable receipt written for this same session.
				commit: (next) => {
					if (!current(lastCtx) || !writeLedger(append, { kind: "receipt", receipt: next })) return false;
					rollings.set(mySid, next);
					return true;
				} });
			const { result: res, context } = outcome;
			// A completed forced review is the ordinary baseline from now on.
			if (fresh && outcome.final && outcome.complete && res.ok) fullReviews.delete(mySid);
			// Accounting is recorded for every attempt, including failed, recovered and later-stale audits.
			if (current(lastCtx)) writeLedger(append, { kind: "diag", diag: diagnose(`${mySid}:${LOAD_ID}:${++auditSeq}`, label, outcome.reuse,
				{ from: rolling?.through ?? null, to: rollings.get(mySid)?.through ?? null },
				outcome.unchanged ? "unchanged" : !res.ok ? "failed" : !(outcome.final && outcome.complete) ? "incomplete" : outcome.recovered ? "recovered" : "completed", attempts) });
			if (ac.signal.aborted || sid(lastCtx ?? ctx) !== mySid || boundaryFor(ctx) !== boundary) return;

			if (!res.ok || !outcome.final) {
				ctx.ui?.notify?.(`[jev audit ${label}] failed: ${redact(res.ok ? "review incomplete" : res.error, [apiKey])}`, "warning");
				return;
			}
			// The initial overflow is not the final outcome when subdivision completed the review.
			if (outcome.recovered) ctx.ui?.notify?.(`[jev audit ${label}] context overflow recovered by subdivision`, "info");

			restoreKeys(ctx);
			const action = decide(res.answers, board, cfg.confidenceThreshold, c.totalLoops, staleIds,
				{ terminalStop: !!opts.terminalStop, context, suppressed: sentKeys, scopeKey: mySid, evidenceVersion });
			if (action.kind === "notify") {
				const key = digest([mySid, evidenceVersion, action.text]);
				if (!noticeKeys.has(key)) { ctx.ui?.notify?.(action.text, "info"); noticeKeys.add(key); }
			} else if (action.kind === "inject") {
				// Re-check session identity right before the side effect — the only
				// await between the earlier guard and here is none, but shutdown can
				// fire between microtasks; keep the belt on.
				if (ac.signal.aborted || sid(lastCtx ?? ctx) !== mySid) return;
				const auditKeys = action.corrections.map((item) => item.key);
				pi.sendMessage(
					{ customType: "jev-todo-audit", content: action.text, display: true, details: { auditKeys } },
					opts.terminalStop && action.mayWake ? { deliverAs: "steer", triggerTurn: true } : { deliverAs: "steer" },
				);
				for (const key of auditKeys) sentKeys.add(key);
				if (cfg.notifyOnAligned === false) {
					ctx.ui?.notify?.(`[jev audit ${label}] correction injected`, "info");
				}
			} else if (cfg.notifyOnAligned && res.answers.alignment?.choice === "aligned" &&
				(res.answers.alignment.confidence ?? 0) >= cfg.confidenceThreshold) {
				ctx.ui?.notify?.(`[jev audit ${label}] board aligned ✓`, "info");
			}
		} catch (err) {
			if (!ac.signal.aborted) {
				ctx.ui?.notify?.(`[jev audit ${label}] error: ${redact(err instanceof Error ? err.message : String(err), [apiKey])}`, "warning");
			}
		} finally {
			ctx.signal?.removeEventListener("abort", onCtxAbort);
			inFlight = false;
			if (auditAbort === ac) auditAbort = undefined;
			// Lifecycle handlers clear obsolete pending work. A *new* stop queued
			// after user invalidation must survive cancellation of the older audit.
			if (pendingStop && lastCtx && sid(lastCtx) === mySid && !lastCtx.signal?.aborted) {
				const { key, stop } = pendingStop;
				pendingStop = undefined;
				lastStopKey = key;
				void auditNow(lastCtx, "terminal-stop", { terminalStop: stop });
			}
		}
	}

	pi.on("session_start", async (_e, ctx) => {
		lastCtx = ctx;
		auditAbort?.abort();
		sentKeys.clear();
		noticeKeys.clear();
		lastStopKey = "";
		pendingStop = undefined;
		if (!projectMerged) {
			projectMerged = true;
			const trusted = ctx.isProjectTrusted?.() ?? false;
			const projPath = ctx.cwd ? projectConfigPath(ctx.cwd) : undefined;
			if (projPath && trusted && existsSync(projPath)) {
				cfg = loadConfig({ globalPath: agentConfigPath(), projectPath: projPath, projectTrusted: true });
			}
			if (existsSync(legacyConfigPath())) {
				ctx.ui?.notify?.(`[jev-todo-audit] config moved — copy ${legacyConfigPath()} to ${agentConfigPath()}`, "warning");
			}
		}
		if (!cfg.enabled) return;
		if (cfg.activityBudgetChars !== undefined && !warnedBudget) {
			warnedBudget = true;
			ctx.ui?.notify?.("[jev-todo-audit] activityBudgetChars is deprecated and ignored; only provider context admission limits evidence size.", "warning");
		}
		restoreKeys(ctx);
		restoreMemory(ctx);
		counters.set(sid(ctx), replayCounter(ctx.sessionManager.getBranch()));
		// Background audit is useless without a key — warn once at session start.
		if (!resolveApiKey(cfg)) {
			ctx.ui?.notify?.(`[jev-todo-audit] no API key: set ${cfg.apiKeyEnvVar} or apiKey in ${agentConfigPath()}`, "warning");
		}
	});
	pi.on("session_compact", async (_e, ctx) => {
		if (!cfg.enabled) return;
		auditAbort?.abort();
		lastCtx = ctx;
		lastStopKey = "";
		restoreMemory(ctx);
		counters.set(sid(ctx), replayCounter(ctx.sessionManager.getBranch()));
	});
	pi.on("session_tree", async (_e, ctx) => {
		if (!cfg.enabled) return;
		lastCtx = ctx;
		lastStopKey = "";
		sentKeys.clear();
		restoreKeys(ctx);
		restoreMemory(ctx);
		counters.set(sid(ctx), replayCounter(ctx.sessionManager.getBranch()));
		auditAbort?.abort();
		pendingStop = undefined;
	});
	pi.on("session_shutdown", async (_e, ctx) => {
		counters.delete(sid(ctx));
		caches.delete(sid(ctx));
		rollings.delete(sid(ctx));
		fullReviews.delete(sid(ctx));
		auditAbort?.abort();
		if (lastCtx && sid(lastCtx) === sid(ctx)) {
			lastCtx = undefined;
			pendingStop = undefined;
		}
	});

	// A finalized user message (prompt or steer) resets the cooldown window.
	pi.on("message_end", async (event, ctx) => {
		if (!cfg.enabled || event.message.role !== "user") return;
		auditAbort?.abort();
		lastStopKey = "";
		pendingStop = undefined;
		onUserMessage(counterFor(sid(ctx)));
	});

	pi.on("turn_end", async (_e, ctx) => {
		if (!cfg.enabled) return;
		const c = counterFor(sid(ctx));
		onTurnEnd(c);
		if (!shouldAudit(c, cfg.interval, cfg.cooldownLoops) || inFlight) return;
		await auditNow(ctx, `@ loop ${c.totalLoops}`);
	});

	// Optional terminal-stop check: consume user-ready from the neutral bus.
	// The producer (pi-continue-watchdog) may be absent — the listener is a
	// no-op then. Handler is sync-safe: audit is fired async, errors contained.
	pi.events.on(SEMANTIC_HOOK_CHANNEL, (data: unknown) => {
		try {
			const stop = parseUserReady(data);
			if (!cfg.enabled || !stop || !lastCtx) return;
			// Wording/epoch is not new evidence. New user/work/board state is.
			const board = replayBoardWithAges(lastCtx.sessionManager.getBranch());
			const key = digest([sid(lastCtx), board.tasks, evidenceVersionFor(lastCtx)]);
			if (key === lastStopKey || key === pendingStop?.key) return;
			if (inFlight) {
				// Queue newest distinct epoch; single-level, no unbounded retries.
				pendingStop = { key, stop };
				return;
			}
			lastStopKey = key;
			// Fire-and-forget: auditNow isolates its own errors.
			void auditNow(lastCtx, "terminal-stop", { terminalStop: stop });
		} catch {
			// Malformed payloads must never disturb the agent lifecycle.
		}
	});

	pi.registerCommand("jev-audit", {
		description: "Audit now (ignores interval/cooldown; reuses already reviewed results). `full` forces a fresh reassessment.",
		handler: async (args, ctx: ExtensionCommandContext) => {
			const mode = (args ?? "").trim();
			if (mode !== "" && mode !== "full") {
				ctx.ui?.notify?.("Usage: /jev-audit [full] — default reviews only new input; full re-evaluates the projected history (tool bodies stay excluded).", "warning");
				return;
			}
			await auditNow(ctx, mode === "full" ? "manual full" : "manual", { full: mode === "full" });
		},
	});
}
