/** Resumable capacity recovery: subdivide the dominant dimension with progress; never re-buy completed parts. */
import { expect, test } from "bun:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import makeExtension from "../index.js";
import { DEFAULT_CONFIG } from "../config.js";
import { collectContext } from "../context.js";
import { restoreLedger } from "../ledger.js";
import { reviewRolling, REPORT_RETAIN_CHARS, type Rolling } from "../rolling.js";
import { newEvaluationCache, type AuditRequest, type EvaluateOptions } from "../typesafe.js";

const OVERFLOW = JSON.stringify({ detail: { error_type: "max_tokens_exceeded" } });
const user = (id: string, text: string) => ({ id, type: "message", message: { role: "user", content: text } });
const say = (id: string, text: string) => ({ id, type: "message", message: { role: "assistant", content: text } });
const pad = (mark: string, n: number) => `${mark} ` + "analysis sentence. ".repeat(Math.ceil(n / 19));
const task = { id: 4, subject: "Design review", status: "in_progress" as const };
const board = { tasks: [task], nextId: 5 };
const supplements = [{ id: "task:4", value: task }];

/** Mock provider: rejects when state + all asked questions exceed `capacity` bytes (explicit test contract, not a tokenizer). */
function provider(capacity: number, opts: { stateCap?: number; fail?: (req: AuditRequest) => boolean } = {}) {
	const requests: { req: AuditRequest; status: number }[] = [];
	const fetchFn = async (_u: string, init?: RequestInit) => {
		const req = JSON.parse(String(init!.body)) as AuditRequest;
		const state = Buffer.byteLength(req.state), size = state + Buffer.byteLength(JSON.stringify(req.questions));
		const status = size > capacity || (opts.stateCap !== undefined && state > opts.stateCap) ? 400 : opts.fail?.(req) ? 422 : 200;
		requests.push({ req, status });
		if (status === 422) return new Response("invalid question", { status });
		if (status === 400) return new Response(OVERFLOW, { status });
		const answers = Object.fromEntries(Object.entries(req.questions).map(([k, q]) => [k, { choice: Object.keys(q.criteria).includes("unclear") ? "unclear" : Object.keys(q.criteria)[0], confidence: 0.9 }]));
		return new Response(JSON.stringify({ answers, model: "jev-mock" }));
	};
	const opts2: EvaluateOptions = { apiUrl: "http://jev", apiKey: "sk-capacity-test", timeoutMs: 1000, cache: newEvaluationCache(), fetchFn };
	return { requests, opts: opts2 };
}
const review = (history: unknown[], p: ReturnType<typeof provider>, extra: Partial<Parameters<typeof reviewRolling>[0]> = {}) => {
	const commits: Rolling[] = [];
	return reviewRolling({ board, context: collectContext(history, supplements), processed: new Set(), inputKey: "k", model: "m", opts: p.opts,
		commit: (r) => (commits.push(r), true), ...extra }).then((o) => ({ ...o, commits }));
};
const longHistory = () => [user("u", "Review the design document in depth; analysis only."), ...Array.from({ length: 12 }, (_, i) => say(`a${i}`, pad(`TEXT_LG_${i}`, 4000)))];

test("the exact 400 envelope on a long text-only history recovers with complete ordered coverage and bounded requests", async () => {
	const p = provider(24_000);
	const out = await review(longHistory(), p);
	expect(out.final).toBe(true); expect(out.recovered).toBe(true); expect(out.result.ok).toBe(true);
	const seen = p.requests.filter((r) => r.status === 200).map((r) => r.req.state).join("\n");
	for (let i = 0; i < 12; i++) expect(seen).toContain(`TEXT_LG_${i}`); // nothing silently dropped
	expect(out.commits.at(-1)).toMatchObject({ through: "a11", inputKey: "k" });
	expect(p.requests.length).toBeLessThanOrEqual(20);
	// State-dominated overflow never resends the same oversized state with fewer questions.
	const rejectedStates = p.requests.filter((r) => r.status === 400).map((r) => r.req.state);
	expect(new Set(rejectedStates).size).toBe(rejectedStates.length);
});

