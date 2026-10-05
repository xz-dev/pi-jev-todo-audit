/** Shared opt-in harness: real service + real Pi native adapter, only transport/storage are fixtures. */
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { ReviewService } from "../judgment-client.js";

export async function nativeFixture(reply: (body: any, raw: string) => Response | Promise<Response>, window = 100000, rows: any[] = [], settings: { model?: { provider?: string; id?: string; baseUrl?: string; headers?: Record<string, string> }; config?: Record<string, unknown> } = {}) {
	const root = process.env.PI_JUDGMENT_SOURCE, piRoot = process.env.PI_CLASSIFIER_SOURCE;
	if (!root || !piRoot) throw new Error("Offline wire harness requires PI_JUDGMENT_SOURCE and PI_CLASSIFIER_SOURCE");
	const { createJudgmentService } = await import(pathToFileURL(join(root, "src/service.ts")).href);
	const { validateConfig } = await import(pathToFileURL(join(root, "src/config.ts")).href);
	const { classify } = await import(pathToFileURL(join(piRoot, "packages/ai/src/api/typesafe-system-one.ts")).href);
	const wire: { body: any; bytes: number; raw: string }[] = [], events: any[] = [], signals: AbortSignal[] = [];
	const model = { type: "classifier", provider: "typesafe", id: "jev-latest", name: "Offline", api: "typesafe-system-one", baseUrl: "https://fixture.invalid/v1", input: ["text"], contextWindow: window, cost: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 }, ...settings.model };
	let config = validateConfig({ mode: "classifier", classifierModel: `${model.provider}/${model.id}`, timeoutMs: 3000, ...settings.config }).config;
	let writeFailure = false;
	const localFetch = (async (url: unknown, init?: RequestInit): Promise<Response> => {
		// Only this fake transport runs; Pi still builds, retries and parses the request.
		if (String(url) !== new URL("systemone", `${model.baseUrl.replace(/\/+$/, "")}/`).href) throw new Error("Unexpected transport target");
		const raw = String(init?.body), body = JSON.parse(raw); signals.push(init?.signal as AbortSignal); wire.push({ body, bytes: Buffer.byteLength(raw), raw }); return reply(body, raw);
	}) as typeof globalThis.fetch;
	const service: ReviewService & { refreshBranch(): void } = createJudgmentService({
		nativeFetch: localFetch,
		config: () => config,
		ledger: { branch: () => rows, append: (customType: string, data: any) => {
			if (data.kind === "review-attempt") events.push(structuredClone(data.attempt));
			if (writeFailure) throw new Error("disk full");
			rows.push({ id: `service-${rows.length}`, type: "custom", customType, data });
		} },
		registry: { getAvailableOfType: async () => [model], getModel: () => undefined, getProviders: () => [], getAuth: async () => undefined,
			streamSimple: () => { throw new Error("must remain native"); },
			classify: (_m: unknown, context: unknown, options: any = {}) => {
				if ("observe" in options || "onAttempt" in options) throw new Error("Private Pi observation options are forbidden");
				return classify(model, context, { ...options, apiKey: "offline-key", fetch: options.fetch ?? localFetch });
			},
		},
	});
	return { service, wire, events, rows, signals, model, setConfig: (raw: Record<string, unknown>) => { config = validateConfig(raw).config; }, failWrites: (fail: boolean) => { writeFailure = fail; } };
}
