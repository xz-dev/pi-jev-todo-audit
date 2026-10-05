/** Opt-in LLM wire tests: actual Pi Models/auth/Anthropic SSE, never live HTTP. */
import { expect, test } from "bun:test";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const root = process.env.PI_JUDGMENT_SOURCE, piRoot = process.env.PI_CLASSIFIER_SOURCE;
const offlineTest = test.skipIf(!root || !piRoot);
const req = { state: { scope: "Waiting, no execution permission" }, questions: { action: { type: "choice", instructions: "Choose action", criteria: { blocked: "Await approval", go: "Authorized now" } } } };
const encode = (events: unknown[]) => events.map((event: any) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join("");
function events(choice = "blocked", input: object = { input_tokens: 11 }, output: object = {}) {
	return [
		{ type: "message_start", message: { id: "fixture-message", type: "message", role: "assistant", model: "claude-sonnet-4-5", content: [], stop_reason: null, stop_sequence: null, usage: input } },
		{ type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "fixture-tool", name: "answer", input: {} } },
		{ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify({ choice }) } },
		{ type: "content_block_stop", index: 0 },
		{ type: "message_delta", delta: { stop_reason: "tool_use", stop_sequence: null }, usage: output },
		{ type: "message_stop" },
	];
}
const sse = (items = events()) => new Response(encode(items), { headers: { "content-type": "text/event-stream" } });
async function fixture(transport: (body: any, ordinal: number, init: RequestInit) => Response | Promise<Response> = () => sse()) {
	const { createJudgmentService } = await import(pathToFileURL(join(root!, "src/service.ts")).href);
	const { validateConfig } = await import(pathToFileURL(join(root!, "src/config.ts")).href);
	const { createModels, createProvider } = await import(pathToFileURL(join(piRoot!, "packages/ai/src/models.ts")).href);
	const { anthropicMessagesApi } = await import(pathToFileURL(join(piRoot!, "packages/ai/src/api/anthropic-messages.lazy.ts")).href);
	const model = { id: "claude-sonnet-4-5", name: "Offline", provider: "offline", api: "anthropic-messages", baseUrl: "https://fixture.invalid", reasoning: true, input: ["text"], maxTokens: 8192, contextWindow: 200000, cost: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 } };
	const models = createModels();
	models.setProvider(createProvider({ id: "offline", models: [model], auth: { apiKey: { name: "Offline", resolve: async () => ({ auth: { apiKey: "synthetic-llm-key" } }) } }, api: anthropicMessagesApi() }));
	const original = globalThis.fetch;
	const wire: any[] = [], rows: any[] = [];
	globalThis.fetch = (async (url: unknown, init: any) => {
		if (!String(url).startsWith("https://fixture.invalid/")) throw new Error("live transport forbidden");
		const body = JSON.parse(init.body); wire.push(body);
		return transport(body, wire.length, init);
	}) as typeof fetch;
	const config = validateConfig({ mode: "llm", model: "offline/claude-sonnet-4-5", thinkingLevel: "low", classifierModel: "unused/never", timeoutMs: 3000 }).config;
	const registry = { getModel: models.getModel.bind(models), getAvailableOfType: async () => [], getAuth: models.getAuth.bind(models), getProviders: models.getProviders.bind(models), streamSimple: models.streamSimple.bind(models), classify: () => { throw new Error("must not use native"); } };
	const service = createJudgmentService({ config: () => config,
		ledger: { branch: () => rows, append: (customType: string, data: unknown) => rows.push({ type: "custom", customType, data }) }, registry });
	return { service, registry, config, model, wire, rows, close: () => { globalThis.fetch = original; } };
}

