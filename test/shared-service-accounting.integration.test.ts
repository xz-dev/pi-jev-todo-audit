/** Additional exact-rejection and provider-accounting transfer cases, using the existing real adapter fixture. */
import { expect, test } from "bun:test";
import { nativeFixture } from "./shared-native-fixture.js";
const enabled = !!process.env.PI_JUDGMENT_SOURCE && !!process.env.PI_CLASSIFIER_SOURCE;
const q = { type: "choice" as const, instructions: "Choose", criteria: { yes: "Yes", no: "No" } };
const answers = (body: any) => Object.fromEntries(Object.keys(body.questions).map(id => [id, { type: "choice", choice: "yes", confidence: 0.9, probabilities: { yes: 1, no: 0 } }]));

test.skipIf(!enabled)("exact rejection survives corrected size hints and protects a single-question superset", async () => {
	const h = await nativeFixture(body => body.state.fixed.text.startsWith("rejected")
		? Response.json({ detail: { error_type: "max_tokens_exceeded" } }, { status: 400 })
		: Response.json({ answers: answers(body), usage: { input_tokens: 10 } }));
	const rejected = { state: { text: "rejected ".repeat(1000) }, questions: { A: q } };
	expect((await h.service.review(rejected)).contextOverflow).toBe(true); expect(h.wire).toHaveLength(1);
	expect((await h.service.review({ ...rejected, state: { text: "admitted ".repeat(2000) } })).stopReason).toBe("stop");
	h.service.refreshBranch();
	const before = h.wire.length, result = await h.service.review({ ...rejected, questions: { A: q, B: q } });
	expect(result.stopReason).toBe("error"); expect(result.contextOverflow).toBe(true); expect(result.answers).toEqual({});
	expect(h.wire).toHaveLength(before); expect(result.diagnostics.rejectedReuses).toBeGreaterThan(0);
});

for (const input of [17, -1, "invalid", undefined]) test.skipIf(!enabled)(`provider accounting: invalid native members keep reported model/charge and presence (${input})`, async () => {
	const h = await nativeFixture(() => Response.json({ model: "typesafe/jev-reported", id: "not-ledger-data", provider: "not-ledger-data", answers: { A: { choice: "illegal", confidence: 4 } }, usage: { input_tokens: input, output_tokens: 0, cost: 0.004 } }), 32000, [], { model: { provider: "openrouter", id: "typesafe/jev-latest", baseUrl: "https://openrouter.ai/api/v1" } });
	const result = await h.service.review({ state: {}, questions: { A: q } });
	expect(result.stopReason).toBe("error"); expect(result.answers).toEqual({}); expect(result.progress.stages).toEqual([]);
	expect(result.diagnostics.attemptCount).toBe(1); expect(result.diagnostics.attempts[0].model).toBe("typesafe/jev-reported");
	expect(result.diagnostics.usage.inputTokens).toEqual({ knownSum: input === 17 ? 17 : 0, missing: input === 17 ? 0 : 1 });
	expect(result.diagnostics.usage.outputTokens).toEqual({ knownSum: 0, missing: 0 });
	expect(result.diagnostics.usage.costUsd).toEqual({ knownSum: 0.004, missing: 0 });
	// The native observer supplies reported charges, not catalog estimates.
	expect(result.diagnostics.catalogCostUsd).toBeUndefined();
	expect(JSON.stringify(h.rows)).not.toContain("not-ledger-data");
});

test.skipIf(!enabled)("attempt identities cannot collide across service reloads at the same clock value", async () => {
	const first = await nativeFixture(body => Response.json({ answers: answers(body), usage: { input_tokens: 3, cost: 0.01 } }));
	const second = await nativeFixture(body => Response.json({ answers: answers(body), usage: { input_tokens: 7, cost: 0.02 } }), 100000, first.rows);
	const now = Date.now;
	try {
		Date.now = () => 1700000000000;
		const a = await first.service.review({ state: { revision: 1 }, questions: { A: q } });
		second.service.refreshBranch();
		const b = await second.service.review({ state: { revision: 2 }, questions: { A: q } });
		expect(a.diagnostics.attemptCount).toBe(1); expect(b.diagnostics.attemptCount).toBe(1);
		expect(a.diagnostics.attempts[0].id).not.toBe(b.diagnostics.attempts[0].id);
		const observed = first.rows.filter(row => row.data.kind === "review-attempt");
		expect(new Set(observed.map(row => row.data.attempt.id)).size).toBe(2);
	} finally { Date.now = now; }
});

test.skipIf(!enabled)("OpenRouter typed overflow recovers; response charges remain distinct from estimates", async () => {
	const h = await nativeFixture(body => Object.keys(body.questions).length > 1
		? Response.json({ error: { metadata: { error_type: "context_length_exceeded" } }, usage: { input_tokens: 7 } }, { status: 400 })
		: Response.json({ answers: answers(body), usage: { input_tokens: 10, output_tokens: 2, cost: 0.005 } }), 32000, [], { model: { provider: "openrouter", id: "typesafe/jev-latest", baseUrl: "https://openrouter.ai/api/v1" } });
	const result = await h.service.review({ state: {}, questions: { A: q, B: q } });
	expect(result.stopReason).toBe("stop"); expect(Object.keys(result.answers).sort()).toEqual(["A", "B"]);
	expect(result.diagnostics.attemptCount).toBe(3); expect(h.wire).toHaveLength(3);
	expect(result.diagnostics.usage.inputTokens).toEqual({ knownSum: 27, missing: 0 });
	expect(result.diagnostics.usage.outputTokens).toEqual({ knownSum: 4, missing: 1 });
	expect(result.diagnostics.usage.costUsd).toEqual({ knownSum: 0.01, missing: 1 });
	const again = await h.service.review({ state: {}, questions: { A: q, B: q } });
	expect(again.diagnostics.attemptCount).toBe(0); expect(again.diagnostics.usage.costUsd.knownSum).toBe(0);
});
