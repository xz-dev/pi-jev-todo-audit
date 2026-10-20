/** Ownership transfer checks for the stateless v2 contract: declared capacity only, no learned ratios or caches. */
import { expect, test } from "bun:test";
import { nativeFixture } from "./shared-native-fixture.js";
const enabled = !!process.env.PI_JUDGMENT_SOURCE && !!process.env.PI_CLASSIFIER_SOURCE;
const q = { type: "choice" as const, instructions: "Choose", criteria: { yes: "Yes", no: "No" } };
const answer = (choice = "yes", confidence = 0.7) => ({ type: "choice", choice, confidence, probabilities: { yes: choice === "yes" ? 1 : 0, no: choice === "no" ? 1 : 0 } });
const ok = (body: any, input?: number) => Response.json({ answers: Object.fromEntries(Object.keys(body.questions).map(id => [id, answer()])), ...(input === undefined ? {} : { usage: { input_tokens: input } }) });
const config = (limits: Record<string, unknown>) => ({ mode: "classifier", classifierModel: "typesafe/jev-latest", contextLimits: { "typesafe/jev-latest": limits } });

for (const channel of ["direct", "router", "custom", "override"] as const) test.skipIf(!enabled)(`capacity ownership: ${channel} declares only its own limits`, async () => {
	const h = await nativeFixture((body) => ok(body), 64000, { model: {
		provider: channel === "router" ? "openrouter" : "typesafe", id: channel === "router" ? "typesafe/jev-latest" : "jev-latest",
		baseUrl: channel === "router" ? "https://openrouter.ai/api/v1" : channel === "custom" ? "https://fixture.invalid/v1" : "https://api.typesafe.ai/v1",
	}, ...(channel === "override" ? { config: config({ request: 32000 }) } : {}) });
	const result = await h.service.judge({ state: { text: "f".repeat(100) }, questions: { A: q } });
	expect(result.stopReason).toBe("stop");
	expect(result.capacity?.backend).toBe("classifier");
	expect(result.capacity?.limitSource).toBe(channel === "override" ? "override" : "model");
	if (channel === "override") expect(result.capacity?.limits.request).toBe(32000);
	else expect(result.capacity?.limits.contextWindow).toBe(64000);
	// v2 declared shape: no learned ratios, channel profiles or priors.
	const capacity = result.capacity as unknown as Record<string, unknown>;
	expect(capacity.tokensPerByte).toBeUndefined();
	expect(capacity.prior).toBeUndefined();
	expect(capacity.envelopeOverheadBytes).toBeUndefined();
	expect(capacity.channel).toBeUndefined();
});

test.skipIf(!enabled)("identical calls are independent: no service cache, ledger or learned density", async () => {
	let dense = true;
	const h = await nativeFixture((body, raw) => ok(body, Math.ceil(Buffer.byteLength(raw) * (dense ? 0.478 : 0.347))), 32000);
	const request = { state: { text: "x".repeat(1000) }, questions: { A: q } };
	const first = await h.service.judge(request);
	expect(first.stopReason).toBe("stop");
	dense = false;
	// The identical call must re-dispatch: stateless means no hit, join or saved rejection.
	const second = await h.service.judge(request);
	expect(second.stopReason).toBe("stop"); expect(h.wire).toHaveLength(2);
});

test.skipIf(!enabled)("error ownership: non-overflow HTTP errors do not authorize subdivision and stay one terminal result", async () => {
	for (const status of [401, 402, 422]) {
		const h = await nativeFixture(() => Response.json({ error: { code: "invalid_payload", message: "context_length_exceeded" } }, { status, headers: { "retry-after": "0" } }));
		const result = await h.service.judge({ state: {}, questions: { A: q, B: q } });
		expect(result.stopReason).toBe("error"); expect(result.contextOverflow).not.toBe(true); expect(result.answers).toEqual({});
	}
});

test.skipIf(!enabled)("explicit overflow is terminal for this attempt; a retried call is a fresh attempt", async () => {
	let reject = true;
	const h = await nativeFixture(() => reject
		? Response.json({ detail: { error_type: "max_tokens_exceeded" } }, { status: 400 })
		: Response.json({ answers: { A: answer() }, usage: { input_tokens: 5 } }));
	const failed = await h.service.judge({ state: {}, questions: { A: q } });
	expect(failed.stopReason).toBe("error"); expect(failed.contextOverflow).toBe(true); expect(failed.answers).toEqual({});
	reject = false;
	const admitted = await h.service.judge({ state: {}, questions: { A: q } });
	expect(admitted.stopReason).toBe("stop"); expect(admitted.answers.A).toBeDefined();
	expect(h.wire).toHaveLength(2);
});
