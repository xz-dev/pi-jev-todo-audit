/** Business ledger at the public review port; paid reuse is verified by the real-wire suites. */
import { afterEach, beforeEach, expect, test } from "bun:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import makeExtension from "../index.js";
import { DEFAULT_CONFIG } from "../config.js";
import { collectContext } from "../context.js";
import { LEDGER_TYPE, restoreLedger, writeLedger } from "../ledger.js";
import type { JudgeRequest, ReviewOptions, ReviewResult, ReviewAttemptObservation } from "../judgment-client.js";

const key = Symbol.for("pi-llm-as-jev:service"), globals = globalThis as Record<symbol, unknown>;
let previous: unknown, owner: string | undefined, oldKey: string | undefined, fetch: typeof globalThis.fetch;
let calls: { request: JudgeRequest; options: ReviewOptions }[];
let errors: string[], http: number;
// Explicit service replies, not a cache: tests set each next reply themselves.
let reply: "sent" | "reused" | "recovered", durable: boolean;
const choices: Record<string, string> = { alignment: "aligned", current_match: "5", drift: "on_track", interaction: "waiting_user", task_status_5: "still_ongoing", task_evidence_5: "u", task_board_5: "accurate", task_granularity_5: "appropriate", work_evidence: "u" };
beforeEach(() => {
	previous = globals[key]; owner = process.env.PI_JEV_TODO_AUDIT_OWNER_PID; oldKey = process.env.JEV_LEDGER_KEY; fetch = globalThis.fetch;
	process.env.PI_JEV_TODO_AUDIT_OWNER_PID = String(process.pid); process.env.JEV_LEDGER_KEY = "sk-ledger-test";
	calls = []; errors = []; http = 0; reply = "sent"; durable = true;
	globalThis.fetch = (() => { http++; throw new Error("Consumer HTTP forbidden"); }) as unknown as typeof fetch;
	globals[key] = { version: 1, reviewVersion: 1, review: async (request: JudgeRequest, options: ReviewOptions): Promise<ReviewResult> => {
		calls.push({ request: structuredClone(request), options });
		const projected = options.projectStage!({ evidence: request.evidence!.map((record) => ({ record })), completed: [], previousAnswers: {}, final: true });
		const answers = Object.fromEntries(Object.entries(projected.questions).map(([id, q]) => {
			const choice = choices[id];
			if (q.type !== "choice" || !choice || !Object.hasOwn(q.criteria, choice)) { errors.push(`Unscripted ${id}`); throw new Error(`Unscripted ${id}`); }
			return [id, { type: "choice" as const, choice, confidence: 0.9, probabilities: Object.fromEntries(Object.keys(q.criteria).map((label) => [label, label === choice ? 1 : 0])) }];
		}));
		const answered = (ordinal: number): ReviewAttemptObservation => ({ id: `script-${calls.length}#${ordinal}`, ordinal, phase: "end", outcome: "response", status: 200, model: "jev-1.13", inputTokens: 50, stateBytes: 1234, questionBytes: 567, longestQuestionBytes: 120 });
		const attempts: ReviewAttemptObservation[] = reply === "reused" ? [] : reply === "sent" ? [answered(1)] : [
			{ id: `script-${calls.length}#1`, ordinal: 1, phase: "end", outcome: "response", status: 400, errorCategory: "overflow" }, answered(2), answered(3),
		];
		const stage = { final: true, checkpoint: String(calls.length).padStart(64, "0"), sources: request.evidence!.map(({ id }) => ({ id })), evidenceIds: request.evidence!.map(({ id }) => id), opinions: answers, durable };
		options.onProgress!(stage);
		return { answers, dropped: [], backend: "classifier", model: "scripted/service", stopReason: "stop", unresolved: [], progress: { stages: [stage] },
			reuse: reply === "reused" ? { hits: 9, joined: 0, sent: 0 } : { hits: 0, joined: 0, sent: 9 },
			diagnostics: { attempts, attemptCount: attempts.length, observationCoverage: "complete", usage: {
				inputTokens: { knownSum: reply === "reused" ? 0 : reply === "sent" ? 50 : 100, missing: reply === "recovered" ? 1 : 0 },
				outputTokens: { knownSum: 0, missing: attempts.length }, costUsd: { knownSum: 0, missing: attempts.length },
			} } };
	} };
});
afterEach(() => {
	if (previous === undefined) delete globals[key]; else globals[key] = previous;
	if (owner === undefined) delete process.env.PI_JEV_TODO_AUDIT_OWNER_PID; else process.env.PI_JEV_TODO_AUDIT_OWNER_PID = owner;
	if (oldKey === undefined) delete process.env.JEV_LEDGER_KEY; else process.env.JEV_LEDGER_KEY = oldKey;
	globalThis.fetch = fetch;
	expect(errors).toEqual([]); expect(http).toBe(0); // Audit isolation must not hide a broken fixture.
});
const user = (id: string, text: string) => ({ id, type: "message", message: { role: "user", content: text } });
const board = { id: "board", type: "message", message: { role: "toolResult", toolName: "todo", content: "ok", details: { tasks: [{ id: 5, subject: "Parser", status: "in_progress" }], nextId: 6 } } };
function host(branch: unknown[], opts: { appendThrows?: boolean; context?: () => unknown[] } = {}) {
	const handlers = new Map<string, any[]>(), commands = new Map<string, any>(), sent: unknown[] = [];
	const pi = {
		on: (n: string, h: any) => handlers.set(n, [...(handlers.get(n) ?? []), h]),
		registerCommand: (n: string, c: any) => commands.set(n, c), sendMessage: (m: unknown) => sent.push(m),
		appendEntry: (customType: string, data: unknown) => { if (opts.appendThrows) throw new Error("disk full"); branch.push({ id: `c${branch.length}`, type: "custom", customType, data }); },
		events: { on: () => () => {} },
	} as unknown as ExtensionAPI;
	const ctx = { sessionManager: { getSessionId: () => "s", getBranch: () => branch, buildContextEntries: opts.context ?? (() => branch) }, ui: { notify: () => {} } };
	makeExtension(pi, { ...DEFAULT_CONFIG, apiKeyEnvVar: "JEV_LEDGER_KEY" });
	const emit = async (n: string) => { for (const h of handlers.get(n) ?? []) await h({}, ctx); };
	return { emit, sent, manual: () => commands.get("jev-audit").handler("", ctx) as Promise<void> };
}
const records = (branch: unknown[]) => branch.filter((e: any) => e.type === "custom" && e.customType === LEDGER_TYPE) as any[];