offlineTest("LLM review observes real SSE attempts and ignores native numeric gates", async () => {
	const f = await fixture();
	try {
		expect((await f.service.judge(req)).stopReason).toBe("stop"); expect(f.wire).toHaveLength(1); f.wire.length = 0;
		const result = await f.service.review(req, { minConfidence: 0.99, thresholds: { action: { metric: "choiceProbability", choice: "go", minimum: 0.99 } } });
		expect(result.stopReason).toBe("stop"); expect(result.backend).toBe("llm");
		expect(result.answers.action.choice).toBe("blocked"); expect(result.unresolved).toEqual([]);
		expect(f.wire).toHaveLength(1); expect(f.wire[0].model).toBe(f.model.id);
		expect(f.wire[0].thinking.type).toBe("enabled");
		expect(Object.keys(f.wire[0].tools[0].input_schema.properties)).toEqual(["choice"]);
		expect(result.diagnostics.attemptCount).toBe(1);
		expect(result.diagnostics.usage.inputTokens).toEqual({ knownSum: 11, missing: 0 });
		expect(result.diagnostics.usage.outputTokens).toEqual({ knownSum: 0, missing: 1 });
		expect(result.diagnostics.usage.costUsd).toEqual({ knownSum: 0, missing: 1 });
		expect(result.diagnostics.catalogCostUsd.knownSum).toBeCloseTo(0.000055, 9);
		expect(result.diagnostics.catalogCostUsd.missing).toBe(1);
		expect((await f.service.review(req)).diagnostics.attemptCount).toBe(0); expect(f.wire).toHaveLength(1);
		expect(JSON.stringify(f.rows)).not.toContain("synthetic-llm-key");
	} finally { f.close(); }
});

offlineTest("malformed discrete answer retries count actual sends; zero, missing and catalog estimates differ", async () => {
	const f = await fixture((_body, ordinal) => ordinal === 1 ? sse(events("not-a-choice", { input_tokens: 0 }, { output_tokens: 0, cost: 0 })) : sse(events("blocked", { input_tokens: 11 }, { cost: 0.25 })));
	try {
		const result = await f.service.review(req);
		expect(result.stopReason).toBe("stop"); expect(result.answers.action.choice).toBe("blocked");
		expect(f.wire).toHaveLength(2); expect(result.diagnostics.attemptCount).toBe(2);
		expect(result.diagnostics.attempts.map((a: any) => a.phase)).toEqual(["end", "end"]);
		expect(new Set(result.diagnostics.attempts.map((a: any) => a.id)).size).toBe(2);
		expect(result.diagnostics.usage.inputTokens).toEqual({ knownSum: 11, missing: 0 });
		expect(result.diagnostics.usage.outputTokens).toEqual({ knownSum: 0, missing: 1 });
		expect(result.diagnostics.usage.costUsd).toEqual({ knownSum: 0.25, missing: 0 });
		expect(result.diagnostics.catalogCostUsd.knownSum).toBeCloseTo(0.000055, 9);
		expect(result.diagnostics.catalogCostUsd.missing).toBe(1);
		expect(f.rows.filter((r) => r.data.kind === "review-attempt" && r.data.attempt.phase === "start")).toHaveLength(2);
		expect((await f.service.review(req)).diagnostics.attemptCount).toBe(0); expect(f.wire).toHaveLength(2);
	} finally { f.close(); }
});

offlineTest("deadline keeps unfinished SSE usage and cannot accept late answers or charges", async () => {
	let body: ReadableStreamDefaultController<Uint8Array> | undefined, signal: AbortSignal | undefined, cancelled = false;
	const f = await fixture((_request, ordinal, init) => {
		if (ordinal !== 1) return sse();
		signal = init.signal!;
		return new Response(new ReadableStream({ start(controller) { body = controller; controller.enqueue(new TextEncoder().encode(encode(events().slice(0, 1)))); }, cancel() { cancelled = true; } }), { headers: { "content-type": "text/event-stream" } });
	});
	try {
		f.config.timeoutMs = 100;
		const result = await f.service.review(req);
		expect(result.stopReason).toBe("error"); expect(result.answers).toEqual({});
		expect(signal?.aborted).toBe(true); expect(f.wire).toHaveLength(1);
		expect(result.diagnostics.attempts[0].phase).toBe("start");
		expect(result.diagnostics.usage.inputTokens).toEqual({ knownSum: 11, missing: 0 });
		expect(result.diagnostics.usage.outputTokens).toEqual({ knownSum: 0, missing: 1 });
		const snapshot = JSON.stringify({ result, rows: f.rows });
		if (!cancelled) { body!.enqueue(new TextEncoder().encode(encode(events("go", {}, { output_tokens: 50, cost: 99 }).slice(1)))); body!.close(); }
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(JSON.stringify({ result, rows: f.rows })).toBe(snapshot);
		f.config.timeoutMs = 3000;
		expect((await f.service.review(req)).answers.action.choice).toBe("blocked"); expect(f.wire).toHaveLength(2);
	} finally { f.close(); }
});

