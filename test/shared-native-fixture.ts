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
	const service: ReviewService & { refreshBranch(): void } = createJudgmentService({
		config: () => config,
		ledger: { branch: () => rows, append: (customType: string, data: unknown) => {
			if (writeFailure) throw new Error("disk full");
			rows.push({ id: `service-${rows.length}`, type: "custom", customType, data });
		} },
		registry: { getAvailableOfType: async () => [model], getModel: () => undefined, getProviders: () => [], getAuth: async () => undefined,
			streamSimple: () => { throw new Error("must remain native"); },
			classify: (_m: unknown, context: unknown, options: any = {}) => classify(model, context, { ...options, apiKey: "offline-key", fetch: async (url: unknown, init: any) => {
				// This injected function never opens a socket, even for a catalog URL.
				if (String(url) !== new URL("systemone", `${model.baseUrl.replace(/\/+$/, "")}/`).href) throw new Error("Unexpected transport target");
				const raw = String(init.body), body = JSON.parse(raw); signals.push(init.signal); wire.push({ body, bytes: Buffer.byteLength(raw), raw }); return reply(body, raw);
			}, onAttempt: (e: unknown) => { events.push(structuredClone(e)); options.onAttempt?.(e); } }),
		},
	});
	return { service, wire, events, rows, signals, model, setConfig: (raw: Record<string, unknown>) => { config = validateConfig(raw).config; }, failWrites: (fail: boolean) => { writeFailure = fail; } };
}
