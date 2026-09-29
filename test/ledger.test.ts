/** Non-context persistence and replay of evaluation answers and receipts. */
import { beforeEach, expect, test } from "bun:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import makeExtension from "../index.js";
import { DEFAULT_CONFIG } from "../config.js";
import { collectContext } from "../context.js";
import { LEDGER_TYPE, restoreLedger, writeLedger } from "../ledger.js";
import { newEvaluationCache, type AuditRequest } from "../typesafe.js";

let requests: AuditRequest[] = [];
beforeEach(() => {
	requests = [];
	process.env.JEV_LEDGER_KEY = "sk-ledger-test";
	globalThis.fetch = (async (_u: unknown, init: any) => {
		const req = JSON.parse(init.body) as AuditRequest; requests.push(req);
		const answers = Object.fromEntries(Object.entries(req.questions).map(([k, q]) => [k, { choice: Object.keys(q.criteria).includes("unclear") ? "unclear" : Object.keys(q.criteria)[0], confidence: 0.9 }]));
		return new Response(JSON.stringify({ answers, model: "jev-1.13", usage: { input_tokens: 50 } }));
	}) as unknown as typeof fetch;
});
const user = (id: string, text: string) => ({ id, type: "message", message: { role: "user", content: text } });
const board = { id: "board", type: "message", message: { role: "toolResult", toolName: "todo", content: "ok", details: { tasks: [{ id: 5, subject: "Parser", status: "in_progress" }], nextId: 6 } } };
function host(branch: unknown[], opts: { appendThrows?: boolean; context?: () => unknown[] } = {}) {
	const handlers = new Map<string, any[]>(), commands = new Map<string, any>(), sent: unknown[] = [];
	const pi = {
		on: (n: string, h: any) => handlers.set(n, [...(handlers.get(n) ?? []), h]),
		registerCommand: (n: string, c: any) => commands.set(n, c),
		sendMessage: (m: unknown) => sent.push(m),
		appendEntry: (customType: string, data: unknown) => { if (opts.appendThrows) throw new Error("disk full"); branch.push({ id: `c${branch.length}`, type: "custom", customType, data }); },
		events: { on: () => () => {} },
	} as unknown as ExtensionAPI;
	const ctx = { sessionManager: { getSessionId: () => "s", getBranch: () => branch, buildContextEntries: opts.context ?? (() => branch) }, ui: { notify: () => {} } };
	makeExtension(pi, { ...DEFAULT_CONFIG, apiKeyEnvVar: "JEV_LEDGER_KEY" });
	const emit = async (n: string) => { for (const h of handlers.get(n) ?? []) await h({}, ctx); };
	return { emit, sent, manual: () => commands.get("jev-audit").handler("", ctx) as Promise<void> };
}

test("answers persist as non-context custom entries and survive reload without new provider work", async () => {
	const branch: unknown[] = [user("u", "Work on parser.ts"), board];
	const h = host(branch); await h.emit("session_start"); await h.manual();
	expect(requests).toHaveLength(1);
	const ledger = branch.filter((e: any) => e.type === "custom" && e.customType === LEDGER_TYPE);
	expect(ledger.map((e: any) => e.data.kind)).toEqual(["eval", "receipt", "diag"]);
	expect(JSON.stringify(ledger)).not.toContain("Work on parser.ts"); // answers, progress and accounting only, no transcript
	expect(JSON.stringify(ledger)).not.toContain("sk-ledger-test");
	const diag = (ledger.at(-1) as any).data.diag;
	expect(diag).toMatchObject({ label: "manual", hits: 0, outcome: "completed", range: { from: null, to: "board" } }); expect(diag.misses).toBeGreaterThan(0);
	expect(diag.attempts).toHaveLength(1);
	expect(diag.attempts[0]).toMatchObject({ outcome: "answered", model: "jev-1.13", inputTokens: 50, outputTokens: "unknown" });
	expect(diag.attempts[0].stateBytes).toBeGreaterThan(0); expect(diag.attempts[0].questionBytes).toBeGreaterThan(0);
	expect(diag.usage).toEqual({ inputTokens: 50, outputTokens: "unknown" }); // missing usage is explicit, never zero
	// Own bookkeeping is not evidence and does not invalidate the input identity.
	expect(collectContext(branch).omissions.some((o) => o.reason === "private extension state")).toBe(true);
	await h.manual(); expect(requests).toHaveLength(1);
	const repeat = (branch.at(-1) as any).data.diag; // a cache hit costs no new provider attempt and no re-counted usage
	expect(repeat).toMatchObject({ outcome: "unchanged", misses: 0, attempts: [], usage: { inputTokens: 0, outputTokens: 0 } });
	const reloaded = host(branch); await reloaded.emit("session_start"); await reloaded.manual();
	expect(requests).toHaveLength(1);
});

test("compaction restores stored results from the branch when the raw context is replaced", async () => {
	const branch: unknown[] = [user("u", "Work on parser.ts"), board];
	const h = host(branch); await h.emit("session_start"); await h.manual(); expect(requests).toHaveLength(1);
	const fresh = host(branch); await fresh.emit("session_compact"); await fresh.manual();
	expect(requests).toHaveLength(1);
});

test("abandoned-branch records are not restored into the active history", async () => {
	const abandoned: unknown[] = [user("u", "Work on parser.ts"), board];
	const h = host(abandoned); await h.emit("session_start"); await h.manual(); expect(requests).toHaveLength(1);
	const active: unknown[] = [user("u", "Work on parser.ts"), board];
	const other = host(active); await other.emit("session_tree"); await other.manual();
	expect(requests).toHaveLength(2);
});

