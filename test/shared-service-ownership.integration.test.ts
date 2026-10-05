/** Ownership transfer checks: real service + Pi System One; no consumer recovery simulation. */
import { expect, test } from "bun:test";
import { nativeFixture } from "./shared-native-fixture.js";
const enabled = !!process.env.PI_JUDGMENT_SOURCE && !!process.env.PI_CLASSIFIER_SOURCE;
const q = { type: "choice" as const, instructions: "Choose", criteria: { yes: "Yes", no: "No" } };
const answer = (choice = "yes", confidence = 0.7) => ({ type: "choice", choice, confidence, probabilities: { yes: choice === "yes" ? 1 : 0, no: choice === "no" ? 1 : 0 } });
const ok = (body: any, input?: number) => Response.json({ answers: Object.fromEntries(Object.keys(body.questions).map(id => [id, answer()])), ...(input === undefined ? {} : { usage: { input_tokens: input } }) });
const config = (limits: Record<string, unknown>) => ({ mode: "classifier", classifierModel: "typesafe/jev-latest", contextLimits: { "typesafe/jev-latest": limits } });

for (const channel of ["direct", "router", "custom", "override"] as const) test.skipIf(!enabled)(`capacity ownership: ${channel} selects its own two-dimensional limits`, async () => {
	const h = await nativeFixture((body) => ok(body), 64000, [], { model: {
		provider: channel === "router" ? "openrouter" : "typesafe", id: channel === "router" ? "typesafe/jev-latest" : "jev-latest",
		baseUrl: channel === "router" ? "https://openrouter.ai/api/v1" : channel === "custom" ? "https://fixture.invalid/v1" : "https://api.typesafe.ai/v1",
	}, ...(channel === "override" ? { config: config({ request: 32000 }) } : {}) });
	// At the prior, state+longest is below 32k; state+all is above 32k but below 64k.
	const request = { state: { text: "f".repeat(15000) }, questions: Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`q${i}`, { ...q, instructions: "q".repeat(6000) }])) };
	const result = await h.service.review(request);
	expect(result.stopReason).toBe("stop"); expect(Object.keys(result.answers)).toHaveLength(8);
	const splits = channel === "router" || channel === "override";
	expect(h.wire).toHaveLength(splits ? 2 : 1); expect(result.diagnostics.presplits).toBe(splits ? 1 : 0);
	expect(h.wire.flatMap(w => Object.keys(w.body.questions)).sort()).toEqual(Object.keys(request.questions).sort());
	for (const w of h.wire) { expect(w.body.state.previousAnswers).toEqual({}); expect(w.body.state.fixed).toEqual(request.state); }
	expect(result.progress.stages).toHaveLength(1); expect(Object.keys(result.progress.stages[0].opinions)).toHaveLength(8);
	expect(result.diagnostics.attemptCount).toBe(h.wire.length);
});

