/** Uniform per-question evaluation reuse in the shared typesafe.ts path. */
import { expect, test } from "bun:test";
import { buildAuditRequest, evaluate, evaluationKey, newEvaluationCache, type AuditRequest, type Attempt } from "../typesafe.js";

const opts = { apiUrl: "https://x.test/v1/systemone", apiKey: "k", timeoutMs: 1000 };
const board = { tasks: [{ id: 5, subject: "Parser", status: "in_progress" as const }, { id: 6, subject: "Docs", status: "pending" as const }], nextId: 7 };
const pickFirst = (req: AuditRequest, omit: string[] = []) => Object.fromEntries(Object.entries(req.questions)
	.filter(([k]) => !omit.includes(k)).map(([k, q]) => [k, { choice: Object.keys(q.criteria)[0], confidence: 0.9 }]));
function server(omit: string[] = []) {
	const sent: AuditRequest[] = [];
	const fetchFn = async (_u: string, init?: RequestInit) => {
		const req = JSON.parse(String(init!.body)) as AuditRequest; sent.push(req);
		return new Response(JSON.stringify({ answers: pickFirst(req, omit), model: "jev-1.13", usage: { input_tokens: 100, output_tokens: 1 } }));
	};
	return { sent, fetchFn };
}

test("every decision category (alignment, lifecycle, granularity, evidence, chunk) is reused with zero provider calls", async () => {
	const cache = newEvaluationCache();
	const req = buildAuditRequest(board, "edited parser.ts", "jev-latest");
	req.questions.chunk_3 = { type: "choice", instructions: "Summarise chunk 3 state", criteria: { done: "d", open: "o" } };
	const s = server();
	const first = await evaluate(req, { ...opts, cache, fetchFn: s.fetchFn });
	expect(s.sent).toHaveLength(1); expect(first.reuse.sent).toBe(Object.keys(req.questions).length);
	const attempts: Attempt[] = [];
	const again = await evaluate(structuredClone(req), { ...opts, cache, fetchFn: s.fetchFn, onAttempt: (a) => attempts.push(a) });
	expect(s.sent).toHaveLength(1); expect(attempts).toHaveLength(0);
	expect(again.reuse).toEqual({ hits: Object.keys(req.questions).length, joined: 0, sent: 0 });
	expect(again.result).toEqual(first.result);
	if (again.result.ok) {
		expect(again.result.answers.alignment).toBeDefined(); expect(again.result.answers.lifecycle?.task_status_5).toBeDefined();
		expect(again.result.answers.granularity?.task_granularity_5).toBeDefined(); expect((again.result.answers as any).chunk_3).toBeDefined();
	}
});

test("changed criteria, instructions, options, context, model or endpoint make distinct keys", () => {
	const req = buildAuditRequest(board, "edited parser.ts", "jev-latest");
	const base = evaluationKey(req, "alignment", opts.apiUrl);
	const variants: AuditRequest[] = [
		{ ...req, questions: { ...req.questions, alignment: { ...req.questions.alignment, instructions: "changed" } } },
		{ ...req, questions: { ...req.questions, alignment: { ...req.questions.alignment, criteria: { ...req.questions.alignment.criteria, extra: "x" } } } },
		{ ...req, state: req.state + " new visible text" },
		{ ...req, model: "jev-other" },
	];
	for (const v of variants) expect(evaluationKey(v, "alignment", opts.apiUrl)).not.toBe(base);
	expect(evaluationKey(req, "alignment", "https://other.test")).not.toBe(base);
	// Same meaning, independent of which other questions share the batch.
	expect(evaluationKey({ ...req, questions: { alignment: req.questions.alignment } }, "alignment", opts.apiUrl)).toBe(base);
	// Different options on another board make a different current_match key.
	expect(evaluationKey(buildAuditRequest({ ...board, tasks: board.tasks.slice(0, 1) }, "edited parser.ts", "jev-latest"), "current_match", opts.apiUrl))
		.not.toBe(evaluationKey(req, "current_match", opts.apiUrl));
});

test("A/B cached plus C missing sends only C and returns the combined answers", async () => {
	const cache = newEvaluationCache();
	const q = (n: string) => ({ type: "choice" as const, instructions: `question ${n}`, criteria: { yes: "y", no: "n" } });
	const s = server();
	await evaluate({ state: "S", model: "jev-latest", questions: { A: q("A"), B: q("B") } }, { ...opts, cache, fetchFn: s.fetchFn });
	const res = await evaluate({ state: "S", model: "jev-latest", questions: { A: q("A"), B: q("B"), C: q("C") } }, { ...opts, cache, fetchFn: s.fetchFn });
	expect(s.sent).toHaveLength(2); expect(Object.keys(s.sent[1].questions)).toEqual(["C"]);
	expect(res.reuse).toEqual({ hits: 2, joined: 0, sent: 1 });
	expect(res.result.ok && Object.keys(res.result.answers).sort()).toEqual(["A", "B", "C"]);
});

test("concurrent identical calls share one provider evaluation", async () => {
	const cache = newEvaluationCache();
	let release!: () => void; const gate = new Promise<void>((r) => { release = r; });
	const s = server();
	const slow = async (u: string, init?: RequestInit) => { await gate; return s.fetchFn(u, init); };
	const req = buildAuditRequest(board, "x", "jev-latest");
	const a = evaluate(req, { ...opts, cache, fetchFn: slow }), b = evaluate(structuredClone(req), { ...opts, cache, fetchFn: slow });
	release();
	const [ra, rb] = await Promise.all([a, b]);
	expect(s.sent).toHaveLength(1); expect(rb.reuse.joined).toBe(Object.keys(req.questions).length); expect(rb.result).toEqual(ra.result);
	expect(cache.pending.size).toBe(0);
});