test("one oversized message is covered by ordered labelled fragments and counts as processed only after its last fragment", async () => {
	const p = provider(14_000);
	const big = Array.from({ length: 40 }, (_, i) => `PART_${String(i).padStart(2, "0")} ` + "detail ".repeat(60)).join("");
	const out = await review([user("u", "Analyse this."), say("huge", big)], p);
	expect(out.final).toBe(true);
	const answered = p.requests.filter((r) => r.status === 200).map((r) => r.req.state).join("\n");
	for (let i = 0; i < 40; i++) expect(answered).toContain(`PART_${String(i).padStart(2, "0")}`);
	expect(answered).toContain("ordered fragment 0-");
	// No receipt claims `huge` before its final fragment was reviewed.
	const throughHuge = out.commits.filter((c) => c.through === "huge");
	expect(throughHuge).toHaveLength(1); expect(throughHuge[0].inputKey).toBe("k");
	// The fragmented record is not repeated whole as a retained report afterwards.
	expect(p.requests.filter((r) => r.status === 200).every((r) => !r.req.state.includes(big))).toBe(true);
});

test("a fragmented huge user record is not re-sent whole when later input is reviewed", async () => {
	const p = provider(14_000);
	const big = Array.from({ length: 40 }, (_, i) => `USER_PART_${String(i).padStart(2, "0")} ` + "detail ".repeat(60)).join("");
	const first = [user("huge-user", big), say("a1", "Working on it.")];
	const out = await review(first, p);
	expect(out.final).toBe(true);
	const receipt = out.commits.at(-1)!;
	const before = p.requests.length;
	const second = await review([...first, say("a2", "Design analysis finished.")], p,
		{ processed: new Set(["huge-user", "a1"]), rolling: receipt, inputKey: "k2" });
	expect(second.final).toBe(true); expect(second.result.ok).toBe(true);
	const later = p.requests.slice(before);
	expect(later.every((r) => !r.req.state.includes(big))).toBe(true); // never recreates the overflow
	expect(later.filter((r) => r.status === 400)).toHaveLength(0);
	expect(second.context.rolling?.reportNote).toContain("user huge-user could only be reviewed in fragments");
	expect(receipt.oversized).toEqual(["huge-user"]); // durable, so it also holds after reload
});

test("a long user constraint that fits is still retained on later audits", async () => {
	const p = provider(60_000);
	const constraint = "USER_CONSTRAINT no deployment without approval. " + "scope detail. ".repeat(450); // ~6,000 chars
	expect(constraint.length).toBeGreaterThan(REPORT_RETAIN_CHARS);
	const first = [user("long-user", constraint), say("a1", "Working on it.")];
	const out = await review(first, p);
	expect(out.final).toBe(true); expect(out.commits.at(-1)!.oversized).toBeUndefined();
	const before = p.requests.length;
	await review([...first, say("a2", "Done with the analysis.")], p, { processed: new Set(["long-user", "a1"]), rolling: out.commits.at(-1)!, inputKey: "k2" });
	const later = p.requests.slice(before);
	expect(later.length).toBeGreaterThan(0);
	expect(later.every((r) => r.req.state.includes("USER_CONSTRAINT no deployment without approval"))).toBe(true);
});

test("question-dominated overflow splits independent questions over one frozen state and merges only same-state answers", async () => {
	const p = provider(4_000);
	const out = await review([user("u", "Rename a variable.")], p);
	expect(out.final).toBe(true); expect(out.recovered).toBe(true);
	const ok = p.requests.filter((r) => r.status === 200);
	expect(new Set(ok.map((r) => r.req.state)).size).toBe(1); // every batch evaluated the same frozen state
	const asked = ok.flatMap((r) => Object.keys(r.req.questions));
	expect(new Set(asked).size).toBe(asked.length); // no question paid twice
});

test("fixed state or a single question that cannot fit terminates with an actionable diagnostic and no advice", async () => {
	const p = provider(100);
	const out = await review([user("u", "Short.")], p);
	expect(out.final).toBe(false); expect(out.result.ok).toBe(false);
	expect(!out.result.ok && out.result.error).toContain("ask the main agent for a concise current report");
	expect(p.requests.map((r) => Object.keys(r.req.questions).length)).toEqual([9, 5, 3, 2, 1]); // stops at the first rejected single question
	const envelopes = p.requests.map((r) => JSON.stringify([r.req.state, Object.keys(r.req.questions)]));
	expect(new Set(envelopes).size).toBe(envelopes.length); // never the same rejected envelope twice
	expect(out.commits).toHaveLength(0);
});

