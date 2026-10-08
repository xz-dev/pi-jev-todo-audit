/** Real sibling service + installed Pi native adapter; only HTTP responses and ledger storage are fixtures. */
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { JudgeRequest, JudgeResult, JudgmentService } from "../judgment-client.js";

export interface WireMetrics {
	phase: string; bytes: number; stateBytes: number; anchorBytes: number; newHistoryBytes: number;
	anchorIds: string[]; newIds: string[]; audit: string;
}
export function requestMetrics(audit: string) {
	const anchors = audit.split("Source anchors (original public evidence, once per id; not new history):\n")[1]?.split("\n\nNew segment")[0] ?? "[]";
	const history = audit.split(/New segment \(\d+ complete loops\):\n/)[1]?.split("\nSegment records")[0] ?? "[]";
	return { stateBytes: Buffer.byteLength(audit.split("Source anchors")[0]), anchorBytes: Buffer.byteLength(anchors), newHistoryBytes: Buffer.byteLength(history),
		anchorIds: (JSON.parse(anchors) as { id: string }[]).map((r) => r.id), newIds: (JSON.parse(history) as { id: string }[]).map((r) => r.id) };
}
export async function actualNativeFixture(answer: (request: JudgeRequest) => JudgeResult, phase: () => string = () => "test") {
	const root = process.env.PI_JUDGMENT_SOURCE;
	assert(root, "PI_JUDGMENT_SOURCE required; no installed-copy activation");
	const { createJudgmentService } = await import(pathToFileURL(join(root, "src/service.ts")).href);
	const { validateConfig } = await import(pathToFileURL(join(root, "src/config.ts")).href);
	const { classify } = await import(new URL("./api/typesafe-system-one.js", import.meta.resolve("@earendil-works/pi-ai")).href);
	const wire: WireMetrics[] = [], rows: unknown[] = [];
	const model = { type: "classifier", id: "jev-latest", name: "Offline", provider: "typesafe", api: "typesafe-system-one", baseUrl: "https://fixture.invalid/v1", input: ["text"], contextWindow: 32000, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } };
	const fetchFixture = async (url: unknown, init?: RequestInit) => {
		assert.equal(String(url), "https://fixture.invalid/v1/systemone", "Live transport forbidden");
		const raw = String(init?.body), request = JSON.parse(raw) as JudgeRequest;
		const fixed = request.state.fixed as { audit: string }; assert.equal(typeof fixed.audit, "string");
		wire.push({ phase: phase(), bytes: Buffer.byteLength(raw), audit: fixed.audit, ...requestMetrics(fixed.audit) });
		return Response.json({ answers: answer(request).answers });
	};
	const create = (): JudgmentService => createJudgmentService({
		config: () => validateConfig({ mode: "classifier", classifierModel: "typesafe/jev-latest", timeoutMs: 1000 }).config, nativeFetch: fetchFixture,
		ledger: { branch: () => rows, append: (customType: string, data: unknown) => rows.push({ type: "custom", customType, data }) },
		registry: { getAvailableOfType: async () => [model], getModel: () => undefined, getProviders: () => [], getAuth: async () => undefined,
			streamSimple: () => { throw new Error("Unexpected LLM fallback"); },
			classify: (_model: unknown, context: unknown, opts: any) => classify(model, context, { ...opts, apiKey: "offline-fixture-only", fetch: opts.fetch ?? fetchFixture }) },
	});
	return { service: create(), wire, reload: create };
}
