/** Executable A+B acceptance trace through the real local service (opt-in), or its public port. */
import { expect, test } from "bun:test";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { collectContext } from "../context.js";
import { runIncremental } from "../incremental.js";
import type { JudgeRequest, JudgeResult, JudgmentService } from "../judgment-client.js";
import { emptyState, restoreState, writeState } from "../state.js";
import { answersFromState } from "../state-verdict.js";
import { decide } from "../verdict.js";

const board = { tasks: [{ id: 5, subject: "Parser", status: "in_progress" as const, description: "- A: reject malformed input\n- B: preserve valid input" }], nextId: 6 };
const A = "A: reject malformed input", B = "B: preserve valid input";
const descriptions = [`Complete ${A} and ${B}.`, `- ${A}\n- ${B}`, `Complete ${A}\nand ${B}.`, `Complete ${A} and ${B}.\nDo not deploy.`];
const message = (id: string, role: string, content: string) => ({ id, type: "message", message: { role, content } });
const initial = [message("u", "user", "Implement A and B. No deployment."), message("a", "assistant", "A rejects malformed input and passed its checks. B remains open.")];
function scripted(req: JudgeRequest, choices: Record<string, string>): JudgeResult {
	return { answers: Object.fromEntries(Object.entries(req.questions).map(([k, q]) => {
		const choice = choices[k];
		if (q.type !== "choice" || !choice || !Object.hasOwn(q.criteria, choice)) throw new Error(`Unscripted ${k}: ${choice}`);
		return [k, { type: "choice", choice, confidence: 1, probabilities: Object.fromEntries(Object.keys(q.criteria).map((label) => [label, label === choice ? 1 : 0])) }];
	})), dropped: [], backend: "classifier", model: "fixture/jev", stopReason: "stop", reuse: { hits: 0, joined: 0, sent: 1 } };
}
function choices(phase: "A" | "B" | "uncertain" | "withdraw"): Record<string, string> {
	return { task_status_5: phase === "A" ? "progress_evidenced" : phase === "B" ? "completion_reported" : phase === "uncertain" ? "unclear_in_segment" : "no_change",
		task_evidence_5: phase === "A" ? "a" : phase === "B" ? "b" : "keep_prior", task_board_5: "accurate", task_granularity_5: "unchanged", task_granularity_evidence_5: "none_in_segment",
		interaction: phase === "withdraw" ? "permission_withdrawn" : "unchanged", work_evidence: phase === "withdraw" ? "withdraw" : "none_in_segment",
		current_work_evidence: "none_in_segment", scope_evidence: "none_in_segment",
		current_work: phase === "withdraw" ? "waiting" : "same_work", scope_update: "no_scope_change", drift: phase === "withdraw" ? "blocked" : "on_track" };
}

for (const description of descriptions) test(`A+B survives cold reload without deriving acceptance from formatting: ${JSON.stringify(description)}`, async () => {
	const board = { tasks: [{ id: 5, subject: "Parser", status: "in_progress" as const, description }], nextId: 6 };
	let phase: "A" | "B" = "A";
	const seen: JudgeRequest[] = [], rows: unknown[] = [];
	const service: JudgmentService = { version: 1, availability: async () => ({}), judge: async (req) => { seen.push(req); return scripted(req, choices(phase)); } };
	const persist = (s: Parameters<typeof writeState>[1]) => writeState((customType, data) => rows.push(JSON.parse(JSON.stringify({ type: "custom", customType, data }))), s);
	const common = { board, service, signal: new AbortController().signal, timeoutMs: 1000, persist };
	const first = await runIncremental({ ...common, state: emptyState(), context: collectContext(initial) });
	expect(first.complete).toBe(true); expect(first.state.tasks["5"].progressReports).toEqual([{ sourceId: "a" }]);
	expect(first.state.tasks["5"].status).toBe("still_ongoing");
	const h = [...initial, message("b", "assistant", "B now preserves valid input and passed its checks. A remains passed; the entire Parser task is done.")];
	const restored = restoreState(rows, new Set(h.map((e) => e.id))); phase = "B";
	const second = await runIncremental({ ...common, state: restored, context: collectContext(h) });
	expect(seen).toHaveLength(2);
	const text = String(seen[1].state.audit);
	const suffix = text.split("New segment")[1].split("Segment records")[0];
	expect(suffix).toContain('"id":"b"'); expect(suffix).not.toContain('"id":"a"'); expect(suffix).not.toContain('"id":"u"');
	expect(text).toContain("A rejects malformed input and passed its checks. B remains open.");
	expect(text).toContain('"verified":false');
	expect(Object.keys(seen[1].questions).some((k) => k.startsWith("task_item_"))).toBe(false);
	expect(second.state.tasks["5"].progressReports).toEqual([{ sourceId: "a" }]);
	expect(second.state.tasks["5"].completionReport).toEqual({ sourceId: "b", verified: false });
	const action = decide(answersFromState(second.state, board, second.tip), board, 0.8, 0, [], { context: collectContext(h), serviceAccepted: true });
	expect(action.kind).toBe("inject"); if (action.kind === "inject") expect(action.text).toContain("reported, not independently verified");
});