test("a later piece failure never re-buys earlier admitted pieces; resumption pays only the unfinished work", async () => {
	let failing = true;
	const p = provider(24_000, { fail: (req) => failing && req.state.includes("TEXT_LG_9") });
	const history = longHistory();
	const first = await review(history, p);
	expect(first.final).toBe(false);
	const paidBefore = p.requests.filter((r) => r.status === 200).flatMap((r) => [...r.req.state.matchAll(/TEXT_LG_(\d+)/g)].map((m) => m[1]));
	expect(paidBefore).toContain("0");
	failing = false;
	const through = first.commits.at(-1)!.through!;
	const processed = new Set(history.map((e) => e.id).slice(0, history.findIndex((e) => e.id === through) + 1));
	const n = p.requests.length;
	const second = await review(history, p, { processed, rolling: first.commits.at(-1) });
	expect(second.final).toBe(true);
	const resent = p.requests.slice(n).map((r) => r.req.state).join("\n");
	for (const id of new Set(paidBefore)) if (Number(id) < 8) expect(resent).not.toContain(`${pad(`TEXT_LG_${id}`, 4000)}`);
	expect(resent).toContain("TEXT_LG_9"); expect(resent).toContain("TEXT_LG_11");
});

test("known-rejected envelopes are persisted and not retried unchanged after reload", async () => {
	const branch: unknown[] = [user("u", "Tiny."), { id: "b", type: "message", message: { role: "toolResult", toolName: "todo", content: "ok", details: board } }];
	let calls = 0;
	const original = globalThis.fetch;
	globalThis.fetch = (async () => { calls++; return new Response(OVERFLOW, { status: 400 }); }) as unknown as typeof fetch;
	process.env.JEV_CAPACITY_KEY = "sk-capacity-host";
	try {
		const run = async () => {
			const handlers = new Map<string, any[]>(), commands = new Map<string, any>();
			const pi = {
				on: (n: string, h: any) => handlers.set(n, [...(handlers.get(n) ?? []), h]),
				registerCommand: (n: string, c: any) => commands.set(n, c), sendMessage: () => {},
				appendEntry: (customType: string, data: unknown) => branch.push({ id: `c${branch.length}`, type: "custom", customType, data }),
				events: { on: () => () => {} },
			} as unknown as ExtensionAPI;
			const ctx = { sessionManager: { getSessionId: () => "s", getBranch: () => branch, buildContextEntries: () => branch }, ui: { notify: () => {} } };
			makeExtension(pi, { ...DEFAULT_CONFIG, apiKeyEnvVar: "JEV_CAPACITY_KEY" });
			for (const h of handlers.get("session_start") ?? []) await h({}, ctx);
			await commands.get("jev-audit").handler("", ctx);
		};
		await run();
		const firstCalls = calls;
		expect(firstCalls).toBeGreaterThan(0);
		const cache = newEvaluationCache(); restoreLedger(branch, cache);
		expect(cache.rejected.size).toBe(firstCalls);
		await run(); // reload: same input
		expect(calls).toBe(firstCalls);
	} finally { globalThis.fetch = original; }
});

test("a failure in a later fragment of one record resumes without re-paying earlier fragments", async () => {
	const big = Array.from({ length: 40 }, (_, i) => `PART_${String(i).padStart(2, "0")} ` + "detail ".repeat(60)).join("");
	let failing = true;
	const p = provider(14_000, { fail: (req) => failing && req.state.includes("PART_39") });
	const history = [user("u", "Analyse this."), say("huge", big)];
	const first = await review(history, p);
	expect(first.final).toBe(false);
	expect(first.commits.some((c) => c.through === "huge")).toBe(false); // not covered yet
	const paid = p.requests.filter((r) => r.status === 200).map((r) => r.req.state);
	failing = false;
	const n = p.requests.length;
	const receipt = first.commits.at(-1);
	const processed = new Set(receipt?.through ? ["u"] : []);
	const second = await review(history, p, { processed, rolling: receipt });
	expect(second.final).toBe(true);
	const again = p.requests.slice(n).map((r) => r.req.state);
	for (const state of again) expect(paid).not.toContain(state); // no completed stage bought twice
	expect(again.every((s) => !s.includes("PART_00 "))).toBe(true); // resumed past fragments already answered
	expect(second.commits.at(-1)).toMatchObject({ through: "huge", inputKey: "k" });
});

