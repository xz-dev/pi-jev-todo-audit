/** Admissible retained state must not multiply work by records × questions. All admissions here are synthetic. */
import { expect, test } from "bun:test";
import { reviewRolling, type Rolling } from "../rolling.js";
import { evaluate, evaluateBatched, envelopeKey, newEvaluationCache, type AuditRequest, type EvaluateOptions } from "../typesafe.js";
import { sizeOf, type ContextLimits } from "../capacity.js";
import { collectContext, type EvidenceRecord } from "../context.js";

const record = (id: string, kind: string, text: string): EvidenceRecord => ({
	id, kind, text, group: id, view: "recent", protected: kind === "user", complete: true,
});
const board = { tasks: [
	{ id: 1, subject: "Current task", status: "in_progress" as const },
	{ id: 2, subject: "Next task", status: "pending" as const },
], nextId: 3 };

const channels: { name: string; limits: ContextLimits }[] = [
	{ name: "TypeSafe", limits: { request: 64000, stateAndLongestQuestion: 32000 } },
	{ name: "request-only", limits: { request: 32000 } },
	{ name: "request-stricter", limits: { request: 32000, stateAndLongestQuestion: 64000 } },
	{ name: "OpenRouter", limits: { request: 32000, stateAndLongestQuestion: 32000 } },
];
for (const { name, limits } of channels) for (const reportUsage of [true, false]) for (const count of [1, 6, 69])
test(`admissible ${name} fixed prefix and ${count} new records use one complete batch (${reportUsage ? "reported" : "missing"} usage)`, async () => {
	const history = [record("u", "user", "context ".repeat(8000)),
		...Array.from({ length: count }, (_, i) => record(`t${i}`, "tool_call", `read completed ${i}`))];
	const sent: AuditRequest[] = [], commits: Rolling[] = [];
	const out = await reviewRolling({ board, context: { records: history, omissions: [], globalComplete: true, reduced: false },
		processed: new Set(["u"]), rolling: { through: "u", inputKey: "old", opinions: {}, answerKeys: [] }, inputKey: "new", model: "jev-latest",
		opts: { apiUrl: "https://api.typesafe.ai/v1/systemone", apiKey: "offline", timeoutMs: 1000, cache: newEvaluationCache(),
			capacity: { profile: { tokensPerByte: 0.4779192204934779, rejections: [] }, limits },
			fetchFn: async (_url, init) => {
				const req = JSON.parse(String(init!.body)) as AuditRequest; sent.push(req);
				// Synthetic admission contract, not a real tokenizer or provider charge.
				const bytes = Buffer.byteLength(req.state), questions = Buffer.byteLength(JSON.stringify(req.questions));
				const longest = Math.max(...Object.entries(req.questions).map(([k, q]) => Buffer.byteLength(JSON.stringify({ [k]: q }))));
				if (limits.stateAndLongestQuestion !== undefined) expect((bytes + longest) * 0.34).toBeLessThan(limits.stateAndLongestQuestion);
				if (limits.request !== undefined) expect((bytes + questions) * 0.34).toBeLessThan(limits.request);
				return new Response(JSON.stringify({ ...(reportUsage ? { usage: { input_tokens: Math.ceil((bytes + questions) * 0.34), output_tokens: 30 } } : {}),
					answers: Object.fromEntries(Object.entries(req.questions).map(([k, q]) => [k, { choice: Object.keys(q.criteria)[0], confidence: 0.9 }])) }));
			} }, commit: (r) => (commits.push(r), true) });
	expect(out.complete).toBe(true); expect(out.final).toBe(true);
	expect(commits.at(-1)?.through).toBe(`t${count - 1}`);
	expect(sent).toHaveLength(1);
	expect(Object.keys(sent[0].questions)).toHaveLength(12);
	for (const r of history) expect(sent[0].state).toContain(r.text);
});

const OVERFLOW = JSON.stringify({ detail: { error_type: "max_tokens_exceeded" } });
const answered = (req: AuditRequest, inputTokens?: number) => new Response(JSON.stringify({
	...(inputTokens === undefined ? {} : { usage: { input_tokens: inputTokens, output_tokens: 1 } }),
	answers: Object.fromEntries(Object.entries(req.questions).map(([k, q]) => [k, { choice: Object.keys(q.criteria)[0], confidence: 0.9 }])),
}));

