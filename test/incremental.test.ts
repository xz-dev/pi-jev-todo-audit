import { expect, test } from "bun:test";
import type { BoardSnapshot } from "../board.js";
import { collectContext } from "../context.js";
import { runIncremental } from "../incremental.js";
import type { CapacityDisclosure, ClassifierAnswer, JudgeRequest, JudgeResult, JudgmentService } from "../judgment-client.js";
import { emptyState, restoreState, STATE_TYPE, writeState, type JudgmentState } from "../state.js";

const user = (id: string, content: string) => ({ id, type: "message", message: { role: "user", content } });
const assistant = (id: string, content: string) => ({ id, type: "message", message: { role: "assistant", content } });
const call = (id: string, callId: string) => ({ id, type: "message", message: { role: "assistant", content: [{ type: "toolCall", id: callId, name: "probe", arguments: {} }] } });
const result = (id: string, callId: string) => ({ id, type: "message", message: { role: "toolResult", toolName: "probe", toolCallId: callId, isError: false, content: "ok" } });
const board: BoardSnapshot = { tasks: [{ id: 5, subject: "Parser", description: "- A\n- B", status: "in_progress" }], nextId: 6 };

/** Stub: answers every question `no_change`-ish unless overridden per call; records what it saw. */
function stub(opts: { capacity?: Partial<CapacityDisclosure> | null; answer?: (req: JudgeRequest, n: number) => Record<string, string>; fail?: (n: number) => Partial<JudgeResult> | undefined } = {}) {
	const seen: { state: string; questions: string[] }[] = [];
	let n = 0;
	const defaults: Record<string, string> = { interaction: "unchanged", work_evidence: "keep_prior", current_work_evidence: "none_in_segment", scope_evidence: "none_in_segment", current_work: "same_work", scope_update: "no_scope_change", drift: "on_track", board_warranted: "idle" };
	const service: JudgmentService = {
		version: 1,
		capacityVersion: 1,
		availability: async () => ({}),
		describeSelection: async () => opts.capacity === null ? { error: "none" } : ({ backend: "classifier", model: "typesafe/jev-1.13", limits: { request: 32000, stateAndLongestQuestion: 32000 }, limitSource: "channel", tokensPerByte: 1 / 1.75, prior: true, envelopeOverheadBytes: 0, ...(opts.capacity ?? {}) }),
		judge: async (req) => {
			n++;
			const state = String((req.state as { audit: string }).audit);
			seen.push({ state, questions: Object.keys(req.questions) });
			const failure = opts.fail?.(n);
			if (failure) return { answers: {}, dropped: [], backend: "classifier", model: "typesafe/jev-1.13", stopReason: "error", reuse: { hits: 0, joined: 0, sent: 1 }, ...failure };
			const chosen = { ...defaults, ...(opts.answer?.(req, n) ?? {}) };
			const answers: Record<string, ClassifierAnswer> = Object.fromEntries(Object.entries(req.questions).map(([k]) => {
				const choice = chosen[k] ?? (k.endsWith("_evidence") || k.startsWith("task_granularity_evidence") ? "none_in_segment" : k.startsWith("task_item") ? "no_change" : k.startsWith("task_status") ? "no_change" : k.startsWith("task_evidence") ? "keep_prior" : k.startsWith("task_board") ? "accurate" : k.startsWith("task_granularity") ? "unchanged" : "unchanged");
				return [k, { type: "choice" as const, choice, confidence: 1, probabilities: { [choice]: 1 } }];
			}));
			return { answers, dropped: [], backend: "classifier", model: "typesafe/jev-1.13", stopReason: "stop", reuse: { hits: 0, joined: 0, sent: Object.keys(answers).length } };
		},
	};
	return { service, seen };
}

function ledger() {
	const entries: unknown[] = [];
	const persist = (s: JudgmentState) => writeState((t, d) => entries.push({ id: `st${entries.length}`, type: "custom", customType: t, data: structuredClone(d) }), s);
	return { entries, persist };
}