test("business receipts/diagnostics are non-context; shared-service reuse is not charged again", async () => {
	const branch: unknown[] = [user("u", "Work on parser.ts"), board];
	const h = host(branch); await h.emit("session_start"); await h.manual();
	expect(calls).toHaveLength(1);
	const ledger = records(branch);
	expect(ledger.map((e) => e.data.kind)).toEqual(["receipt", "diag"]); // raw answers belong to the service, never an audit eval cache
	expect(JSON.stringify(ledger)).not.toContain("Work on parser.ts"); expect(JSON.stringify(ledger)).not.toContain("sk-ledger-test");
	const diag = ledger.at(-1).data.diag;
	expect(diag).toMatchObject({ label: "manual", hits: 0, outcome: "completed", range: { from: null, to: "board" } }); expect(diag.misses).toBeGreaterThan(0);
	expect(diag.attempts).toHaveLength(1);
	expect(diag.attempts[0]).toMatchObject({ id: "script-1#1", outcome: "answered", model: "jev-1.13", inputTokens: 50, outputTokens: "unknown", stateBytes: 1234, questionBytes: 567 });
	expect(diag.usage).toEqual({ inputTokens: 50, outputTokens: 0, unreported: { outputTokens: 1 } });
	expect(collectContext(branch).omissions.some((o) => o.reason === "private extension state")).toBe(true);
	reply = "reused";
	await h.manual(); expect(calls).toHaveLength(2); expect(calls[1].request).toEqual(calls[0].request);
	expect(records(branch).at(-1).data.diag).toMatchObject({ outcome: "unchanged", misses: 0, attempts: [], usage: { inputTokens: 0, outputTokens: 0 } });
	const reloaded = host(branch); await reloaded.emit("session_start"); await reloaded.manual();
	expect(calls).toHaveLength(3); expect(calls[2].request).toEqual(calls[0].request);
	// R07 actual entry trace independently counts transport and checks ledger privacy.
});

test("compaction lifecycle restores business input without treating ledger entries as facts", async () => {
	const branch: unknown[] = [user("u", "Work on parser.ts"), board];
	const h = host(branch); await h.emit("session_start"); await h.manual();
	reply = "reused";
	const fresh = host(branch); await fresh.emit("session_compact"); await fresh.manual();
	expect(calls).toHaveLength(2); expect(calls[1].request).toEqual(calls[0].request);
	expect(records(branch).at(-1).data.diag.range).toEqual({ from: "board", to: "board" });
	// R08 proves zero new sends; R02 separately checks genuinely replaced/unknown sources.
});

test("abandoned-branch business receipts are not restored into the active history", async () => {
	const abandoned: unknown[] = [user("u", "Work on parser.ts"), board];
	const h = host(abandoned); await h.emit("session_start"); await h.manual();
	const active: unknown[] = [user("u", "Work on parser.ts"), board];
	const other = host(active); await other.emit("session_tree"); await other.manual();
	expect(calls).toHaveLength(2); expect(calls[1].options.checkpoint).toBeUndefined();
	expect(records(active).at(-1).data.diag.range).toEqual({ from: null, to: "board" });
	// R09 actual wire case verifies the service also cannot borrow abandoned judgments.
});

