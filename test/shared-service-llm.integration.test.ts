/** Opt-in LLM wire tests: actual Pi Models/auth/Anthropic SSE through the v2 service, never live HTTP. */
import { expect, test } from "bun:test";
import { llmFixture as fixture, llmEvents as events, encodeLlmEvents as encode, llmSse as sse } from "./shared-llm-fixture.js";
const root = process.env.PI_JUDGMENT_SOURCE, piRoot = process.env.PI_CLASSIFIER_SOURCE;
const offlineTest = test.skipIf(!root || !piRoot);
const req = { state: { scope: "Waiting, no execution permission" }, questions: { action: { type: "choice", instructions: "Choose action", criteria: { blocked: "Await approval", go: "Authorized now" } } } };

offlineTest("LLM judge returns the terminal result; no numeric re-gate and no review surface", async () => {
	const f = await fixture();
	try {
		expect(f.service.version).toBe(2);
		expect(typeof (f.service as { review?: unknown }).review).toBe("undefined");
		expect((await f.service.judge(req)).stopReason).toBe("stop"); expect(f.wire).toHaveLength(1); f.wire.length = 0;
		const result = await f.service.judge(req, { minConfidence: 0.99, thresholds: { action: { metric: "choiceProbability", choice: "go", minimum: 0.99 } } });
		expect(result.stopReason).toBe("stop"); expect(result.backend).toBe("llm");
		expect(result.answers.action.choice).toBe("blocked"); expect(result.dropped).toEqual([]);
		expect(f.wire).toHaveLength(1); expect(f.wire[0].model).toBe(f.model.id);
		expect(f.wire[0].thinking.type).toBe("enabled");
		expect(Object.keys(f.wire[0].tools[0].input_schema.properties)).toEqual(["choice"]);
		expect(result.usage?.input).toBe(11);
		expect(JSON.stringify(result)).not.toContain("synthetic-llm-key");
		// Stateless: the identical call dispatches again, never a cache hit.
		expect((await f.service.judge(req)).stopReason).toBe("stop"); expect(f.wire).toHaveLength(2);
	} finally { f.close(); }
});

offlineTest("malformed discrete answer is retried once inside the terminal result; usage keeps its scope", async () => {
	const f = await fixture((_body, ordinal) => ordinal === 1 ? sse(events("not-a-choice", { input_tokens: 0 }, { output_tokens: 0, cost: 0 })) : sse(events("blocked", { input_tokens: 11 }, { cost: 0.25 })));
	try {
		const result = await f.service.judge(req);
		expect(result.stopReason).toBe("stop"); expect(result.answers.action.choice).toBe("blocked");
		expect(f.wire).toHaveLength(2); // one repair inside the same model attempt
		if (result.usage) expect(result.usage.input).toBe(11);
	} finally { f.close(); }
});

offlineTest("idle expiry aborts transport and late answers cannot publish", async () => {
	let body: ReadableStreamDefaultController<Uint8Array> | undefined, signal: AbortSignal | undefined, cancelled = false;
	const f = await fixture((_request, ordinal, init) => {
		if (ordinal !== 1) return sse();
		signal = init.signal!;
		return new Response(new ReadableStream({ start(controller) { body = controller; controller.enqueue(new TextEncoder().encode(encode(events().slice(0, 1)))); }, cancel() { cancelled = true; } }), { headers: { "content-type": "text/event-stream" } });
	});
	try {
		f.config.timeouts = { llm: { idleTimeoutMs: 100 } };
		const result = await f.service.judge(req);
		expect(result.stopReason === "error" || result.stopReason === "aborted").toBe(true); expect(result.answers).toEqual({});
		expect(signal?.aborted).toBe(true); expect(f.wire).toHaveLength(1);
		const snapshot = JSON.stringify(result);
		if (!cancelled) { body!.enqueue(new TextEncoder().encode(encode(events("go", {}, { output_tokens: 50, cost: 99 }).slice(1)))); body!.close(); }
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(JSON.stringify(result)).toBe(snapshot);
		f.config.timeouts = { llm: { idleTimeoutMs: 3000 } };
		expect((await f.service.judge(req)).answers.action.choice).toBe("blocked"); expect(f.wire).toHaveLength(2);
	} finally { f.close(); }
});

for (const [status, code] of [[400, "invalid_payload"], [401, "context_length_exceeded"], [500, "internal_error"]] as const) offlineTest(`HTTP ${status}/${code} reaches one terminal error without leaking bodies`, async () => {
	const f = await fixture(() => Response.json({ error: { type: "invalid_request_error", code, message: "context_length_exceeded PRIVATE-ERROR-BODY synthetic-llm-key" }, usage: { input_tokens: 0, cost: 0 } }, { status }));
	try {
		const result = await f.service.judge({ ...req, state: { a: "first fact", b: "later fact" } });
		expect(result.stopReason === "error" || result.stopReason === "aborted").toBe(true); expect(result.answers).toEqual({});
		expect(JSON.stringify(result)).not.toMatch(/PRIVATE-ERROR-BODY|synthetic-llm-key/);
	} finally { f.close(); }
});

offlineTest("caller cancellation settles the attempt and fences its late result", async () => {
	let resolveFirst: (() => void) | undefined;
	const f = await fixture((_body, ordinal) => ordinal === 1 ? new Promise<Response>((resolve) => { resolveFirst = () => resolve(sse()); }) : sse());
	try {
		const controller = new AbortController();
		const pending = f.service.judge(req, { signal: controller.signal });
		controller.abort();
		const result = await pending;
		expect(result.stopReason).toBe("aborted");
		resolveFirst?.();
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(result.answers).toEqual({});
	} finally { f.close(); }
});