test("host: a recovered overflow is reported as recovered success, never as the initial 400", async () => {
	const branch: unknown[] = [...longHistory(), { id: "b", type: "message", message: { role: "toolResult", toolName: "todo", content: "ok", details: board } }];
	const p = provider(24_000);
	const original = globalThis.fetch;
	globalThis.fetch = ((u: string, init?: RequestInit) => p.opts.fetchFn!(u, init)) as unknown as typeof fetch;
	process.env.JEV_CAPACITY_KEY = "sk-capacity-host";
	const notes: string[] = [];
	try {
		const handlers = new Map<string, any[]>(), commands = new Map<string, any>();
		const pi = {
			on: (n: string, h: any) => handlers.set(n, [...(handlers.get(n) ?? []), h]),
			registerCommand: (n: string, c: any) => commands.set(n, c), sendMessage: () => {},
			appendEntry: (customType: string, data: unknown) => branch.push({ id: `c${branch.length}`, type: "custom", customType, data }),
			events: { on: () => () => {} },
		} as unknown as ExtensionAPI;
		const ctx = { sessionManager: { getSessionId: () => "s", getBranch: () => branch, buildContextEntries: () => branch }, ui: { notify: (m: string) => notes.push(m) } };
		makeExtension(pi, { ...DEFAULT_CONFIG, apiKeyEnvVar: "JEV_CAPACITY_KEY" });
		for (const h of handlers.get("session_start") ?? []) await h({}, ctx);
		await commands.get("jev-audit").handler("", ctx);
	} finally { globalThis.fetch = original; }
	expect(p.requests.some((r) => r.status === 400)).toBe(true);
	expect(notes.some((n) => n.includes("recovered by subdivision"))).toBe(true);
	expect(notes.some((n) => n.includes("failed"))).toBe(false);
});

test("many tiny retained reports are bounded by serialized record cost, not text length", async () => {
	// 160 two-char reports: text-only budgeting undercounts the per-record envelope (~163 bytes serialized).
	const p = provider(24_000);
	const history = [user("u", "Do the design review."), ...Array.from({ length: 160 }, (_, i) => say(`a${i}`, "ok"))];
	const first = await review(history, p);
	expect(first.final).toBe(true);
	const before = p.requests.length;
	const second = await review([...history, say("new", "Design review finished.")], p,
		{ processed: new Set(history.map((e) => e.id)), rolling: first.commits.at(-1)!, inputKey: "k2" });
	expect(second.final).toBe(true); expect(second.result.ok).toBe(true);
	const later = p.requests.slice(before);
	expect(later.filter((r) => r.status === 400)).toHaveLength(0); // fits the capacity that text-only budgeting blew past
	const retained = later.filter((r) => r.status === 200).map((r) => r.req.state).join("\n");
	expect(retained).toContain('a159'); // newest reports keep fitting first
	expect(retained).toContain("omitted by the compact report budget"); // the omission is disclosed
	expect(retained).toContain("Design review finished.");
});

test("host: an interrupted `full` review retries only its unfinished stages", async () => {
	const branch: unknown[] = [...longHistory(), { id: "b", type: "message", message: { role: "toolResult", toolName: "todo", content: "ok", details: board } }];
	let failing = true;
	const p = provider(24_000, { fail: (req) => failing && req.state.includes("TEXT_LG_11") });
	const original = globalThis.fetch;
	globalThis.fetch = ((u: string, init?: RequestInit) => p.opts.fetchFn!(u, init)) as unknown as typeof fetch;
	process.env.JEV_CAPACITY_KEY = "sk-capacity-host";
	try {
		const handlers = new Map<string, any[]>(), commands = new Map<string, any>();
		const pi = {
			on: (n: string, h: any) => handlers.set(n, [...(handlers.get(n) ?? []), h]),
			registerCommand: (n: string, c: any) => commands.set(n, c), sendMessage: () => {},
			appendEntry: (customType: string, data: unknown) => branch.push({ id: `c${branch.length}`, type: "custom", customType, data }),
			events: { on: () => () => {} },
		} as unknown as ExtensionAPI;
		const ctx = { sessionManager: { getSessionId: () => "s", getBranch: () => branch, buildContextEntries: () => branch }, ui: { notify: () => {} } };
		makeExtension(pi, { ...DEFAULT_CONFIG, apiKeyEnvVar: "JEV_CAPACITY_KEY" });
		for (const h of handlers.get("session_start") ?? []) await h({}, ctx);
		await commands.get("jev-audit").handler("full", ctx);
		const paid = p.requests.filter((r) => r.status === 200).map((r) => r.req.state);
		expect(paid.length).toBeGreaterThan(0); // earlier stages really completed
		expect(p.requests.some((r) => r.status === 422)).toBe(true); // a later stage failed
		failing = false;
		const n = p.requests.length;
		await commands.get("jev-audit").handler("full", ctx);
		const retry = p.requests.slice(n);
		expect(retry.length).toBeGreaterThan(0);
		for (const r of retry) expect(paid).not.toContain(r.req.state); // no completed stage bought twice
		expect(retry.every((r) => !r.req.state.includes("TEXT_LG_0 "))).toBe(true); // resumed past completed stages
		expect(retry.some((r) => r.req.state.includes("TEXT_LG_11"))).toBe(true);
	} finally { globalThis.fetch = original; }
});
