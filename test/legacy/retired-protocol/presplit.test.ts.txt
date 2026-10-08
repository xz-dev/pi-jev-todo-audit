/** Legacy predictor comparison, not proof of production service behavior.
 * The migrated reload/full/learned-channel host guarantee runs as real-wire R15. */
import { expect, test } from "bun:test";
import { collectContext } from "../context.js";
import { isOwnBookkeeping, LEDGER_TYPE } from "../ledger.js";
import { reviewRolling } from "./legacy/rolling.js";
import { newCapacityProfile, observe, predictOverflow, PUBLISHED_LIMITS, restoreCapacity, sizeOf, type EnvelopeSize } from "./legacy/capacity.js";
import { auditWithContext, evaluate, newEvaluationCache, type Attempt, type AuditRequest, type EvaluateOptions } from "./legacy/typesafe.js";

const TYPESAFE = PUBLISHED_LIMITS["https://api.typesafe.ai/v1/systemone"];
const env = (stateBytes: number, questionBytes: number, longestQuestionBytes = Math.min(questionBytes, 1800)): EnvelopeSize => ({ stateBytes, questionBytes, longestQuestionBytes });

test("the two published limits are checked separately so admitted request-wide capacity is not wasted", () => {
	const p = newCapacityProfile(); p.tokensPerByte = 0.5;
	// state + longest = 60k bytes → 30k tokens (≤ 32k); state + all = 120k bytes → 60k tokens (≤ 64k): sent whole.
	expect(predictOverflow(p, env(58_000, 62_000, 2_000), TYPESAFE)).toBe(false);
	// Same total but state + longest question exceeds 32k tokens.
	expect(predictOverflow(p, env(66_000, 54_000, 2_000), TYPESAFE)).toBe(true);
	// State + longest fits but the request-wide 64k is exceeded.
	expect(predictOverflow(p, env(40_000, 100_000, 2_000), TYPESAFE)).toBe(true);
	// An unknown channel without configured limits relies on learned rejections only.
	expect(predictOverflow(p, env(900_000, 9_000), undefined)).toBe(false);
});

test("learning uses the latest usable ratio and minimal rejection sizes, dominating in both dimensions", () => {
	const p = newCapacityProfile();
	observe(p, { outcome: "answered", inputTokens: 1000, stateBytes: 1500, questionBytes: 500 });
	observe(p, { outcome: "answered", inputTokens: 1000, stateBytes: 1600, questionBytes: 600 });
	expect(p.tokensPerByte).toBe(1000 / 2200);
	observe(p, { outcome: "overflow", stateBytes: 50_000, questionBytes: 5_000, longestQuestionBytes: 1_000 });
	observe(p, { outcome: "overflow", stateBytes: 60_000, questionBytes: 6_000, longestQuestionBytes: 1_000 }); // dominated: not kept
	expect(p.rejections).toHaveLength(1);
	expect(predictOverflow(p, env(50_000, 5_000, 1_000))).toBe(true);
	expect(predictOverflow(p, env(49_000, 9_000, 1_000))).toBe(false); // smaller state + longest question: not dominated
	observe(p, { outcome: "http_error", stateBytes: 1, questionBytes: 1, longestQuestionBytes: 1 }); // not an overflow: ignored
	expect(p.rejections).toHaveLength(1);
});

test("replay of the live smoke attempts: all 7 rejected envelopes are predicted, none of the 8 admitted ones", () => {
	// [stateBytes, questionBytes, provider inputTokens or rejected] from evidence.md live smoke (TypeSafe direct, jev-1.13.0).
	const live: [number, number, number | "overflow"][] = [
		[211114, 12440, "overflow"], [113295, 7671, "overflow"], [58918, 5140, "overflow"], [32610, 4097, 20789], [34990, 4150, 21629],
		[63504, 5691, "overflow"], [35373, 4407, 21111], [39072, 4651, 20036], [115672, 8343, "overflow"], [67256, 5808, "overflow"],
		[42994, 4721, 23042], [42155, 4767, 21751], [65980, 6162, "overflow"], [41133, 4926, 21242], [42429, 4916, 21345]];
	// Longest single question was about 1.7 KB (task_granularity) in that session.
	const p = newCapacityProfile();
	const predicted = live.map(([s, q]) => predictOverflow(p, env(s, q, 1_750), TYPESAFE));
	expect(predicted).toEqual(live.map(([, , t]) => t === "overflow"));
	// After learning the real usage the verdicts do not change.
	for (const [s, q, t] of live) observe(p, t === "overflow" ? { outcome: "overflow", stateBytes: s, questionBytes: q, longestQuestionBytes: 1_750 } : { outcome: "answered", inputTokens: t, stateBytes: s, questionBytes: q });
	expect(live.map(([s, q]) => predictOverflow(p, env(s, q, 1_750), TYPESAFE))).toEqual(live.map(([, , t]) => t === "overflow"));
});