const history1 = [user("u0", "Implement A and B."), call("a1", "c1"), result("r1", "c1"), assistant("a2", "A done, starting B.")];
const history2 = [...history1, user("u3", "Only touch src/."), call("a4", "c4"), result("r4", "c4"), assistant("a5", "B done and tested.")];
const ctx = (h: unknown[]) => collectContext(h, board.tasks.map((t) => ({ id: `task:${t.id}`, value: t })));
const loopIds = (h: unknown[]) => new Set(h.map((e) => (e as { id: string }).id));

test("two consecutive audits: the second sends only post-cursor loops; state and cursors persist through the ledger", async () => {
	const { service, seen } = stub({ answer: (_req, n): Record<string, string> => n >= 2 ? { task_status_5: "completion_reported", task_evidence_5: "a5" } : {} });
	const { entries, persist } = ledger();
	const signal = new AbortController().signal;
	const first = await runIncremental({ service, board, context: ctx(history1), state: emptyState(), timeoutMs: 1000, signal, persist });
	expect(first.complete).toBe(true);
	expect(first.tip).toBe("a2");
	expect(first.state.tasks["5"].cursor).toBe("a2");
	expect(first.state.session.cursor).toBe("a2");
	expect(seen.length).toBe(1);
	expect(seen[0].state).toContain("Implement A and B.");
	expect(seen[0].state).toContain("A done, starting B.");

	// Reload from the ledger as a fresh process would.
	const restored = restoreState(entries, loopIds(history2));
	expect(restored.tasks["5"].cursor).toBe("a2");
	const second = await runIncremental({ service, board, context: ctx(history2), state: restored, timeoutMs: 1000, signal, persist });
	expect(seen.length).toBe(2);
	expect(seen[1].state).toContain("Only touch src/.");
	expect(seen[1].state).toContain("B done and tested.");
	expect(seen[1].state).not.toContain("A done, starting B."); // judged last time; only the stored state represents it
	expect(seen[1].state).not.toContain("Implement A and B.");  // no anchor reloads it either
	expect(second.complete).toBe(true);
	expect(second.state.tasks["5"].status).toBe("completion_reported");
	expect(second.state.tasks["5"].completionReport).toEqual({ sourceId: "a5", verified: false });
	expect(second.state.tasks["5"].cursor).toBe("a5");
	expect(entries.filter((e) => (e as { customType: string }).customType === STATE_TYPE).length).toBe(2);
});

test("an incomplete trailing loop is excluded and becomes the next segment once its result arrives", async () => {
	const { service, seen } = stub();
	const { persist } = ledger();
	const signal = new AbortController().signal;
	const pending = [...history1, call("a3", "c3")];
	const out = await runIncremental({ service, board, context: ctx(pending), state: emptyState(), timeoutMs: 1000, signal, persist });
	expect(out.tip).toBe("a2");
	expect(seen[0].state).not.toContain('"a3');
	const done = [...pending, result("r3", "c3")];
	const next = await runIncremental({ service, board, context: ctx(done), state: out.state, timeoutMs: 1000, signal, persist });
	expect(next.tip).toBe("a3");
	expect(seen[1].state).toContain("a3");
	expect(next.state.tasks["5"].cursor).toBe("a3");
});

test("uncertain answer holds the task open; session advances; next run re-asks only the open task from its open loop", async () => {
	// Uncertain until the segment contains the later user message (new information).
	const { service, seen } = stub({ answer: (req): Record<string, string> => String((req.state as { audit: string }).audit).includes("Only touch src/") ? {} : { task_status_5: "unclear_in_segment" } });
	const { persist } = ledger();
	const signal = new AbortController().signal;
	const out = await runIncremental({ service, board, context: ctx(history1), state: emptyState(), timeoutMs: 1000, signal, persist });
	expect(out.complete).toBe(false);
	expect(out.state.tasks["5"].open).toBe("u0");
	expect(out.state.session.cursor).toBe("a2");
	expect(out.reports.every((r) => r.outcome === "open")).toBe(true);
	expect(seen.length).toBe(1); // a scope stuck open at the same loop is not re-asked within one run
	// New evidence arrives; the task is re-asked from u0, the session only from a2 onward.
	const next = await runIncremental({ service, board, context: ctx(history2), state: out.state, timeoutMs: 1000, signal, persist });
	expect(seen[1].questions).toEqual(expect.arrayContaining(["task_status_5"]));
	expect(seen[1].questions).not.toContain("interaction");
	expect(seen[1].state).toContain("Implement A and B.");
	expect(next.state.tasks["5"].open).toBeUndefined();
	expect(next.state.tasks["5"].cursor).toBe("a5");
	expect(seen.at(-1)!.questions).toContain("interaction"); // session caught up afterwards
	expect(next.complete).toBe(true);
});

