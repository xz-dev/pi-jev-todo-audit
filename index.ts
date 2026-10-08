/**
 * jev-todo-audit — Pi extension.
 *
 * Every `interval` completed agent loops, replays the rpiv-todo board from the
 * session branch, asks the jev model (TypeSafe Choice) whether the board
 * matches what the agent is actually doing, and injects a corrective custom
 * message when it does not. Purely advisory: failures never touch the loop.
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { Box, Text } from "@earendil-works/pi-tui";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { agentConfigPath, legacyConfigPath, loadConfig, projectConfigPath, type AuditConfig } from "./config.js";
import { replayBoardWithAges, isTaskDetails, staleTaskIds, unfinishedTasks, visibleTasks, inProgressTasks as inProgressBoardTasks } from "./board.js";
import { collectContext, contextVersion, digest, object, redact } from "./context.js";
import { freshCounter, onTurnEnd, onUserMessage, replayCounter, shouldAudit, type LoopCounter } from "./counter.js";
import type { Attempt, TerminalStopInfo } from "./typesafe.js";
import { diagnose, isOwnBookkeeping, writeLedger } from "./ledger.js";
import { getJudgmentService } from "./judgment-client.js";
import { runIncremental } from "./incremental.js";
import { groupLoops } from "./loops.js";
import { emptyState, emptyTask, isStateEntry, restoreState, writeState, type JudgmentState } from "./state.js";
import { answersFromState } from "./state-verdict.js";
import { decide } from "./verdict.js";
import { claimAuditProcess } from "./ownership.js";

/** Neutral bus channel shared with pi-continue-watchdog — plain data, no imports. */
const SEMANTIC_HOOK_CHANNEL = "pi:semantic-hook:v1";
const USER_READY_HOOK = "user-ready";
const VALID_STOP_KINDS = new Set(["AI_UNLOCK", "ERROR_UNLOCK", "EXHAUSTED", "DECISION_FAILED"]);
/** Shared limits on an optional main-agent account; never a promise of recovery. */
const BRIEF_GUIDANCE = "A current account in the task description or optional metadata.auditBrief = { text, sources, covers } can expose facts and gaps. It is reported data, not execution proof or permission. sources is not an exclusive allowlist; covers does not retire necessary primary evidence or replace user constraints. Repeating the account does not guarantee admission.";

// Keep the exact suffix shared with rendering; unknown historical wording stays visible.
const ADVISORY_FOOTER = "\n\nPlugin reference feedback, not a user message, instruction or new authorization. Follow the user's latest scope, existing permissions and wait conditions.\nConsider at a natural checkpoint; do not interrupt or switch tasks solely for this notice. Ignore mistaken or already satisfied suggestions; explanations in normal task progress can inform the next review. No separate reply is needed.";

/** One stored body for the main agent and expanded transcript; rendering never rewrites it. */
function formatAdvisory(kind: string, body: string): string {
	return `pi-jev-todo-audit | ${kind}\n\n${body}${ADVISORY_FOOTER}`;
}

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

type Ctx = { sessionManager: { getSessionId(): string; getBranch(): Iterable<unknown>; buildContextEntries?: () => Iterable<unknown> }; cwd?: string; isProjectTrusted?: () => boolean; signal?: AbortSignal; modelRegistry?: unknown };
const sid = (ctx: Ctx) => ctx.sessionManager.getSessionId() ?? "";


