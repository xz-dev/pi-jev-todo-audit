/** Real rpiv-todo business execution through Pi's agent/tool runner, offline. */
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { AssistantMessageEventStream } from "@earendil-works/pi-ai";

export default async function (pi) {
	const { default: todo } = await import(pathToFileURL(process.env.DELIVERY_TODO_ENTRY).href);
	await todo(pi);
	const actions = [
		{ action: "create", subject: "Delivery failure does not block TODO work" },
		{ action: "update", id: 1, status: "in_progress", activeForm: "checking delivery" },
		{ action: "list" },
	];
	let calls = 0;
	const mark = (value) => appendFileSync(process.env.DELIVERY_OBSERVER, JSON.stringify({ ...value, pid: process.pid }) + "\n");
	const cost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
	const model = { id: "fixture", name: "Offline TODO driver", provider: "delivery-todo", api: "openai-completions", baseUrl: "https://unused.invalid", input: ["text"], reasoning: false, contextWindow: 100000, maxTokens: 1000, cost };
	const stream = () => {
		const action = actions[calls++];
		if (calls > 4) throw new Error("Unexpected extra fake model call");
		const message = { role: "assistant", api: model.api, provider: model.provider, model: model.id, content: action ? [{ type: "toolCall", id: `todo-${calls}`, name: "todo", arguments: action }] : [{ type: "text", text: "Offline TODO business probe complete." }], stopReason: action ? "toolUse" : "stop", usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { ...cost, total: 0 } }, timestamp: Date.now() };
		const events = new AssistantMessageEventStream();
		events.push({ type: "start", partial: { ...message, content: [] } });
		events.push({ type: "done", reason: message.stopReason, message });
		events.end(message);
		mark({ kind: "todo-model", calls });
		return events;
	};
	pi.registerProvider({ id: model.provider, name: model.name, auth: { apiKey: { check: async () => ({ type: "api_key", source: "fixture" }), resolve: async () => ({ auth: { apiKey: "offline-test-only" }, source: "fixture" }) } }, getModels: () => [model], stream, streamSimple: stream });
	pi.registerCommand("real-todo-proof", { handler: async (_args, ctx) => {
		const snapshots = ctx.sessionManager.getBranch().filter((entry) => entry.type === "message" && entry.message?.role === "toolResult" && entry.message.toolName === "todo").map((entry) => entry.message.details);
		mark({ kind: "todo-business", calls, snapshots });
		ctx.ui.notify("Real TODO business proof recorded", "info");
	} });
}
