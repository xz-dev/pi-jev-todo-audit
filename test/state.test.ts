import { expect, test } from "bun:test";
import { advance, emptyState, emptyTask, holdOpen, resetTask, restoreState, scopeStart, STATE_TYPE, withdrawPermission, writeState, type JudgmentState } from "../state.js";

const entry = (data: unknown) => ({ id: `st-${Math.random()}`, type: "custom", customType: STATE_TYPE, data });
const ids = new Set(["a1", "a2", "a3", "u1"]);

function sample(): JudgmentState {
	const s = emptyState();
	s.model = "typesafe/jev-1.13";
	s.tasks["5"] = { ...emptyTask(), status: "still_ongoing", progressReports: [{ sourceId: "a1" }],
		anchors: { status: "a1", granularity: "a2" }, granularity: { last: "appropriate" }, boardCheck: { last: "accurate", snapshotHash: "h" },
		cursor: "a2", firstActive: "u1", completionReport: { sourceId: "a2", verified: false } };
	s.session = { interaction: { state: "waiting_user", waitingFor: "deploy approval", anchor: "u1" }, currentWork: { target: 5, anchor: "a2" },
		authorizedScope: { anchor: "u1" }, boardWarrant: { last: "warranted" }, cursor: "a2" };
	return s;
}

test("round-trips through the ledger entry; later entries replace earlier ones", () => {
	const first = emptyState(); first.tasks["9"] = { ...emptyTask(), status: "blocked", cursor: "a1" };
	const restored = restoreState([entry(first), { type: "message", message: { role: "user" } }, entry(sample())], ids);
	expect(restored).toEqual(sample());
	expect(restored.tasks["9"]).toBeUndefined();
});

test("branch switch discards unsupported derived state and falls back to the latest valid scope checkpoint", () => {
	const earlier = sample();
	earlier.tasks["5"] = { ...emptyTask(), status: "still_ongoing", cursor: "a1", anchors: { status: "a1" } };
	earlier.session = { ...emptyState().session, cursor: "a1" };
	const restored = restoreState([entry(earlier), entry(sample())], new Set(["a1", "u1"]));
	expect(restored.tasks["5"]).toEqual(earlier.tasks["5"]);
	expect(restored.session).toEqual(earlier.session);
	const noCheckpoint = restoreState([entry(sample())], new Set(["a1", "u1"]));
	expect(noCheckpoint.tasks["5"]).toBeUndefined();
	expect(noCheckpoint.session).toEqual(emptyState().session);
});

test("old ledger entry types and malformed state are ignored", () => {
	const restored = restoreState([
		{ type: "custom", customType: "jev-todo-audit-ledger", data: { kind: "receipt", receipt: {} } },
		entry({ version: 2, tasks: {} }),
		entry({ version: 1, tasks: { 7: { status: "bogus" } }, session: { interaction: { state: "nope" } } }),
	], ids);
	expect(restored).toEqual(emptyState());
});

test("writeState reports durability honestly", () => {
	const written: unknown[] = [];
	expect(writeState((t, d) => { expect(t).toBe(STATE_TYPE); written.push(d); }, sample())).toBe(true);
	expect(written.length).toBe(1);
	expect(writeState(undefined, sample())).toBe(false);
	expect(writeState(() => { throw new Error("disk"); }, sample())).toBe(false);
	const mutable = sample();
	writeState((_t, d) => written.push(d), mutable);
	mutable.tasks["5"].status = "cancelled";
	expect((written[1] as JudgmentState).tasks["5"].status).toBe("still_ongoing");
});

test("cursor rules: advance, hold open, start position", () => {
	let scope = { cursor: "a1" as string | undefined, open: undefined as string | undefined };
	expect(scopeStart(scope)).toEqual({ afterCursor: "a1" });
	scope = holdOpen(scope, "a2");
	expect(scope).toEqual({ cursor: "a1", open: "a2" });
	expect(scopeStart(scope)).toEqual({ from: "a2" });
	scope = holdOpen(scope, "a3"); // already open: keeps the earliest
	expect(scope.open).toBe("a2");
	scope = advance(scope, "a3");
	expect(scope).toEqual({ cursor: "a3", open: undefined });
});

test("task reset returns to first-active; permission withdrawal voids anchors but keeps cursors", () => {
	const t = sample().tasks["5"];
	const reset = resetTask(t);
	expect(reset.status).toBe("unclear");
	expect(reset.progressReports).toEqual([]);
	expect(reset.cursor).toBeUndefined();
	expect(reset.open).toBe("u1");
	expect(reset.firstActive).toBe("u1");
	const s = withdrawPermission(sample().session);
	expect(s.interaction).toEqual({ state: "waiting_user" });
	expect(s.authorizedScope).toEqual({});
	expect(s.currentWork).toEqual({ target: 5, anchor: undefined });
	expect(s.cursor).toBe("a2");
});

// D3 reset table: one contract for scope change, reopen and contract change.
const resetCases: { name: string; task: Partial<ReturnType<typeof emptyTask>> | undefined; from?: string; open: string | undefined }[] = [
	{ name: "first-active known: re-judge from it, ignoring the segment", task: { firstActive: "u1", cursor: "a2", status: "still_ongoing" }, from: "a3", open: "u1" },
	{ name: "first-active unknown: re-judge from the given segment start", task: { cursor: "a2", status: "still_ongoing" }, from: "a3", open: "a3" },
	{ name: "first-active unknown and no segment: nothing to open yet", task: { cursor: "a2" }, from: undefined, open: undefined },
	{ name: "no prior state at all: fresh task opened at the segment", task: undefined, from: "a1", open: "a1" },
];
for (const c of resetCases) test(`D3 reset: ${c.name}`, () => {
	const reset = resetTask(c.task ? { ...emptyTask(), ...c.task } : undefined, c.from);
	expect(reset.open).toBe(c.open);
	expect(reset.cursor).toBeUndefined();
	expect(reset.status).toBe("unclear");
	expect(reset.progressReports).toEqual([]);
	expect(reset.anchors).toEqual({});
	expect(reset.firstActive).toBe(c.task?.firstActive);
});

test("D3: permission withdrawal voids session anchors but never moves task or session cursors", () => {
	const s = sample();
	const after = withdrawPermission(s.session);
	expect(after.cursor).toBe("a2");
	expect(after.open).toBeUndefined();
	expect(s.tasks["5"].cursor).toBe("a2");
});

test("D3: branch reconciliation keeps a scope only when every cursor/anchor is still on the branch", () => {
	const s = sample();
	const restored = restoreState([entry(s)], new Set(["a1", "a2", "a3"])); // u1 (first-active, authority) missing
	expect(restored.tasks["5"]).toBeUndefined();
	expect(restored.session).toEqual(emptyState().session);
	const kept = restoreState([entry(s)], ids);
	expect(kept.tasks["5"].cursor).toBe("a2");
	expect(scopeStart(kept.tasks["5"])).toEqual({ afterCursor: "a2" });
});
