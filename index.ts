/**
 * jev-todo-audit — Pi extension.
 *
 * Every `interval` completed agent loops, replays the rpiv-todo board from the
 * session branch, asks the jev model (TypeSafe Choice) whether the board
 * matches what the agent is actually doing, and injects a corrective custom
 * message when it does not. Purely advisory: failures never touch the loop.
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { loadConfig, resolveApiKey, type AuditConfig } from "./config.js";
import { replayBoard } from "./board.js";
import { freshCounter, onTurnEnd, onUserMessage, replayCounter, shouldAudit, type LoopCounter } from "./counter.js";
import { buildAuditRequest, runAudit } from "./typesafe.js";
import { decide } from "./verdict.js";

type Ctx = { sessionManager: { getSessionId(): string; getBranch(): Iterable<unknown> } };
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
	const cfg: AuditConfig = cfgOverride ?? loadConfig();
	if (!cfg.enabled) return;

	const counters = new Map<string, LoopCounter>();
	const counterFor = (id: string) => counters.get(id) ?? freshCounter();
	let inFlight = false;

	/** Shared audit body: replay board → call jev → act on verdict. */
	async function auditNow(ctx: Ctx & { ui?: { notify?: (m: string, l?: "error" | "warning" | "info") => void } }, label: string) {
		if (inFlight) return;
		const apiKey = resolveApiKey(cfg);
		if (!apiKey) {
			ctx.ui?.notify?.(`[jev audit] no API key: set ${cfg.apiKeyEnvVar} or apiKey in ~/.config/jev-todo-audit/config.json`, "warning");
			return;
		}
		const c = counterFor(sid(ctx));
		inFlight = true;
		try {
			const board = replayBoard(ctx.sessionManager.getBranch());
			const req = buildAuditRequest(board, recentActivity(ctx, cfg.activityBudgetChars), cfg.model);
			const res = await runAudit(req, { apiUrl: cfg.apiUrl, apiKey, timeoutMs: cfg.timeoutMs });

			if (!res.ok) {
				ctx.ui?.notify?.(`[jev audit ${label}] failed: ${res.error}`, "warning");
				return;
			}

			const action = decide(res.answers, board, cfg.confidenceThreshold, c.totalLoops);
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
		}
	}

	pi.on("session_start", async (_e, ctx) => {
		counters.set(sid(ctx), replayCounter(ctx.sessionManager.getBranch()));
		// Background audit is useless without a key — warn once at session start.
		if (!resolveApiKey(cfg)) {
			ctx.ui?.notify?.(`[jev-todo-audit] no API key: set ${cfg.apiKeyEnvVar} or apiKey in ~/.config/jev-todo-audit/config.json`, "warning");
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

	pi.registerCommand("jev-audit", {
		description: "Manually trigger a jev todo-board audit right now (ignores interval/cooldown)",
		handler: async (_args, ctx: ExtensionCommandContext) => {
			await auditNow(ctx, "manual");
		},
	});
}