test("a disputed prediction followed by true overflow preserves admitted facts and stops at the primary floor", async () => {
	const history = [record("u", "user", "context ".repeat(8000)),
		...Array.from({ length: 4 }, (_, i) => record(`p${i}`, "assistant", `PIECE-${i}: ` + "detail ".repeat(1800)))];
	const sent: { req: AuditRequest; status: number }[] = [], commits: Rolling[] = [];
	const options: EvaluateOptions = { apiUrl: "http://jev", apiKey: "offline", timeoutMs: 1000, cache: newEvaluationCache(),
		capacity: { profile: { tokensPerByte: 0.478, rejections: [] }, limits: { request: 64000, stateAndLongestQuestion: 32000 } },
		fetchFn: async (_u, init) => {
			const req = JSON.parse(String(init!.body)) as AuditRequest, size = sizeOf(req);
			const tooBig = (size.stateBytes + size.longestQuestionBytes) * 0.34 > 32000 || (size.stateBytes + size.questionBytes) * 0.34 > 64000;
			sent.push({ req, status: tooBig ? 400 : 200 });
			return tooBig ? new Response(OVERFLOW, { status: 400 }) : answered(req, Math.ceil((size.stateBytes + size.questionBytes) * 0.34));
		} };
	// Coverage is reported data and cannot retire the unpinned public reports' primary eligibility.
	const context = collectContext(history.map((r) => ({ id: r.id, type: "message", message: { role: r.kind, content: r.text } })),
		board.tasks.map((t) => ({ id: `task:${t.id}`, value: { ...t, metadata: { auditBrief: {
			text: "Current reported account of PIECE-0 through PIECE-3; permission remains the user's constraint.", sources: ["u"], covers: ["p0", "p1", "p2", "p3"],
		} } } })));
	const out = await reviewRolling({ board, context,
		processed: new Set(["u"]), rolling: { through: "u", inputKey: "old", opinions: {}, answerKeys: [] }, inputKey: "new", model: "m",
		opts: options, commit: (r) => (commits.push(r), true) });
	expect(sent[0].status).toBe(400); expect(out.recovered).toBe(false); // an incomplete scope is not recovered success
	expect(out.final || out.complete).toBe(false); expect(out.needsAccount).toBe(true);
	const through = commits.at(-1)?.through;
	expect(through).toBeDefined(); expect(through).not.toBe("p3");
	const processed = history.slice(0, history.findIndex((r) => r.id === through) + 1);
	const packets = sent.filter((s) => s.status === 200).map((s) => JSON.parse(s.req.state.split("Macro-level evidence (tool activity is name/call/status only):\n")[1].split("\nInterpret evidence chronologically:")[0]));
	for (const r of processed) {
		const pieces = packets.flatMap((p) => p.records).filter((x: EvidenceRecord) => x.id === r.id || x.fragment?.of === r.id)
			.map((x: EvidenceRecord) => ({ start: x.fragment?.start ?? 0, end: x.fragment?.end ?? r.text.length, text: x.text })).sort((a, b) => a.start - b.start);
		let end = 0;
		for (const p of pieces) { expect(p.start).toBeLessThanOrEqual(end); expect(p.text).toBe(r.text.slice(p.start, p.end)); end = Math.max(end, p.end); }
		expect(end).toBe(r.text.length);
		expect(sent.at(-1)!.req.state).toContain(r.text);
	}
	const before = sent.length;
	const rejected = await evaluate(sent[0].req, { ...options, fixedState: sent[0].req.state, sendIrreducible: true });
	expect(rejected.result.ok).toBe(false); expect(sent.length).toBe(before);
	const identities = sent.map(({ req }) => envelopeKey(req, options.apiUrl));
	expect(new Set(identities).size).toBe(identities.length);
});