test("uncertain B keeps A, fences the task; a user withdrawal cannot revive prior permission", async () => {
	let phase: "A" | "uncertain" | "withdraw" = "A";
	const service: JudgmentService = { version: 1, availability: async () => ({}), judge: async (req) => scripted(req, choices(phase)) };
	const common = { board, service, signal: new AbortController().signal, timeoutMs: 1000, persist: () => true };
	const first = await runIncremental({ ...common, state: emptyState(), context: collectContext(initial) });
	phase = "uncertain"; const h = [...initial, message("maybe", "assistant", "B check was inconclusive.")];
	const second = await runIncremental({ ...common, state: first.state, context: collectContext(h) });
	expect(second.state.tasks["5"].cursor).toBe("a"); expect(second.state.tasks["5"].open).toBe("maybe");
	expect(second.state.tasks["5"].progressReports).toEqual([{ sourceId: "a" }]);
	phase = "withdraw"; h.push(message("withdraw", "user", "Stop all implementation. Previous permission withdrawn."));
	const third = await runIncremental({ ...common, state: second.state, context: collectContext(h) });
	expect(third.state.session.interaction.state).toBe("waiting_user"); expect(third.state.session.authorizedScope).toEqual({});
	const action = decide(answersFromState(third.state, board, third.tip), board, 0.8, 0, [], { context: collectContext(h), serviceAccepted: true, terminalStop: true });
	expect(action.kind).not.toBe("inject");
});

test.skipIf(!process.env.PI_JUDGMENT_SOURCE)("A+B through the actual sibling service and installed Pi native adapter (offline wire)", async () => {
	const root = process.env.PI_JUDGMENT_SOURCE!;
	const { createJudgmentService } = await import(pathToFileURL(join(root, "src/service.ts")).href);
	const { validateConfig } = await import(pathToFileURL(join(root, "src/config.ts")).href);
	const { classify } = await import(new URL("./api/typesafe-system-one.js", import.meta.resolve("@earendil-works/pi-ai")).href);
	let phase: "A" | "B" = "A";
	const wire: { bytes: number; state: string }[] = [], serviceRows: unknown[] = [], rows: unknown[] = [];
	const model = { type: "classifier", id: "jev-latest", name: "Offline", provider: "typesafe", api: "typesafe-system-one", baseUrl: "https://fixture.invalid/v1", input: ["text"], contextWindow: 32000, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } };
	const fetchFixture = async (url: unknown, init?: RequestInit) => {
		if (String(url) !== "https://fixture.invalid/v1/systemone") throw new Error("Live transport forbidden");
		const raw = String(init?.body), req = JSON.parse(raw) as JudgeRequest;
		const fixed = req.state.fixed as { audit: string };
		expect(typeof fixed.audit).toBe("string");
		wire.push({ bytes: Buffer.byteLength(raw), state: fixed.audit });
		return Response.json({ answers: scripted(req, choices(phase)).answers });
	};
	const service: JudgmentService = createJudgmentService({
		config: () => validateConfig({ mode: "classifier", classifierModel: "typesafe/jev-latest", timeoutMs: 1000 }).config,
		nativeFetch: fetchFixture,
		ledger: { branch: () => serviceRows, append: (customType: string, data: unknown) => serviceRows.push({ type: "custom", customType, data }) },
		registry: { getAvailableOfType: async () => [model], getModel: () => undefined, getProviders: () => [], getAuth: async () => undefined,
			streamSimple: () => { throw new Error("Unexpected LLM fallback"); },
			classify: (_model: unknown, context: unknown, opts: any) => classify(model, context, { ...opts, apiKey: "offline-fixture-only", fetch: opts.fetch ?? fetchFixture }) },
	});
	const persist = (s: Parameters<typeof writeState>[1]) => writeState((customType, data) => rows.push(JSON.parse(JSON.stringify({ type: "custom", customType, data }))), s);
	const common = { service, board, timeoutMs: 1000, minConfidence: 0.8, signal: new AbortController().signal, persist };
	const first = await runIncremental({ ...common, state: emptyState(), context: collectContext(initial) });
	expect(first.complete, JSON.stringify(first.reports)).toBe(true); expect(first.capacity?.limitSource).toBe("model");
	expect(first.state.tasks["5"].progressReports).toEqual([{ sourceId: "a" }]);
	phase = "B";
	const h = [...initial, message("b", "assistant", "B is complete. A remains passed. Entire Parser acceptance scope is done.")];
	const second = await runIncremental({ ...common, state: restoreState(rows, new Set(h.map((e) => e.id))), context: collectContext(h) });
	expect(second.complete).toBe(true); expect(second.state.tasks["5"].status).toBe("completion_reported");
	expect(wire).toHaveLength(2);
	expect(wire[1].state.split("New segment")[1]).not.toContain('"id":"a"');
	expect(wire[1].state).not.toContain("offline-fixture-only");
	console.log(JSON.stringify({ check: "offline-actual-service-pi-A+B", wireBytes: wire.map((r) => r.bytes), tokens: "not measured (scripted transport)", cost: "no live inference" }));
});