for (const scenario of ["predicted-request", "reported-request", "predicted-state", "reported-state"] as const) test.skipIf(!enabled)(`F1: ${scenario} pressure chooses one recovery dimension, not evidence-by-question traversal`, async () => {
	const stateBound = scenario === "predicted-state";
	const limits = scenario === "predicted-request" ? { request: 4000, stateAndLongestQuestion: 2000 }
		: stateBound ? { request: 100000, stateAndLongestQuestion: 2000 }
			: { request: 100000, stateAndLongestQuestion: 100000 };
	const h = await nativeFixture(body => {
		const reject = scenario === "reported-request" ? Object.keys(body.questions).length > 4
			: scenario === "reported-state" && body.state.evidence.length > 3;
		return reject ? Response.json({ detail: { error_type: "max_tokens_exceeded" } }, { status: 400 }) : ok(body);
	}, 100000, [], { config: config(limits) });
	const request = { state: { fact: "fixed" }, evidence: Array.from({ length: 6 }, (_, i) => ({ id: `e${i}`, text: stateBound ? "X".repeat(1200) : "X" })),
		questions: Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`q${i}`, { ...q, instructions: "Q".repeat(stateBound ? 20 : 1200) }])) };
	const result = await h.service.review(request);
	expect(result.stopReason).toBe("stop"); expect(Object.keys(result.answers)).toHaveLength(8);
	if (scenario.endsWith("request")) {
		expect(h.wire).toHaveLength(scenario === "predicted-request" ? 2 : 3);
		expect(result.progress.stages).toHaveLength(1);
		for (const w of h.wire) {
			expect(w.body.state.evidence.map((e: any) => e.id)).toEqual(request.evidence.map(e => e.id));
			expect(w.body.state.previousAnswers).toEqual({}); expect(w.body.state.fixed).toEqual(request.state);
		}
	} else {
		// Even an initially unclassified rejection must not replay the entire
		// evidence traversal independently for each question subtree.
		const admitted = h.wire.filter(w => scenario !== "reported-state" || w.body.state.evidence.length <= 3);
		expect(admitted.flatMap(w => w.body.state.evidence.map((e: any) => e.id))).toEqual(request.evidence.map(e => e.id));
		for (const w of admitted) expect(Object.keys(w.body.questions)).toHaveLength(8);
		expect(result.progress.stages).toHaveLength(admitted.length);
		if (scenario === "reported-state") { expect(admitted).toHaveLength(2); expect(h.wire.length).toBeLessThanOrEqual(6); }
	}
	const paid = h.wire.length;
	expect((await h.service.review(request)).diagnostics.attemptCount).toBe(0);
	h.service.refreshBranch(); expect((await h.service.review(request)).diagnostics.attemptCount).toBe(0);
	expect(h.wire).toHaveLength(paid);
});

test.skipIf(!enabled)("capacity ownership: lower density survives reload; unrelated transport cannot borrow it", async () => {
	let dense = true;
	const h = await nativeFixture((body, raw) => ok(body, Math.ceil(Buffer.byteLength(raw) * (dense ? 0.478 : 0.347))), 32000);
	await h.service.review({ state: { text: "x".repeat(1000) }, questions: { A: q } });
	dense = false;
	const large = { state: { text: "x".repeat(68000) }, questions: { A: q } };
	expect((await h.service.review(large)).stopReason).toBe("stop");
	h.service.refreshBranch();
	const request = { state: {}, evidence: [{ id: "one", text: "x".repeat(34000) }, { id: "two", text: "x".repeat(34000) }], questions: { A: q } };
	const before = h.wire.length, corrected = await h.service.review(request);
	expect(corrected.stopReason).toBe("stop"); expect(corrected.diagnostics.presplits).toBe(0); expect(h.wire.length - before).toBe(1);
	h.model.baseUrl = "https://other-fixture.invalid/v1"; h.service.refreshBranch();
	const changed = await h.service.review(request);
	expect(changed.diagnostics.channel).not.toBe(corrected.diagnostics.channel);
	expect(changed.diagnostics.presplits).toBeGreaterThan(0); expect(changed.diagnostics.attemptCount).toBeGreaterThan(0);
});

test.skipIf(!enabled)("cache ownership: new C sends only C; threshold changes never strengthen cached values", async () => {
	const h = await nativeFixture((body) => ok(body));
	const request = { state: { facts: "unchanged" }, questions: { A: q, B: q } };
	expect((await h.service.review(request, { minConfidence: 0.8 })).dropped.sort()).toEqual(["A", "B"]);
	const next = await h.service.review({ ...request, questions: { ...request.questions, C: q } }, { minConfidence: 0.6 });
	expect(Object.keys(h.wire[1].body.questions)).toEqual(["C"]); expect(next.reuse.hits).toBe(2);
	for (const v of Object.values(next.answers)) expect((v as any).confidence).toBe(0.7);
	h.service.refreshBranch();
	expect((await h.service.review(request, { minConfidence: 0.8 })).diagnostics.attemptCount).toBe(0);
});