test("partial response keeps valid siblings; missing/invalid answers are never borrowed from older answers", async () => {
	const cache = newEvaluationCache();
	const q = (n: string) => ({ type: "choice" as const, instructions: `question ${n}`, criteria: { yes: "y", unclear: "u" } });
	const req = { state: "S1", model: "jev-latest", questions: { A: q("A"), B: q("B"), C: q("C") } };
	const partial = server(["C"]);
	const first = await evaluate(req, { ...opts, cache, fetchFn: partial.fetchFn });
	expect(first.result.ok && Object.keys(first.result.answers).sort()).toEqual(["A", "B"]);
	const full = server();
	await evaluate(req, { ...opts, cache, fetchFn: full.fetchFn });
	expect(Object.keys(full.sent[0].questions)).toEqual(["C"]);
	// New state: old confident C must not stand in for the unanswered new C.
	const changed = await evaluate({ ...req, state: "S2" }, { ...opts, cache, fetchFn: server(["C"]).fetchFn });
	expect(changed.result.ok && (changed.result.answers as any).C).toBeUndefined();
	// Transport failure invents nothing and caches nothing.
	const failing = await evaluate({ ...req, state: "S3" }, { ...opts, cache, fetchFn: async () => new Response("bad", { status: 422 }) });
	expect(failing.result.ok).toBe(false);
	expect(cache.answers.has(evaluationKey({ ...req, state: "S3" }, "A", opts.apiUrl))).toBe(false);
});

test("uncertain or low-confidence answers are cached as-is, never strengthened", async () => {
	const cache = newEvaluationCache();
	const req = { state: "S", model: "jev-latest", questions: { A: { type: "choice" as const, instructions: "A", criteria: { yes: "y", unclear: "u" } } } };
	await evaluate(req, { ...opts, cache, fetchFn: async () => new Response(JSON.stringify({ answers: { A: { choice: "unclear", confidence: 0.2 } } })) });
	const again = await evaluate(req, { ...opts, cache, fetchFn: async () => { throw new Error("must not be called"); } });
	expect(again.result.ok && (again.result.answers as any).A).toEqual({ choice: "unclear", confidence: 0.2 });
});

test("fresh review bypasses stored answers once and stores the new result", async () => {
	const cache = newEvaluationCache();
	const req = buildAuditRequest(board, "x", "jev-latest");
	const s = server();
	await evaluate(req, { ...opts, cache, fetchFn: s.fetchFn });
	const forced = await evaluate(req, { ...opts, cache, fresh: "full-1", fetchFn: s.fetchFn });
	expect(s.sent).toHaveLength(2); expect(forced.reuse.hits).toBe(0);
	await evaluate(req, { ...opts, cache, fetchFn: s.fetchFn }); expect(s.sent).toHaveLength(2);
});

test("within one forced review, newly completed answers are reused after a later failure; a new forced review re-evaluates", async () => {
	const cache = newEvaluationCache();
	const req = buildAuditRequest(board, "x", "jev-latest");
	const s = server();
	await evaluate(req, { ...opts, cache, fetchFn: s.fetchFn });
	await evaluate(req, { ...opts, cache, fresh: "full-1", fetchFn: s.fetchFn });
	expect(s.sent).toHaveLength(2);
	await evaluate(req, { ...opts, cache, fresh: "full-1", fetchFn: s.fetchFn }); // resumed same forced review
	expect(s.sent).toHaveLength(2);
	await evaluate(req, { ...opts, cache, fresh: "full-2", fetchFn: s.fetchFn }); // another explicit full request
	expect(s.sent).toHaveLength(3);
});

test("identical question definitions under different keys do not share a cached answer", async () => {
	const cache = newEvaluationCache();
	const req = buildAuditRequest(board, "x", "jev-latest");
	req.questions = {
		A: { type: "choice", instructions: "Same definition.", criteria: { yes: "y", no: "n" } },
		B: { type: "choice", instructions: "Same definition.", criteria: { yes: "y", no: "n" } },
	};
	const sent: AuditRequest[] = [];
	let i = 0;
	const fetchFn = async (_u: string, init?: RequestInit) => {
		const req = JSON.parse(String(init!.body)) as AuditRequest; sent.push(req);
		if (i++ > 0) throw new Error("must not be called");
		return new Response(JSON.stringify({ answers: { A: { choice: "yes", confidence: 0.9 }, B: { choice: "no", confidence: 0.9 } } }));
	};
	const s = { sent, fetchFn };
	const first = await evaluate(req, { ...opts, cache, fetchFn: s.fetchFn });
	const a1 = (first.result as any).answers;
	expect(a1.A.choice).toBe("yes"); expect(a1.B.choice).toBe("no");
	const again = await evaluate(req, { ...opts, cache, fetchFn: async () => { throw new Error("must not be called again"); } });
	const a2 = (again.result as any).answers;
	expect(a2.A.choice).toBe("yes"); expect(a2.B.choice).toBe("no");
	expect(sent).toHaveLength(1);
});