const req = (stateChars: number, n = 2): AuditRequest => ({ state: "s".repeat(stateChars), model: "m",
	questions: Object.fromEntries(Array.from({ length: n }, (_, i) => [`q${i}`, { type: "choice" as const, instructions: `question ${i}`, criteria: { yes: "y", no: "n" } }])) });

test("an admitted larger different envelope retires size hints but never its exact rejection identity", async () => {
	const rejected = req(1000), profile = newCapacityProfile(), cache = newEvaluationCache();
	let calls = 0;
	const options: EvaluateOptions = { apiUrl: "http://jev", apiKey: "offline", timeoutMs: 1000, cache,
		capacity: { profile, limits: TYPESAFE }, fetchFn: async (_u, init) => {
			calls++;
			const r = JSON.parse(String(init!.body)) as AuditRequest;
			if (r.state === rejected.state) return new Response(JSON.stringify({ detail: { error_type: "max_tokens_exceeded" } }), { status: 400 });
			const s = sizeOf(r);
			return new Response(JSON.stringify({ usage: { input_tokens: (s.stateBytes + s.questionBytes) / 4 },
				answers: Object.fromEntries(Object.keys(r.questions).map((k) => [k, { choice: "yes", confidence: 0.9 }])) }));
		} };
	await evaluate(rejected, options);
	const admitted = { ...req(2000, 1), state: "different ".repeat(200) };
	expect((await evaluate(admitted, { ...options, sendIrreducible: true })).result.ok).toBe(true);
	const before = calls;
	expect((await evaluate({ ...admitted, questions: req(2000).questions }, options)).result.ok).toBe(true);
	expect(calls - before).toBe(1);
	const after = calls;
	expect((await evaluate(rejected, { ...options, sendIrreducible: true })).result.ok).toBe(false);
	expect(calls).toBe(after); expect(cache.rejected.size).toBe(1);
});

test("lower-density admissions permit later batches in memory and after diagnostic replay", async () => {
	const profile = newCapacityProfile(), attempts: Attempt[] = [], sent: AuditRequest[] = [];
	const options: EvaluateOptions = { apiUrl: "http://jev", apiKey: "offline", timeoutMs: 1000, cache: newEvaluationCache(),
		capacity: { profile, limits: TYPESAFE }, onAttempt: (a) => attempts.push(a),
		fetchFn: async (_u, init) => {
			const r = JSON.parse(String(init!.body)) as AuditRequest; sent.push(r);
			const size = sizeOf(r), ratio = sent.length === 1 ? 0.478 : 0.347;
			return new Response(JSON.stringify({ usage: { input_tokens: Math.ceil((size.stateBytes + size.questionBytes) * ratio), output_tokens: 1 },
				answers: Object.fromEntries(Object.keys(r.questions).map((k) => [k, { choice: "yes", confidence: 0.9 }])) }));
		} };
	await evaluate(req(1000, 1), options);
	await evaluate(req(70000, 1), { ...options, sendIrreducible: true });
	const restored = restoreCapacity([{ type: "custom", customType: LEDGER_TYPE, data: { kind: "diag", diag: { channel: "c", attempts } } },
		{ type: "custom", customType: LEDGER_TYPE, data: { kind: "diag", diag: { channel: "other", attempts: [{ outcome: "answered", inputTokens: 1000, stateBytes: 500, questionBytes: 500 }] } } },
		{ type: "custom", customType: LEDGER_TYPE, data: { kind: "diag", diag: { attempts: [] } } }], isOwnBookkeeping);
	for (const p of [profile, restored.get("c")!]) {
		const before = sent.length;
		const batch = await evaluate(req(70000), { ...options, cache: newEvaluationCache(), capacity: { profile: p, limits: TYPESAFE } });
		expect(batch.result.ok).toBe(true); expect(sent.length - before).toBe(1);
		expect(p.tokensPerByte).toBeLessThan(0.35);
		for (const inputTokens of [undefined, "unknown", 0, NaN, -1]) observe(p, { outcome: "answered", inputTokens, stateBytes: 1, questionBytes: 1 });
		expect(p.tokensPerByte).toBeLessThan(0.35);
	}
	expect(restored.get("other")?.tokensPerByte).toBe(1);
});