test("persistence failure leaves the previous state and cursors in force", async () => {
	const { service } = stub();
	const signal = new AbortController().signal;
	const out = await runIncremental({ service, board, context: ctx(history1), state: emptyState(), timeoutMs: 1000, signal, persist: () => false });
	expect(out.persistenceFailed).toBe(true);
	expect(out.complete).toBe(false);
	expect(out.state.tasks["5"]).toBeUndefined();
	expect(out.reports[0].outcome).toBe("failed");
});

test("overflow recovery drops trailing whole loops; a single loop that still overflows is reported oversize, cursor kept", async () => {
	const { service, seen } = stub({ fail: (n) => n === 1 ? { contextOverflow: true, errorMessage: "context overflow" } : undefined });
	const { persist } = ledger();
	const signal = new AbortController().signal;
	const out = await runIncremental({ service, board, context: ctx(history1), state: emptyState(), timeoutMs: 1000, signal, persist });
	expect(seen.length).toBeGreaterThanOrEqual(2);
	expect(seen[1].state).not.toContain("A done, starting B."); // trailing loop dropped
	expect(out.state.tasks["5"].cursor).toBeDefined();
	const single = stub({ fail: () => ({ contextOverflow: true, errorMessage: "context overflow" }) });
	const over = await runIncremental({ service: single.service, board, context: ctx([user("u0", "x")]), state: emptyState(), timeoutMs: 1000, signal, persist });
	expect(over.reports[0].outcome).toBe("oversize");
	expect(over.state.tasks["5"]).toBeUndefined();
});

test("missing capacity metadata is surfaced and bounded by the fallback loop count", async () => {
	const { service, seen } = stub({ capacity: { limits: {}, limitSource: "none" } });
	const { persist } = ledger();
	const signal = new AbortController().signal;
	const long = [user("u0", "go"), ...Array.from({ length: 6 }, (_, i) => assistant(`a${i + 1}`, `step ${i + 1}`))];
	const out = await runIncremental({ service, board, context: ctx(long), state: emptyState(), timeoutMs: 1000, signal, persist, fallbackLoops: 3 });
	expect(out.missingCapacityMetadata).toBe(true);
	expect(seen.length).toBe(3); // 7 loops / 3 per segment
	expect(out.complete).toBe(true);
	const none = stub({ capacity: null });
	const out2 = await runIncremental({ service: none.service, board, context: ctx(history1), state: emptyState(), timeoutMs: 1000, signal, persist });
	expect(out2.missingCapacityMetadata).toBe(true);
	expect(out2.capacity).toBeUndefined();
});

test("full mode re-judges from the first loop while keeping prior state only as reset targets", async () => {
	const { service, seen } = stub();
	const { persist } = ledger();
	const signal = new AbortController().signal;
	const first = await runIncremental({ service, board, context: ctx(history2), state: emptyState(), timeoutMs: 1000, signal, persist });
	expect(first.complete).toBe(true);
	const again = await runIncremental({ service, board, context: ctx(history2), state: first.state, timeoutMs: 1000, signal, persist, full: true });
	expect(seen.at(-1)!.state).toContain("Implement A and B.");
	expect(again.complete).toBe(true);
	const idle = await runIncremental({ service, board, context: ctx(history2), state: again.state, timeoutMs: 1000, signal, persist });
	expect(idle.reports).toEqual([]); // nothing new: zero service calls
	expect(idle.complete).toBe(true);
});

