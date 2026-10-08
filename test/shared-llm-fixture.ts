/** Actual Pi model registry, auth adapter and Anthropic SSE; only HTTP/session storage are controlled. */
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const encodeLlmEvents = (items: unknown[]) => items.map((event: any) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join("");
export function llmEvents(choice = "blocked", input: object = { input_tokens: 11 }, output: object = {}) {
	return [
		{ type: "message_start", message: { id: "fixture-message", type: "message", role: "assistant", model: "claude-sonnet-4-5", content: [], stop_reason: null, stop_sequence: null, usage: input } },
		{ type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "fixture-tool", name: "answer", input: {} } },
		{ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify({ choice }) } },
		{ type: "content_block_stop", index: 0 },
		{ type: "message_delta", delta: { stop_reason: "tool_use", stop_sequence: null }, usage: output },
		{ type: "message_stop" },
	];
}
export const llmSse = (items = llmEvents()) => new Response(encodeLlmEvents(items), { headers: { "content-type": "text/event-stream" } });
export async function llmFixture(transport: (body: any, ordinal: number, init: RequestInit) => Response | Promise<Response> = () => llmSse()) {
	const root = process.env.PI_JUDGMENT_SOURCE, piRoot = process.env.PI_CLASSIFIER_SOURCE;
	if (!root || !piRoot) throw new Error("Offline LLM fixture requires both source roots");
	const { createJudgmentService } = await import(pathToFileURL(join(root, "src/service.ts")).href);
	const { validateConfig } = await import(pathToFileURL(join(root, "src/config.ts")).href);
	const { createModels, createProvider } = await import(pathToFileURL(join(piRoot, "packages/ai/src/models.ts")).href);
	const { anthropicMessagesApi } = await import(pathToFileURL(join(piRoot, "packages/ai/src/api/anthropic-messages.lazy.ts")).href);
	const model = { id: "claude-sonnet-4-5", name: "Offline", provider: "offline", api: "anthropic-messages", baseUrl: "https://fixture.invalid", reasoning: true, input: ["text"], maxTokens: 8192, contextWindow: 200000, cost: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 } };
	const models = createModels();
	models.setProvider(createProvider({ id: "offline", models: [model], auth: { apiKey: { name: "Offline", resolve: async () => ({ auth: { apiKey: "synthetic-llm-key" } }) } }, api: anthropicMessagesApi() }));
	const original = globalThis.fetch;
	const wire: any[] = [], rows: any[] = [], signals: AbortSignal[] = [];
	globalThis.fetch = (async (url: unknown, init: any) => {
		if (!String(url).startsWith("https://fixture.invalid/")) throw new Error("live transport forbidden");
		const body = JSON.parse(init.body); wire.push(body); signals.push(init.signal);
		return transport(body, wire.length, init);
	}) as typeof fetch;
	const config = validateConfig({ mode: "llm", model: "offline/claude-sonnet-4-5", thinkingLevel: "low", classifierModel: "unused/never", timeoutMs: 3000 }).config;
	const registry = { getModel: models.getModel.bind(models), getAvailableOfType: async () => [], getAuth: models.getAuth.bind(models), getProviders: models.getProviders.bind(models), streamSimple: models.streamSimple.bind(models), classify: () => { throw new Error("must not use native"); } };
	const service = createJudgmentService({ config: () => config,
		ledger: { branch: () => rows, append: (customType: string, data: unknown) => rows.push({ type: "custom", customType, data }) }, registry });
	return { service, registry, config, model, wire, rows, signals, close: () => { globalThis.fetch = original; } };
}