for (const [status, code] of [[400, "invalid_payload"], [401, "context_length_exceeded"], [429, "context_length_exceeded"], [413, "context_length_exceeded"], [500, "internal_error"]] as const) offlineTest(`HTTP ${status}/${code} is not context recovery or an unobserved SDK retry`, async () => {
	const f = await fixture(() => Response.json({ error: { type: "invalid_request_error", code, message: "context_length_exceeded PRIVATE-ERROR-BODY synthetic-llm-key" }, usage: { input_tokens: 0, cost: 0 } }, { status }));
	try {
		const result = await f.service.review({ ...req, evidence: [{ id: "a", text: "first fact" }, { id: "b", text: "later fact" }] });
		expect(result.stopReason).toBe("error"); expect(result.answers).toEqual({});
		expect(f.wire).toHaveLength(1); expect(result.diagnostics.attemptCount).toBe(1);
		expect(result.diagnostics.attempts[0].errorCategory).not.toBe("overflow");
		expect(result.diagnostics.usage.costUsd).toEqual({ knownSum: 0, missing: 0 });
		expect(result.diagnostics.usage.outputTokens).toEqual({ knownSum: 0, missing: 1 });
		expect(JSON.stringify({ result, rows: f.rows })).not.toMatch(/PRIVATE-ERROR-BODY|synthetic-llm-key/);
	} finally { f.close(); }
});

offlineTest("overlapping hidden fetches remain visible but never invent a preceding completion", async () => {
	const f = await fixture();
	const stream = f.registry.streamSimple;
	f.registry.streamSimple = (model: any, context: any, options: any) => stream(model, context, { ...options,
		fetch: async (url: unknown, init: RequestInit) => {
			await options.fetch(url, init); // Deliberately faulty adapter: first response never consumed.
			return options.fetch(url, init);
		},
	});
	try {
		const result = await f.service.review(req);
		expect(result.stopReason).toBe("error"); expect(result.answers).toEqual({});
		expect(f.wire).toHaveLength(2); expect(result.diagnostics.attemptCount).toBe(2);
		expect(result.diagnostics.observationCoverage).toBe("unavailable");
		expect(result.diagnostics.attempts.map((a: any) => a.phase)).toEqual(["start", "start"]);
		expect(result.diagnostics.usage.inputTokens).toEqual({ knownSum: 0, missing: 2 });
	} finally { f.close(); }
});

offlineTest("an adapter dropping provider events fails accounting without inventing known zeros", async () => {
	const f = await fixture();
	const stream = f.registry.streamSimple;
	f.registry.streamSimple = (model: any, context: any, options: any) => {
		expect(options.maxRetries).toBe(0); expect(options.transport).toBe("sse");
		return stream(model, context, { ...options, onProviderStreamEvent: undefined });
	};
	try {
		const result = await f.service.review(req);
		expect(result.stopReason).toBe("error"); expect(result.answers).toEqual({});
		expect(result.diagnostics.observationCoverage).toBe("unavailable");
		expect(result.diagnostics.attemptCount).toBe(1); expect(f.wire).toHaveLength(1);
		expect(result.diagnostics.usage.inputTokens).toEqual({ knownSum: 0, missing: 1 });
	} finally { f.close(); }
});
