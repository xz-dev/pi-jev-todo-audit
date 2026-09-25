/**
 * jev-todo-audit — Pi extension.
 *
 * Every `interval` completed agent loops, replays the rpiv-todo board from the
 * session branch, asks the jev model (TypeSafe Choice) whether the board
 * matches what the agent is actually doing, and injects a corrective custom
 * message when it does not. Purely advisory: failures never touch the loop.
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { existsSync } from "node:fs";
import { agentConfigPath, legacyConfigPath, loadConfig, projectConfigPath, resolveApiKey, type AuditConfig } from "./config.js";
import { replayBoardWithAges, staleTaskIds, unfinishedTasks } from "./board.js";
import { freshCounter, onTurnEnd, onUserMessage, replayCounter, shouldAudit, type LoopCounter } from "./counter.js";
import { buildAuditRequest, runAudit, type TerminalStopInfo } from "./typesafe.js";
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

type Ctx = { sessionManager: { getSessionId(): string; getBranch(): Iterable<unknown> }; cwd?: string; isProjectTrusted?: () => boolean };
const sid = (ctx: Ctx) => ctx.sessionManager.getSessionId() ?? "";

interface BranchMsg {
	role?: string;
	content?: unknown;
	toolCalls?: unknown[];
}

/** Compact digest of recent assistant text + tool calls for jev's `state`. */
function recentActivity(ctx: Ctx, budget: number): string {
	const parts: string[] = [];
	for (const entry of ctx.sessionManager.getBranch()) {
		const e = entry as { type?: string; message?: BranchMsg };
		if (e.type !== "message" || !e.message) continue;
		const m = e.message;
		if (m.role === "assistant") {
			const text = Array.isArray(m.content)
				? (m.content as { type?: string; text?: string }[]).filter((c) => c.type === "text").map((c) => c.text).join(" ")
				: typeof m.content === "string" ? m.content : "";
			const tools = Array.isArray(m.toolCalls)
				? (m.toolCalls as { name?: string }[]).map((t) => t.name).filter(Boolean).join(", ")
				: "";
			const line = [text.trim(), tools && `[tools: ${tools}]`].filter(Boolean).join(" ");
			if (line) parts.push(line);
		} else if (m.role === "user") {
			const text = Array.isArray(m.content)
				? (m.content as { type?: string; text?: string }[]).filter((c) => c.type === "text").map((c) => c.text).join(" ")
				: typeof m.content === "string" ? m.content : "";
			if (text.trim()) parts.push(`USER: ${text.trim()}`);
		}
	}
	let out = parts.slice(-20).join("\n");
	if (out.length > budget) out = `…${out.slice(out.length - budget)}`;
	return out;
}