const answering = () => {
	const sent: AuditRequest[] = [];
	const fetchFn = async (_u: string, init?: RequestInit) => {
		const r = JSON.parse(String(init!.body)) as AuditRequest; sent.push(r);
		return new Response(JSON.stringify({ answers: Object.fromEntries(Object.keys(r.questions).map((k) => [k, { choice: "yes", confidence: 0.9 }])), usage: { input_tokens: 10, output_tokens: 1 } }));
	};
	return { sent, fetchFn };
};

test("a predicted overflow sends nothing, records no rejection and is reported as a pre-split", async () => {
	const { sent, fetchFn } = answering();
	const cache = newEvaluationCache(), rejects: string[] = [], attempts: unknown[] = [];
	let presplits = 0;
	const opts: EvaluateOptions = { apiUrl: "http://jev", apiKey: "k", timeoutMs: 1000, cache, fetchFn,
		capacity: { profile: newCapacityProfile(), limits: { stateAndLongestQuestion: 100 } },
		onReject: (e) => rejects.push(e), onAttempt: (a) => attempts.push(a), onPresplit: () => presplits++ };
	const out = await evaluate(req(1000), opts);
	expect(out.result.ok).toBe(false);
	expect(!out.result.ok && out.result.predicted && out.result.contextOverflow).toBe(true);
	expect(out.reuse.sent).toBe(0); expect(sent).toHaveLength(0); expect(attempts).toHaveLength(0);
	expect(rejects).toHaveLength(0); expect(cache.rejected.size).toBe(0); expect(presplits).toBe(1);
});

const task = { id: 4, subject: "Design review", status: "in_progress" as const };
const board = { tasks: [task], nextId: 5 };

test("an irreducible fixed-state prediction admits the useful batch before individual questions", async () => {
	const { sent, fetchFn } = answering();
	const opts: EvaluateOptions = { apiUrl: "http://jev", apiKey: "k", timeoutMs: 1000, cache: newEvaluationCache(), fetchFn,
		capacity: { profile: newCapacityProfile(), limits: { stateAndLongestQuestion: 10, request: 10 } } };
	const out = await reviewRolling({ board, context: collectContext([{ id: "u", type: "message", message: { role: "user", content: "Short." } }], [{ id: "task:4", value: task }]),
		processed: new Set(), inputKey: "k", model: "m", opts, commit: () => true });
	expect(out.final).toBe(true); expect(out.result.ok).toBe(true);
	expect(sent).toHaveLength(1);
	expect(Object.keys(sent[0].questions).length).toBeGreaterThan(1); // authoritative admission resolves the false fixed-floor prediction
	expect(out.recovered).toBe(false); // no real rejection happened
});

test("a direct context evaluation still sends single questions for admission instead of ending on a prediction", async () => {
	const { sent, fetchFn } = answering();
	const out = await auditWithContext(board, collectContext([], [{ id: "task:4", value: task }]), "m", { apiUrl: "http://jev", apiKey: "k", timeoutMs: 1000,
		cache: newEvaluationCache(), fetchFn, capacity: { profile: newCapacityProfile(), limits: { request: 1 } } });
	expect(out.result.ok).toBe(true);
	expect(sent.length).toBeGreaterThan(0);
	expect(sent.every((r) => Object.keys(r.questions).length === 1)).toBe(true);
});
