/** Stateless v2 accounting: only what the terminal result reports; no service ledger or observations. */
import { expect, test } from "bun:test";
import { nativeFixture } from "./shared-native-fixture.js";
const enabled = !!process.env.PI_JUDGMENT_SOURCE && !!process.env.PI_CLASSIFIER_SOURCE;
const q = { type: "choice" as const, instructions: "Choose", criteria: { yes: "Yes", no: "No" } };
const answers = (body: any) => Object.fromEntries(Object.keys(body.questions).map(id => [id, { type: "choice", choice: "yes", confidence: 0.9, probabilities: { yes: 1, no: 0 } }]));
const req = { state: { text: "admitted" }, questions: { A: q } };

test.skipIf(!enabled)("exact overflow rejection is terminal-classified; independent calls carry no service memory", async () => {
	const h = await nativeFixture(body => String(body.state.text).startsWith("rejected")
		? Response.json({ detail: { error_type: "max_tokens_exceeded" } }, { status: 400 })
		: Response.json({ answers: answers(body), usage: { input_tokens: 10 } }));
	const rejected = { state: { text: "rejected" }, questions: { A: q } };
	const first = await h.service.judge(rejected);
	expect(first.stopReason).toBe("error"); expect(first.contextOverflow).toBe(true); expect(first.answers).toEqual({});
	expect(h.wire).toHaveLength(1);
	// Stateless: the identical call is dispatched again — no rejection memory suppresses it.
	const again = await h.service.judge(rejected);
	expect(again.contextOverflow).toBe(true); expect(h.wire).toHaveLength(2);
	expect((await h.service.judge({ ...rejected, state: { text: "admitted" } })).stopReason).toBe("stop");
});

for (const input of [17, -1, "invalid", undefined]) test.skipIf(!enabled)(`provider accounting: invalid native members fail the judgment without invented usage (${input})`, async () => {
	const h = await nativeFixture(() => Response.json({ model: "typesafe/jev-reported", id: "not-ledger-data", provider: "not-ledger-data", answers: { A: { choice: "illegal", confidence: 4 } }, usage: { input_tokens: input, output_tokens: 0, cost: 0.004 } }), 32000, { model: { provider: "openrouter", id: "typesafe/jev-latest", baseUrl: "https://openrouter.ai/api/v1" } });
	const result = await h.service.judge(req);
	expect(result.stopReason).toBe("error"); expect(result.answers).toEqual({});
	expect(JSON.stringify(result)).not.toContain("not-ledger-data");
});

test.skipIf(!enabled)("OpenRouter typed overflow is terminal; reported usage keeps its attempt scope", async () => {
	const h = await nativeFixture(body => Object.keys(body.questions).length > 1
		? Response.json({ error: { metadata: { error_type: "context_length_exceeded" } }, usage: { input_tokens: 7 } }, { status: 400 })
		: Response.json({ answers: answers(body), usage: { input_tokens: 10, output_tokens: 2, cost: 0.005 } }), 32000, { model: { provider: "openrouter", id: "typesafe/jev-latest", baseUrl: "https://openrouter.ai/api/v1" } });
	const result = await h.service.judge({ state: {}, questions: { A: q, B: q } });
	expect(result.stopReason).toBe("error"); expect(result.contextOverflow).toBe(true); expect(result.answers).toEqual({});
	expect(h.wire).toHaveLength(1);
	const admitted = await h.service.judge({ state: {}, questions: { A: q } });
	expect(admitted.stopReason).toBe("stop");
	if (admitted.usage) expect(admitted.usage.input).toBe(10);
});

for (const status of [401, 402, 422]) test.skipIf(!enabled)(`error ownership: HTTP ${status} never classifies as context overflow`, async () => {
	const h = await nativeFixture(() => Response.json({ error: { code: "invalid_payload", message: "context_length_exceeded" } }, { status, headers: { "retry-after": "0" } }));
	const result = await h.service.judge({ state: {}, questions: { A: q, B: q } });
	expect(result.stopReason).toBe("error"); expect(result.contextOverflow).not.toBe(true); expect(result.answers).toEqual({});
});