export default function (pi: ExtensionAPI, cfgOverride?: AuditConfig) {
	// Global layer resolved eagerly; project layer merges on first session_start
	// once we can see ctx.cwd + ctx.isProjectTrusted().
	let cfg: AuditConfig = cfgOverride ?? loadConfig({ globalPath: agentConfigPath() });
	if (!cfg.enabled) return;

	const counters = new Map<string, LoopCounter>();
	const counterFor = (id: string) => counters.get(id) ?? freshCounter();
	let inFlight = false;
	let projectMerged = false;
	/** Latest ctx seen on session_start — used by the semantic-hook listener. */
	let lastCtx: (Ctx & { ui?: { notify?: (m: string, l?: "error" | "warning" | "info") => void } }) | undefined;
	/** Envelope identity + stop-epoch dedup for terminal-stop audits. */
	const seenEnvelopes = new WeakSet<object>();
	let lastStopKey = "";
	/** Single-level queue: newest distinct stop epoch seen while an audit ran. */
	let pendingStop: { key: string; stop: TerminalStopInfo } | undefined;

	/** Shared audit body: replay board → call jev → act on verdict. */
	async function auditNow(
		ctx: Ctx & { ui?: { notify?: (m: string, l?: "error" | "warning" | "info") => void } },
		label: string,
		opts: { terminalStop?: TerminalStopInfo } = {},
	) {
		if (inFlight) return;
		const apiKey = resolveApiKey(cfg);
		if (!apiKey) {
			ctx.ui?.notify?.(`[jev audit] no API key: set ${cfg.apiKeyEnvVar} or apiKey in ${agentConfigPath()}`, "warning");
			return;
		}
		const c = counterFor(sid(ctx));
		inFlight = true;
		try {
			const board = replayBoardWithAges(ctx.sessionManager.getBranch());
			// Terminal-stop short-circuit: nothing unfinished → nothing to check.
			if (opts.terminalStop && unfinishedTasks(board).length === 0) return;
			const req = buildAuditRequest(board, recentActivity(ctx, cfg.activityBudgetChars), cfg.model, opts.terminalStop);
			const res = await runAudit(req, { apiUrl: cfg.apiUrl, apiKey, timeoutMs: cfg.timeoutMs });

			if (!res.ok) {
				ctx.ui?.notify?.(`[jev audit ${label}] failed: ${res.error}`, "warning");
				return;
			}

			const staleIds = staleTaskIds(board, c.totalLoops, cfg.interval, cfg.staleAuditSpans);
			const action = decide(res.answers, board, cfg.confidenceThreshold, c.totalLoops, staleIds, { terminalStop: !!opts.terminalStop });
			if (action.kind === "notify") {
				ctx.ui?.notify?.(action.text, "info");
			} else if (action.kind === "inject") {
				// steer > followUp: lands at the next turn boundary of the running
				// loop instead of waiting for the run to settle.
				pi.sendMessage(
					{ customType: "jev-todo-audit", content: action.text, display: true },
					{ deliverAs: "steer" },
				);
				if (cfg.notifyOnAligned === false) {
					ctx.ui?.notify?.(`[jev audit ${label}] correction injected`, "info");
				}
			} else if (cfg.notifyOnAligned) {
				ctx.ui?.notify?.(`[jev audit ${label}] board aligned ✓`, "info");
			}
		} catch (err) {
			ctx.ui?.notify?.(`[jev audit ${label}] error: ${err instanceof Error ? err.message : String(err)}`, "warning");
		} finally {
			inFlight = false;
			// A distinct stop epoch arrived while we were auditing → one follow-up.
			if (pendingStop && lastCtx) {
				const { key, stop } = pendingStop;
				pendingStop = undefined;
				lastStopKey = key;
				void auditNow(lastCtx, "terminal-stop", { terminalStop: stop });
			}
		}
	}

	pi.on("session_start", async (_e, ctx) => {
		lastCtx = ctx;
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
		counters.set(sid(ctx), replayCounter(ctx.sessionManager.getBranch()));
		// Background audit is useless without a key — warn once at session start.
		if (!resolveApiKey(cfg)) {
			ctx.ui?.notify?.(`[jev-todo-audit] no API key: set ${cfg.apiKeyEnvVar} or apiKey in ${agentConfigPath()}`, "warning");
		}
	});
	pi.on("session_compact", async (_e, ctx) => {
		counters.set(sid(ctx), replayCounter(ctx.sessionManager.getBranch()));
	});
	pi.on("session_tree", async (_e, ctx) => {
		counters.set(sid(ctx), replayCounter(ctx.sessionManager.getBranch()));
	});
	pi.on("session_shutdown", async (_e, ctx) => {
		counters.delete(sid(ctx));
		if (lastCtx && sid(lastCtx) === sid(ctx)) {
			lastCtx = undefined;
			pendingStop = undefined;
		}
	});

	// A finalized user message (prompt or steer) resets the cooldown window.
	pi.on("message_end", async (event, ctx) => {
		if (event.message.role !== "user") return;
		onUserMessage(counterFor(sid(ctx)));
	});

	pi.on("turn_end", async (_e, ctx) => {
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
			if (!stop || !lastCtx) return;
			// Dedup: same envelope object or same stop epoch (kind+reason).
			if (typeof data === "object" && data !== null) {
				if (seenEnvelopes.has(data)) return;
				seenEnvelopes.add(data);
			}
			const key = `${sid(lastCtx)}|${stop.stopKind}|${stop.reasonType ?? ""}|${stop.reason ?? ""}`;
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
		description: "Manually trigger a jev todo-board audit right now (ignores interval/cooldown)",
		handler: async (_args, ctx: ExtensionCommandContext) => {
			await auditNow(ctx, "manual");
		},
	});
}