export default function (pi: ExtensionAPI, cfgOverride?: AuditConfig) {
	if (!claimAuditProcess()) return;
	// Rendering is optional and independent of whether new audits are enabled.
	pi.registerMessageRenderer?.("jev-todo-audit", (message, { expanded, outputPad }, theme) => {
		if (typeof message.content !== "string") return undefined;
		const content = !expanded && message.content.startsWith("pi-jev-todo-audit | ") && message.content.endsWith(ADVISORY_FOOTER)
			? message.content.slice(0, -ADVISORY_FOOTER.length) : message.content;
		const box = new Box(outputPad, 1, (text) => theme.bg("customMessageBg", text));
		box.addChild(new Text(content, 0, 0));
		return box;
	});
	// Global layer resolved eagerly; project layer merges on first session_start
	// once we can see ctx.cwd + ctx.isProjectTrusted().
	let cfg: AuditConfig = cfgOverride ?? loadConfig({ globalPath: agentConfigPath() });
	pi.registerCommand("jev-audit", {
		description: "Audit now (ignores interval/cooldown; reuses already reviewed results). `full` forces a fresh reassessment.",
		handler: async (args, ctx: ExtensionCommandContext) => {
			if (!cfg.enabled) {
				ctx.ui?.notify?.("Audit is disabled by configuration (enabled: false); no judgment was run.", "info");
				return;
			}
			const mode = (args ?? "").trim();
			if (mode !== "" && mode !== "full") {
				ctx.ui?.notify?.("Usage: /jev-audit [full] — default reviews only new input; full re-evaluates the projected history (tool bodies stay excluded).", "warning");
				return;
			}
			await auditNow(ctx, mode === "full" ? "manual full" : "manual", { full: mode === "full" });
		},
	});
	if (!cfg.enabled) return;

	const counters = new Map<string, LoopCounter>();
	/** Latest judgment state per session, rebuilt from the active branch on reload/compaction/tree navigation. */
	const states = new Map<string, JudgmentState>();
	/** Per-load prefix: the sequence restarts on reload, so ids stay unique within a session branch. */
	const LOAD_ID = randomUUID();
	let auditSeq = 0;
	const append = (pi as { appendEntry?: ExtensionAPI["appendEntry"] }).appendEntry?.bind(pi);
	/** Own ledger/state entries are neither evidence nor a boundary change. */
	const withoutBookkeeping = (entries: Iterable<unknown>) => [...entries].filter((e) => !isOwnBookkeeping(e) && !isStateEntry(e) && !(object(e).type === "custom" && object(e).customType === "llm-as-jev-ledger"));
	const branchIds = (ctx: Ctx) => new Set([...ctx.sessionManager.getBranch()].flatMap((raw) => typeof object(raw).id === "string" ? [object(raw).id as string] : []));
	const restoreMemory = (ctx: Ctx) => { states.set(sid(ctx), restoreState(ctx.sessionManager.getBranch(), branchIds(ctx))); };
	const counterFor = (id: string) => counters.get(id) ?? freshCounter();
	let inFlight = false;
	let projectMerged = false;
	/** Latest ctx seen on session_start — used by the semantic-hook listener. */
	let lastCtx: (Ctx & { ui?: { notify?: (m: string, l?: "error" | "warning" | "info") => void } }) | undefined;
	const sentKeys = new Set<string>();
	const noticeKeys = new Set<string>();
	let warnedBudget = false;
	let lastStopKey = "";
	const contextFor = (ctx: Ctx, apiKey: string, board = replayBoardWithAges(ctx.sessionManager.getBranch())) => {
		const entries = withoutBookkeeping(ctx.sessionManager.buildContextEntries?.() ?? ctx.sessionManager.getBranch());
		const context = collectContext(
			entries,
			visibleTasks(board).map((task) => {
				const origin = board.firstActive.get(task.id);
				const revisions = board.revisions.filter((r) => r.changed.includes(task.id) && (!origin || r.turn >= origin.turn));
				const trajectory = {
					firstActive: origin ? { turn: origin.turn, source: origin.source } : task.status === "in_progress" ? "unknown: not reconstructable from the branch" : "not started",
					revisionCount: revisions.length,
					segments: revisions.slice(-5).map((r) => ({ turn: r.turn, source: r.source })),
				};
				return { id: `task:${task.id}`, value: { ...task, trajectory } };
			}),
			!!ctx.sessionManager.buildContextEntries,
			[apiKey, cfg.apiKey ?? "", process.env[cfg.apiKeyEnvVar] ?? "", ...(cfg.legacySecrets ?? [])],
		);
		// Successful identical TODO snapshots are bookkeeping reads, not a new fact segment.
		const changed = new Set(board.revisions.map((r) => r.source));
		const cited = new Set(Object.values(context.factualMaterial ?? {}).flatMap((m) => [...m.sources, ...m.covers].map((r) => r.id)));
		const noops = new Set(entries.flatMap((raw) => {
			const e = object(raw), m = object(e.message);
			return typeof e.id === "string" && m.role === "toolResult" && m.toolName === "todo" && m.isError !== true &&
				isTaskDetails(m.details) && !changed.has(e.id) && !cited.has(e.id) ? [e.id] : [];
		}));
		const calls = new Set(context.records.filter((r) => noops.has(r.id)).map((r) => r.callId));
		context.records = context.records.filter((r) => !noops.has(r.id) &&
			!(r.kind === "tool_call" && r.toolName === "todo" && calls.has(r.callId) && !cited.has(r.id)));
		return context;
	};
	const evidenceVersionFor = (ctx: Ctx) => digest([...ctx.sessionManager.getBranch()].flatMap((raw) => {
		const e = object(raw), m = e.type === "custom_message" ? e : object(e.message);
		const visibleCustom = m.customType && m.display !== false && m.customType !== "jev-todo-audit";
		if (m.role === "user" || (m.role === "toolResult" && m.toolName !== "todo") ||
			(m.role === "bashExecution" && !m.excludeFromContext) || visibleCustom)
			return [[e.id, m.role, m.customType, m.content, m.command, m.output, m.exitCode, m.isError]];
		return [];
	}));
	/** Entry id of the branch tip when the audit started; used to detect a branch switch. */
	const leafId = (ctx: Ctx) => {
		let id: string | undefined;
		for (const raw of ctx.sessionManager.getBranch()) { const e = object(raw); if (typeof e.id === "string") id = e.id; }
		return id;
	};
	const onSameBranch = (ctx: Ctx, leaf: string | undefined) =>
		leaf === undefined || [...ctx.sessionManager.getBranch()].some((raw) => object(raw).id === leaf);
	const restoreKeys = (ctx: Ctx) => {
		for (const raw of ctx.sessionManager.getBranch()) {
			const e = object(raw), m = e.type === "custom_message" ? e : object(e.message);
			if (m.customType !== "jev-todo-audit") continue;
			for (const key of Array.isArray(m.details?.auditKeys) ? m.details.auditKeys : []) if (typeof key === "string") sentKeys.add(key);
		}
	};
	let pendingStop: { key: string; stop: TerminalStopInfo } | undefined;
	let auditAbort: AbortController | undefined;

	/** Shared audit body: replay board → judge new complete loops against stored state → act on the state verdict. */
	async function auditNow(
		ctx: Ctx & { ui?: { notify?: (m: string, l?: "error" | "warning" | "info") => void } },
		label: string,
		opts: { terminalStop?: TerminalStopInfo; full?: boolean } = {},
	) {
		if (!cfg.enabled || inFlight) return;
		const c = counterFor(sid(ctx));
		inFlight = true;
		const legacySecrets = [cfg.apiKey ?? "", process.env[cfg.apiKeyEnvVar] ?? "", ...(cfg.legacySecrets ?? [])]; // Redaction only, never authentication.
		const ac = new AbortController();
		const onCtxAbort = () => ac.abort();
		if (ctx.signal) {
			if (ctx.signal.aborted) ac.abort();
			else ctx.signal.addEventListener("abort", onCtxAbort, { once: true });
		}
		auditAbort = ac;
		const mySid = sid(ctx);
		try {
			const board = replayBoardWithAges(ctx.sessionManager.getBranch());
			if (opts.terminalStop && unfinishedTasks(board).length === 0) return;
			const startLeaf = leafId(ctx);
			let inputVersion: string | undefined;
			const current = (c: Ctx | undefined) => !!c && !ac.signal.aborted && sid(c) === mySid && onSameBranch(c, startLeaf) &&
				(inputVersion === undefined || contextVersion(contextFor(c, "")) === inputVersion);
			const evidenceVersion = evidenceVersionFor(ctx);
			const service = getJudgmentService();
			if (service?.version !== 1 || typeof service.judge !== "function") {
				const key = `dependency:${mySid}:${service ? "incompatible" : "missing"}`;
				const manual = label === "manual" || label === "manual full";
				if (manual || !noticeKeys.has(key)) {
					ctx.ui?.notify?.("[jev audit] requires pi-llm-as-jev (judgment service version 1); load/update the shared service. Audit skipped; TODO remains available.", manual ? "error" : "warning");
					noticeKeys.add(key);
				}
				return;
			}
			if (ac.signal.aborted) return;
			const context = contextFor(ctx, "", board);
			const branchHistory = collectContext(withoutBookkeeping(ctx.sessionManager.getBranch()), [], true, legacySecrets).records;
			inputVersion = contextVersion(context);
			const loops = groupLoops(context.records);
			const staleIds = staleTaskIds(board, c.totalLoops, cfg.interval, cfg.staleAuditSpans);
			if (!states.has(mySid)) restoreMemory(ctx);
			const before = states.get(mySid) ?? emptyState();
			if (!opts.full && before.minConfidence !== undefined && before.minConfidence !== cfg.confidenceThreshold) {
				ctx.ui?.notify?.("[jev audit] the acceptance threshold changed; /jev-audit full is required before reusing this state for advice.", "warning");
				return;
			}
			// Stamp first-active loops so a later scope change can reset to them.
			const stamped: JudgmentState = { ...before, tasks: { ...before.tasks } };
			for (const task of unfinishedTasks(board)) {
				const source = board.firstActive.get(task.id)?.source;
				const origin = loops.find((loop) => loop.records.some((record) => record.id === source))?.id;
				const prev = stamped.tasks[String(task.id)];
				if (origin && (!prev || !prev.firstActive)) stamped.tasks[String(task.id)] = { ...(prev ?? emptyTask()), firstActive: origin };
			}
			const outcome = await runIncremental({
				service, board, context, branchHistory, state: stamped, timeoutMs: cfg.timeoutMs, signal: ac.signal, secrets: legacySecrets, stop: opts.terminalStop, full: opts.full,
				minConfidence: cfg.confidenceThreshold, isCurrent: () => current(lastCtx ?? ctx),
				persist: (next) => {
					if (!current(lastCtx ?? ctx)) return false;
					if (!writeState(append, next) || !current(lastCtx ?? ctx)) return false;
					states.set(mySid, next);
					return true;
				},
			});
			const sent = outcome.reports.reduce((n, r) => n + (r.reuse?.sent ?? 0), 0);
			if (current(lastCtx)) writeLedger(append, { kind: "diag", diag: diagnose(`${mySid}:${LOAD_ID}:${++auditSeq}`, label, { hits: 0, joined: 0, sent },
				{ from: before.session.cursor ?? null, to: outcome.state.session.cursor ?? null },
				outcome.persistenceFailed || outcome.reports.some((r) => r.outcome === "failed") ? "failed" : !outcome.complete ? "incomplete" : outcome.reports.length === 0 ? "unchanged" : "completed",
				outcome.reports.flatMap((r): Attempt[] => r.outcome === "failed" ? [{ outcome: r.contextOverflow ? "overflow" : "http_error", model: r.model }] : r.usage ? [{ outcome: "answered", model: r.model, inputTokens: r.usage.input, outputTokens: r.usage.output }] : []),
				{ ...(outcome.capacity ? { channel: `${outcome.capacity.backend}:${outcome.capacity.model}` } : {}) }) });
			if (!current(lastCtx ?? ctx)) return;

			if (outcome.missingCapacityMetadata) {
				const key = `capacity:${mySid}:${outcome.capacity?.model ?? "unknown"}`;
				if (!noticeKeys.has(key)) { ctx.ui?.notify?.(`[jev audit] no declared capacity for ${outcome.capacity?.model ?? "the selected judgment model"}; segments are bounded by loop count, not tokens. Configure contextLimits in pi-llm-as-jev.`, "warning"); noticeKeys.add(key); }
			}
			const oversize = outcome.reports.find((r) => r.outcome === "oversize");
			if (oversize) {
				const key = digest([mySid, "oversize-loop", oversize.loops]);
				if (!sentKeys.has(key)) {
					const text = `Loop ${oversize.loops[0]} plus the required state exceeds the judgment model's capacity. It was not sliced; judgment for ${oversize.scopes.join(", ")} stops before it.\n${BRIEF_GUIDANCE}\nNo completion, continuation or task-status judgment is made past this loop.`;
					pi.sendMessage({ customType: "jev-todo-audit", content: redact(formatAdvisory("OVERSIZE LOOP", text), legacySecrets), display: true, details: { auditKeys: [key] } }, { deliverAs: "steer" });
					sentKeys.add(key);
				}
			}
			const failed = outcome.reports.find((r) => r.outcome === "failed");
			if (failed || outcome.persistenceFailed) {
				ctx.ui?.notify?.(`[jev audit ${label}] failed: ${redact(failed?.error ?? "state persistence failed", legacySecrets)}`, "warning");
				return;
			}
			if (outcome.reports.some((r) => r.contextOverflow)) ctx.ui?.notify?.(`[jev audit ${label}] context overflow recovered by dropping trailing loops`, "info");

			if (outcome.state.minConfidence !== cfg.confidenceThreshold) {
				ctx.ui?.notify?.("[jev audit] stored state used a different acceptance threshold; run /jev-audit full before using it for advice.", "warning");
				return;
			}
			restoreKeys(ctx);
			const answers = answersFromState(outcome.state, board, outcome.tip);
			const supportIds = new Set([answers.work_evidence?.choice, ...Object.values(answers.evidence ?? {}).map((x) => x.choice), ...Object.values(answers.granularityEvidence ?? {}).map((x) => x.choice)]);
			const visible = new Set(context.records.map((record) => record.id));
			const verdictContext = { ...context, records: [...context.records, ...branchHistory.filter((record) => supportIds.has(record.id) && !visible.has(record.id))] };
			const action = decide(answers, board, cfg.confidenceThreshold, c.totalLoops, staleIds,
				{ serviceAccepted: true, terminalStop: !!opts.terminalStop, context: verdictContext, suppressed: sentKeys, scopeKey: mySid, evidenceVersion });
			if (action.kind === "notify") {
				const key = digest([mySid, evidenceVersion, action.text]);
				if (!noticeKeys.has(key)) { ctx.ui?.notify?.(redact(action.text, legacySecrets), "info"); noticeKeys.add(key); }
			} else if (action.kind === "inject") {
				if (!current(lastCtx ?? ctx)) return;
				const auditKeys = action.corrections.map((item) => item.key);
				pi.sendMessage(
					{ customType: "jev-todo-audit", content: redact(formatAdvisory(`review ${label}`, action.text), legacySecrets), display: true, details: { auditKeys } },
					opts.terminalStop && action.mayWake ? { deliverAs: "steer", triggerTurn: true } : { deliverAs: "steer" },
				);
				for (const key of auditKeys) sentKeys.add(key);
			} else if (cfg.notifyOnAligned && answers.alignment?.choice === "aligned") {
				ctx.ui?.notify?.(`[jev audit ${label}] board aligned ✓`, "info");
			}
		} catch (err) {
			if (!ac.signal.aborted) {
				ctx.ui?.notify?.(`[jev audit ${label}] error: ${redact(err instanceof Error ? err.message : String(err), legacySecrets)}`, "warning");
			}
		} finally {
			ctx.signal?.removeEventListener("abort", onCtxAbort);
			inFlight = false;
			if (auditAbort === ac) auditAbort = undefined;
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
		const legacyFields = cfg.legacyFields ?? (cfgOverride ? ["model", "apiUrl", "apiKey", "apiKeyEnvVar", "contextLimits"].filter((key) => Object.hasOwn(cfgOverride, key)) : []);
		if (legacyFields.length) ctx.ui?.notify?.(`[jev-todo-audit] ignored legacy fields: ${legacyFields.join(", ")}. Configure models/limits in pi-llm-as-jev and credentials/endpoints in Pi.`, "warning");
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
		states.delete(sid(ctx));
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
			const key = digest([sid(lastCtx), contextVersion(contextFor(lastCtx, "", board))]);
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
}