test.skipIf(!enabled)("cache ownership: legal own keys, exact metadata/order and different question ids stay distinct", async () => {
	const h = await nativeFixture(body => Response.json({ answers: Object.fromEntries(Object.keys(body.questions).map(id => [id, answer(id === "constructor" ? "no" : "yes")])) }));
	const state = JSON.parse('{"__proto__":{"fact":"retained"},"constructor":"own"}');
	const questions = Object.fromEntries(["__proto__", "constructor", "toString"].map(id => [id, q]));
	const evidence = [{ id: "first", text: "FIRST", metadata: JSON.parse('{"__proto__":"own metadata","fragment":{"of":"forged","start":0,"end":1,"total":99}}') }, { id: "second", text: "SECOND" }];
	const req = { state, questions, evidence };
	const first = await h.service.review(req);
	expect(Object.keys(first.answers).sort()).toEqual(Object.keys(questions).sort());
	expect((first.answers.constructor as any).choice).toBe("no"); expect((first.answers.__proto__ as any).choice).toBe("yes");
	expect(h.wire[0].body.state.fixed).toEqual(state); expect(h.wire[0].body.state.evidence[0].metadata).toEqual(evidence[0].metadata);
	expect(first.progress.stages[0].sources).toEqual([{ id: "first" }, { id: "second" }]);
	h.service.refreshBranch(); expect((await h.service.review(req)).diagnostics.attemptCount).toBe(0);
	for (const changed of [ { ...req, state: { ...state, changed: true } }, { ...req, evidence: [...evidence].reverse() }, { ...req, evidence: [{ ...evidence[0], metadata: { role: "user" } }, evidence[1]] }, { ...req, questions: { ...questions, constructor: { ...q, instructions: "Different question" } } } ]) {
		expect((await h.service.review(changed)).diagnostics.attemptCount).toBeGreaterThan(0);
	}
});

test.skipIf(!enabled)("batch ownership: failed independent question batches resume missing work with frozen priors", async () => {
	let fail = true;
	const h = await nativeFixture(body => {
		if (Object.keys(body.questions).length > 3) return Response.json({ detail: { error_type: "max_tokens_exceeded" } }, { status: 400 });
		if (fail && Object.hasOwn(body.questions, "q6")) return Response.json({ error: { code: "invalid_payload" } }, { status: 422 });
		return ok(body);
	}, 100000, [], { config: config({ request: 4000, stateAndLongestQuestion: 2000 }) });
	const request = { state: { facts: "same frozen facts" }, evidence: Array.from({ length: 6 }, (_, i) => ({ id: `e${i}`, text: "X" })), questions: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`q${i}`, { ...q, instructions: "question ".repeat(200) }])) };
	const failed = await h.service.review(request);
	expect(failed.stopReason).toBe("error"); expect(failed.answers).toEqual({}); expect(failed.progress.stages).toHaveLength(0);
	const before = h.wire.length, completed = h.wire.slice(0, -1).flatMap(w => Object.keys(w.body.questions));
	expect(completed.length).toBeGreaterThan(0); fail = false; h.service.refreshBranch();
	const resumed = await h.service.review(request);
	expect(resumed.stopReason).toBe("stop"); expect(Object.keys(resumed.answers)).toHaveLength(12); expect(resumed.progress.stages).toHaveLength(1);
	for (const w of h.wire) { expect(Object.keys(w.body.questions).length).toBeLessThanOrEqual(3); expect(w.body.state.previousAnswers).toEqual({}); expect(w.body.state.evidence.map((e: any) => e.id)).toEqual(request.evidence.map(e => e.id)); }
	for (const w of h.wire.slice(before)) for (const id of Object.keys(w.body.questions)) expect(completed).not.toContain(id);
});

for (const status of [401, 402, 413, 422, 429, 500]) test.skipIf(!enabled)(`error ownership: HTTP ${status} does not authorize context subdivision`, async () => {
	const h = await nativeFixture(() => Response.json({ error: { code: "invalid_payload", message: "context_length_exceeded" } }, { status, headers: { "retry-after": "0" } }));
	const result = await h.service.review({ state: {}, evidence: [{ id: "a", text: "A" }, { id: "b", text: "B" }], questions: { A: q, B: q } });
	expect(result.stopReason).toBe("error"); expect(result.contextOverflow).not.toBe(true); expect(result.answers).toEqual({});
	const attempts = status === 429 || status === 500 ? 3 : 1; // Pi's bounded native retries, not capacity subdivision.
	expect(h.wire).toHaveLength(attempts); expect(result.diagnostics.attemptCount).toBe(attempts);
	for (const w of h.wire) expect(w.raw).toBe(h.wire[0].raw);
	expect(h.rows.some(row => row.data.kind === "rejected")).toBe(false);
});