test("a failed business write is not durable and does not prevent the next review", async () => {
	const branch: unknown[] = [user("u", "Work on parser.ts"), board];
	expect(writeLedger(() => { throw new Error("disk full"); }, { kind: "eval", answers: {} })).toBe(false);
	expect(writeLedger(undefined, { kind: "eval", answers: {} })).toBe(false);
	const h = host(branch, { appendThrows: true }); await h.emit("session_start"); await h.manual();
	expect(calls).toHaveLength(1); expect(branch.some((e: any) => e.type === "custom")).toBe(false);
	const reloaded = host(branch); await reloaded.emit("session_start"); await reloaded.manual();
	expect(calls).toHaveLength(2); expect(calls[1].options.checkpoint).toBeUndefined();
	expect(calls[1].request).toEqual(calls[0].request);
});

test("volatile service progress cannot advance the business receipt", async () => {
	durable = false;
	const branch: unknown[] = [user("u", "Work on parser.ts"), board];
	const h = host(branch); await h.emit("session_start"); await h.manual();
	expect(calls).toHaveLength(1);
	expect(records(branch).some((e) => e.data.kind === "receipt")).toBe(false);
	expect(records(branch).at(-1).data.diag.range).toEqual({ from: null, to: null });
});

test("receipts restore only when their required answers are also recorded; the latest valid one wins", () => {
	const entry = (data: unknown) => ({ type: "custom", customType: LEDGER_TYPE, data });
	const opinions = { task_status_5: { choice: "appropriate", confidence: 0.8 } };
	const latest = restoreLedger([
		entry({ kind: "eval", answers: { k1: { choice: "a", confidence: 0.8 }, bad: { choice: "a", confidence: 3 } } }),
		entry({ kind: "receipt", receipt: { through: "e9", inputKey: "i1", opinions, answerKeys: ["k1"] } }),
		entry({ kind: "receipt", receipt: { through: "e20", inputKey: "i2", opinions, answerKeys: ["k1", "missing"] } }),
		{ type: "custom", customType: "someone-else", data: { kind: "eval", answers: { k9: { choice: "a", confidence: 1 } } } },
	]);
	expect(latest?.through).toBe("e9");
});

test("a main-agent rebuttal changes review input; unanswered advice alone does not", async () => {
	const branch: unknown[] = [user("u", "Analyse caching strategies; analysis only."), board,
		{ id: "a1", type: "message", message: { role: "assistant", content: "Strategy comparison, part one." } }];
	const h = host(branch); await h.emit("session_start"); await h.manual();
	branch.push({ id: "jev", type: "custom_message", customType: "jev-todo-audit", display: true, content: "[jev audit] split #5?" });
	reply = "reused"; await h.manual(); expect(calls).toHaveLength(2); expect(calls[1].request).toEqual(calls[0].request);
	branch.push({ id: "reply", type: "message", message: { role: "assistant", content: "Rebuttal: #5 is one coherent comparison; no split." } });
	reply = "sent"; await h.manual(); expect(calls).toHaveLength(3);
	expect(calls[2].request).not.toEqual(calls[1].request);
	expect(JSON.stringify(calls[2].request.evidence)).toContain("Rebuttal: #5 is one coherent comparison");
	expect(JSON.stringify(calls[2].request.evidence)).toContain("split #5?");
});

test("recovered service diagnostics preserve rejected attempts, successful parts and missing usage", async () => {
	reply = "recovered";
	const branch: unknown[] = [user("u", "Work on parser.ts"), user("u2", "Also keep the API stable"), board];
	const h = host(branch); await h.emit("session_start"); await h.manual();
	const diag = records(branch).at(-1).data.diag;
	expect(diag.outcome).toBe("recovered");
	expect(diag.attempts[0]).toMatchObject({ outcome: "overflow", status: 400, inputTokens: "unknown" });
	expect(diag.attempts.slice(1).every((a: any) => a.outcome === "answered")).toBe(true); expect(diag.attempts).toHaveLength(3);
	expect(diag.usage).toEqual({ inputTokens: 100, outputTokens: 0, unreported: { inputTokens: 1, outputTokens: 3 } });
	expect(diag.service.usage.inputTokens).toEqual({ knownSum: 100, missing: 1 });
	// These are scripted public observations. R12 actual wire trace proves their provenance.
});

test("a receipt's oversized list survives reload; malformed lists are dropped", () => {
	const entry = (receipt: unknown) => ({ type: "custom", customType: LEDGER_TYPE, data: { kind: "receipt", receipt } });
	const base = { through: "u", inputKey: "i", opinions: {}, answerKeys: [] };
	expect(restoreLedger([entry({ ...base, oversized: ["huge"] })])?.oversized).toEqual(["huge"]);
	expect(restoreLedger([entry({ ...base, oversized: [3] })])?.oversized).toBeUndefined();
});

test("audit diagnostic ids stay unique across a reload of the same session", async () => {
	const branch: unknown[] = [user("u", "Work on parser.ts"), board];
	const realNow = Date.now; Date.now = () => 1700000000000;
	try {
		const h = host(branch); await h.emit("session_start"); await h.manual();
		reply = "reused";
		const reloaded = host(branch); await reloaded.emit("session_start"); await reloaded.manual();
	} finally { Date.now = realNow; }
	const ids = records(branch).filter((e) => e.data.kind === "diag").map((e) => e.data.diag.audit);
	expect(ids).toHaveLength(2); expect(new Set(ids).size).toBe(2);
});
