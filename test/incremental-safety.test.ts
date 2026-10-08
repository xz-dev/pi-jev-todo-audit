import { expect, test } from "bun:test";
import { collectContext } from "../context.js";
import { runIncremental } from "../incremental.js";
import type { JudgeRequest, JudgeResult, JudgmentService } from "../judgment-client.js";
import { emptyState, type JudgmentState } from "../state.js";

const board = { tasks: [{ id: 5, subject: "Parser", status: "in_progress" as const }], nextId: 6 };
const history = [{ id: "u", type: "message", message: { role: "user", content: "Implement parser; no deployment." } }];
const context = collectContext(history);
const response = (req: JudgeRequest): JudgeResult => ({
	answers: Object.fromEntries(Object.keys(req.questions).map((key) => [key, { type: "choice", confidence: 0.95,
		choice: key.startsWith("task_granularity_evidence_") || key.endsWith("_evidence") ? "none_in_segment" : key.startsWith("task_item_") ? "no_change" : key.startsWith("task_status_") ? "no_change" : key.startsWith("task_evidence_") ? "none_in_segment" : key.startsWith("task_board_") ? "accurate" : key.startsWith("task_granularity_") ? "unchanged" :
			({ interaction: "unchanged", work_evidence: "none_in_segment", current_work_evidence: "none_in_segment", scope_evidence: "none_in_segment", current_work: "same_work", scope_update: "no_scope_change", drift: "on_track" } as Record<string, string>)[key], probabilities: {} }])),
	dropped: [], backend: "classifier", model: "fixture/m", stopReason: "stop", reuse: { hits: 0, joined: 0, sent: 1 },
});
const service = (judge: JudgmentService["judge"]): JudgmentService => ({ version: 1, judge, availability: async () => ({}) });
const args = () => ({ board, context, state: emptyState(), timeoutMs: 12345, minConfidence: 0.8, signal: new AbortController().signal });

test("in-flight invalidation without a lifecycle event discards every answer and cursor", async () => {
	let current = true, written = 0;
	const out = await runIncremental({ ...args(), service: service(async (req) => { current = false; return response(req); }),
		isCurrent: () => current, persist: () => { written++; return true; } });
	expect(written).toBe(0); expect(out.complete).toBe(false); expect(out.state).toEqual(emptyState());
});

test("abort settles an uncooperative service and its late success never writes", async () => {
	const ac = new AbortController(); let finish!: () => void, entered!: () => void, writes = 0;
	const started = new Promise<void>((resolve) => { entered = resolve; });
	const run = runIncremental({ ...args(), signal: ac.signal, service: service((req) => new Promise((resolve) => {
		finish = () => resolve(response(req)); entered();
	})), persist: () => { writes++; return true; } });
	await started; ac.abort();
	const out = await run;
	expect(out.complete).toBe(false); expect(writes).toBe(0);
	finish(); await Promise.resolve(); expect(writes).toBe(0);
});

test("caller threshold is passed and low-confidence native answers cannot become confidence one", async () => {
	const out = await runIncremental({ ...args(), service: service(async (req, opts) => {
		expect(opts?.timeoutMs).toBe(12345); expect(opts?.minConfidence).toBe(0.8);
		const result = response(req);
		for (const answer of Object.values(result.answers)) if (answer.type === "choice") answer.confidence = 0.1;
		return result;
	}), persist: () => true });
	expect(out.complete).toBe(false); expect(out.state.tasks["5"]?.cursor).toBeUndefined(); expect(out.state.session.cursor).toBeUndefined();
});

test("full invalidation is durable before a failed judge call", async () => {
	const state = emptyState(); state.session.cursor = "u";
	const persisted: JudgmentState[] = [];
	const out = await runIncremental({ ...args(), state, full: true, service: service(async (req) => {
		expect(persisted).toHaveLength(1); expect(persisted[0].session.cursor).toBeUndefined();
		return { ...response(req), answers: {}, stopReason: "error", errorMessage: "offline" };
	}), persist: (s) => { persisted.push(s); return true; } });
	expect(out.complete).toBe(false); expect(out.state.session.cursor).toBeUndefined();
});

test("single-loop predicted overflow gets one actual admission attempt", async () => {
	let calls = 0;
	const svc: JudgmentService = { ...service(async (req) => { calls++; return response(req); }), capacityVersion: 1,
		describeSelection: async () => ({ backend: "classifier", model: "fixture/m", limits: { request: 1 }, limitSource: "override", tokensPerByte: 1, prior: true, envelopeOverheadBytes: 0 }) };
	const out = await runIncremental({ ...args(), service: svc, persist: () => true });
	expect(calls).toBe(1); expect(out.complete).toBe(true); expect(out.reports.some((r) => r.outcome === "oversize")).toBe(false);
});

test("scope update precedes drift: discard the simultaneous opinion and ask only drift against the selected user source", async () => {
	let calls = 0;
	const out = await runIncremental({ ...args(), service: service(async (req) => {
		calls++; const result = response(req);
		if (calls === 1) {
			for (const [k, choice] of Object.entries({ scope_update: "scope_updated", scope_evidence: "u", drift: "drifted" }))
				result.answers[k] = { type: "choice", choice, confidence: 1, probabilities: { [choice]: 1 } };
		} else {
			expect(Object.keys(req.questions)).toEqual(["drift"]);
			expect(String(req.state.audit).split("New segment")[0]).toContain('"authorizedScope":{"id":"u"');
		}
		return result;
	}), persist: () => true });
	expect(calls).toBe(2); expect(out.state.session.authorizedScope.anchor).toBe("u"); expect(out.state.session.lastDrift).toBe("on_track");
	expect(out.complete).toBe(true);
});