// D3 at the runner: model identity change re-judges only after cursors; a
// changed task contract re-judges from first-active, else the earliest loop.
test("model identity change keeps cursors: only post-cursor loops are judged by the new model", async () => {
	const { service, seen } = stub();
	const { persist } = ledger();
	const signal = new AbortController().signal;
	const first = await runIncremental({ service, board, context: ctx(history1), state: emptyState(), timeoutMs: 1000, signal, persist });
	expect(first.state.model).toBe("typesafe/jev-1.13");
	const switched: JudgmentState = { ...first.state, model: "other/model" };
	const before = seen.length;
	const next = await runIncremental({ service, board, context: ctx(history2), state: switched, timeoutMs: 1000, signal, persist });
	expect(next.complete).toBe(true);
	const sent = seen.slice(before).map((s) => s.state).join("\n");
	expect(sent).toContain("Only touch src/.");
	expect(sent).not.toContain("Implement A and B.");
	expect(next.state.model).toBe("typesafe/jev-1.13"); // stamped by the model that actually judged
});

for (const withFirstActive of [true, false]) test(`changed task contract resets to ${withFirstActive ? "first-active" : "the earliest known loop"} without a new history record`, async () => {
	const { service, seen } = stub();
	const { persist } = ledger();
	const signal = new AbortController().signal;
	const seed = emptyState();
	if (withFirstActive) seed.tasks["5"] = { ...emptyState().tasks["5"] ?? { status: "unclear", progressReports: [], anchors: {} }, firstActive: "a1" };
	const first = await runIncremental({ service, board, context: ctx(history2), state: seed, timeoutMs: 1000, signal, persist });
	expect(first.complete).toBe(true);
	expect(first.state.tasks["5"].boardCheck?.scopeHash).toBeDefined();
	const changed: BoardSnapshot = { ...board, tasks: [{ ...board.tasks[0], description: "- A\n- B\n- C (new)" }] };
	const before = seen.length;
	const again = await runIncremental({ service, board: changed, context: ctx(history2), state: first.state, timeoutMs: 1000, signal, persist });
	expect(again.complete).toBe(true);
	expect(seen.length).toBeGreaterThan(before);
	const sent = seen.slice(before).map((s) => s.state).join("\n");
	if (withFirstActive) { expect(sent).not.toContain("Implement A and B."); expect(sent).toContain("A done, starting B."); }
	else expect(sent).toContain("Implement A and B.");
	expect(again.state.tasks["5"].progressReports).toEqual([]);
});

test("a single loop with more than 255 candidate sources fails closed: no call, cursor unmoved, later loops wait", async () => {
	const { service, seen } = stub();
	const { persist } = ledger();
	const signal = new AbortController().signal;
	const wide: unknown[] = [user("u0", "Implement A and B."), { id: "a1", type: "message", message: { role: "assistant", content: Array.from({ length: 260 }, (_, i) => ({ type: "toolCall", id: `c${i}`, name: "probe", arguments: {} })) } }];
	for (let i = 0; i < 260; i++) wide.push(result(`r${i}`, `c${i}`));
	wide.push(assistant("a2", "Done with the probes."));
	const out = await runIncremental({ service, board, context: ctx(wide), state: emptyState(), timeoutMs: 1000, signal, persist });
	// The small first loop is judged on its own; the wide loop is never sent.
	expect(seen).toHaveLength(1);
	expect(seen[0].state).not.toContain("Done with the probes.");
	expect(out.complete).toBe(false);
	const oversize = out.reports.find((r) => r.outcome === "oversize");
	expect(oversize?.error).toContain("255");
	expect(oversize?.loops).toEqual(["a1"]);
	expect(out.state.tasks["5"].cursor).toBe("u0"); // stops before the irreducible loop
	expect(out.state.session.cursor).toBe("u0");
});