test("a failed write is not reported as durable, and the audit still completes", async () => {
	const branch: unknown[] = [user("u", "Work on parser.ts"), board];
	expect(writeLedger(() => { throw new Error("disk full"); }, { kind: "eval", answers: {} })).toBe(false);
	expect(writeLedger(undefined, { kind: "eval", answers: {} })).toBe(false);
	const h = host(branch, { appendThrows: true }); await h.emit("session_start"); await h.manual();
	expect(requests).toHaveLength(1); expect(branch.some((e: any) => e.type === "custom")).toBe(false);
	const reloaded = host(branch); await reloaded.emit("session_start"); await reloaded.manual();
	expect(requests).toHaveLength(2); // nothing durable to restore
});

test("receipts restore only when their required answers are also recorded; the latest valid one wins", () => {
	const cache = newEvaluationCache();
	const entry = (data: unknown) => ({ type: "custom", customType: LEDGER_TYPE, data });
	const opinions = { task_status_5: { choice: "appropriate", confidence: 0.8 } };
	const latest = restoreLedger([
		entry({ kind: "eval", answers: { k1: { choice: "a", confidence: 0.8 }, bad: { choice: "a", confidence: 3 } } }),
		entry({ kind: "receipt", receipt: { through: "e9", inputKey: "i1", opinions, answerKeys: ["k1"] } }),
		entry({ kind: "receipt", receipt: { through: "e20", inputKey: "i2", opinions, answerKeys: ["k1", "missing"] } }),
		{ type: "custom", customType: "someone-else", data: { kind: "eval", answers: { k9: { choice: "a", confidence: 1 } } } },
	], cache);
	expect([...cache.answers.keys()]).toEqual(["k1"]);
	expect(latest?.through).toBe("e9");
});

test("a main-agent rebuttal is new input that is re-evaluated; unanswered advice alone is not", async () => {
	const branch: unknown[] = [user("u", "Analyse caching strategies; analysis only."), board,
		{ id: "a1", type: "message", message: { role: "assistant", content: "Strategy comparison, part one." } }];
	const h = host(branch); await h.emit("session_start"); await h.manual();
	expect(requests).toHaveLength(1);
	branch.push({ id: "jev", type: "custom_message", customType: "jev-todo-audit", display: true, content: "[jev audit] split #5?" });
	await h.manual(); expect(requests).toHaveLength(1);
	branch.push({ id: "reply", type: "message", message: { role: "assistant", content: "Rebuttal: #5 is one coherent comparison; no split." } });
	await h.manual(); expect(requests).toHaveLength(2);
	expect(requests[1].state).toContain("Rebuttal: #5 is one coherent comparison"); expect(requests[1].state).toContain("split #5?");
});

test("recovered overflow diagnostics separate the rejected attempt, successful parts and final success", async () => {
	const ok = globalThis.fetch; let first = true;
	globalThis.fetch = (async (u: unknown, init: any) => {
		if (first) { first = false; requests.push(JSON.parse(init.body)); return new Response(JSON.stringify({ error: { code: "context_length_exceeded", message: "too long" } }), { status: 400 }); }
		return ok(u as any, init);
	}) as unknown as typeof fetch;
	const branch: unknown[] = [user("u", "Work on parser.ts"), user("u2", "Also keep the API stable"), board];
	const h = host(branch); await h.emit("session_start"); await h.manual();
	const diag = (branch.filter((e: any) => e.customType === LEDGER_TYPE && e.data.kind === "diag").at(-1) as any).data.diag;
	expect(diag.outcome).toBe("recovered");
	expect(diag.attempts[0]).toMatchObject({ outcome: "overflow", status: 400, inputTokens: "unknown" });
	expect(diag.attempts.slice(1).every((a: any) => a.outcome === "answered")).toBe(true); expect(diag.attempts.length).toBeGreaterThan(2);
	expect(diag.usage.inputTokens).toBe("unknown"); // one attempt lacks usage, so no complete total is claimed
});

test("a receipt's oversized list survives reload; malformed lists are dropped", () => {
	const cache = newEvaluationCache(); cache.answers.set("k1", { choice: "a", confidence: 0.9 });
	const entry = (receipt: unknown) => ({ type: "custom", customType: LEDGER_TYPE, data: { kind: "receipt", receipt } });
	const base = { through: "u", inputKey: "i", opinions: {}, answerKeys: [] };
	expect(restoreLedger([entry({ ...base, oversized: ["huge"] })], cache)?.oversized).toEqual(["huge"]);
	expect(restoreLedger([entry({ ...base, oversized: [3] })], cache)?.oversized).toBeUndefined();
});

test("audit diagnostic ids stay unique across a reload of the same session", async () => {
	const branch: unknown[] = [user("u", "Work on parser.ts"), board];
	// Freeze Date.now across both loads: a timestamp-based id would collide on reload; the uuid-based id must not.
	const realNow = Date.now;
	Date.now = () => 1700000000000;
	try {
		const h = host(branch); await h.emit("session_start"); await h.manual();
		const reloaded = host(branch); await reloaded.emit("session_start"); await reloaded.manual();
	} finally { Date.now = realNow; }
	const ids = branch.filter((e: any) => e.customType === LEDGER_TYPE && e.data.kind === "diag").map((e: any) => e.data.diag.audit);
	expect(ids).toHaveLength(2); expect(new Set(ids).size).toBe(2);
});