for (const count of [1, 6, 69]) test(`confirmed fixed-state failure stops before sibling scopes (${count} records)`, async () => {
	const history = [record("u", "user", "context ".repeat(8000)),
		...Array.from({ length: count }, (_, i) => record(`t${i}`, "tool_call", `read completed ${i}`))];
	const sent: AuditRequest[] = [], commits: Rolling[] = [];
	const out = await reviewRolling({ board, context: { records: history, omissions: [], globalComplete: true, reduced: false },
		processed: new Set(["u"]), rolling: { through: "u", inputKey: "old", opinions: {}, answerKeys: [] }, inputKey: "new", model: "m",
		opts: { apiUrl: "http://jev", apiKey: "offline", timeoutMs: 1000, cache: newEvaluationCache(),
			capacity: { profile: { tokensPerByte: 0.478, rejections: [] }, limits: { request: 64000, stateAndLongestQuestion: 32000 } },
			fetchFn: async (_u, init) => { sent.push(JSON.parse(String(init!.body))); return new Response(OVERFLOW, { status: 400 }); } },
		commit: (r) => (commits.push(r), true) });
	expect(out.result.ok).toBe(false); expect(out.final || out.complete).toBe(false); expect(commits).toHaveLength(0);
	if (!out.result.ok) expect(out.result.error).toContain("concise current report");
	expect(Object.keys(sent.at(-1)!.questions)).toHaveLength(1);
	const leafScopes = sent.map((req) => {
		const packet = JSON.parse(req.state.split("Macro-level evidence (tool activity is name/call/status only):\n")[1].split("\nInterpret evidence chronologically:")[0]);
		return packet.records.filter((r: EvidenceRecord) => r.view === "recent").map((r: EvidenceRecord) => r.id);
	}).filter((ids) => ids.length === 1);
	expect(leafScopes.length).toBeGreaterThan(0);
	for (const ids of leafScopes) expect(ids).toEqual(["t0"]); // no sibling traversal after the first actual irreducible failure
	const keys = sent.map((req) => envelopeKey(req, "http://jev"));
	expect(new Set(keys).size).toBe(keys.length);
});

test("a request-wide fixed-floor admission never resends a rejected single-question superset", async () => {
	const question: AuditRequest["questions"][string] = { type: "choice", instructions: "check", criteria: { yes: "yes", no: "no" } };
	const req: AuditRequest = { state: "retained ".repeat(8000), model: "m", questions: { q: question } };
	const sent: AuditRequest[] = [];
	const options: EvaluateOptions = { apiUrl: "http://jev", apiKey: "offline", timeoutMs: 1000, cache: newEvaluationCache(),
		fixedState: req.state, capacity: { profile: { tokensPerByte: 0.478, rejections: [] }, limits: { request: 32000 } },
		fetchFn: async (_u, init) => {
			const r = JSON.parse(String(init!.body)) as AuditRequest; sent.push(r);
			return r.state === req.state ? new Response(OVERFLOW, { status: 400 }) : answered(r);
		} };
	expect((await evaluate(req, options)).result.ok).toBe(false);
	const different = { ...req, state: "different ".repeat(8000) };
	expect((await evaluate(different, { ...options, fixedState: different.state })).result.ok).toBe(true);
	expect(options.capacity!.profile.rejections).toHaveLength(0); // contradicted size hint is not an exact rejection
	expect((await evaluate({ ...req, questions: { q: question, q2: question } }, options)).result.ok).toBe(false);
	expect(sent).toHaveLength(2);
});

test("question-only overflow resumes missing same-state batches without repaying completed questions", async () => {
	const req: AuditRequest = { state: "same frozen state", model: "m", questions: Object.fromEntries(Array.from({ length: 12 }, (_, i) =>
		[`q${i}`, { type: "choice", instructions: "question ".repeat(400), criteria: { yes: "yes", no: "no" } }])) };
	const sent: AuditRequest[] = [], answeredKeys = new Set<string>();
	let fail = true;
	const options: EvaluateOptions = { apiUrl: "http://jev", apiKey: "offline", timeoutMs: 1000, cache: newEvaluationCache(), sendIrreducible: true,
		fixedState: req.state,
		capacity: { profile: { tokensPerByte: 0.25, rejections: [] }, limits: { request: 4000, stateAndLongestQuestion: 2000 } },
		fetchFn: async (_u, init) => {
			const r = JSON.parse(String(init!.body)) as AuditRequest; sent.push(r);
			if (Object.keys(r.questions).length > 3) return new Response(OVERFLOW, { status: 400 });
			if (fail && "q6" in r.questions) return new Response("invalid question", { status: 422 });
			for (const k of Object.keys(r.questions)) answeredKeys.add(k);
			return answered(r);
		} };
	expect((await evaluateBatched(req, options)).result.ok).toBe(false);
	const completed = new Set(answeredKeys), before = sent.length;
	expect(completed.size).toBeGreaterThan(0);
	fail = false;
	expect((await evaluateBatched(req, options)).result.ok).toBe(true);
	expect(answeredKeys.size).toBe(12);
	// The retained floor fits each question: an aggregate-only prediction must still pre-split.
	for (const r of sent) expect(Object.keys(r.questions).length).toBeLessThanOrEqual(3);
	for (const r of sent.slice(before)) {
		expect(r.state).toBe(req.state);
		for (const k of Object.keys(r.questions)) expect(completed.has(k)).toBe(false);
	}
});
