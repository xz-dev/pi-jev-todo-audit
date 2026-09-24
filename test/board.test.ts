import { describe, expect, test } from "bun:test";
import { inProgressTasks, isTaskDetails, renderBoardLines, replayBoard, replayBoardWithAges, staleTaskIds, visibleTasks, type BoardTask } from "../board.js";

const task = (id: number, status: BoardTask["status"], extra: Partial<BoardTask> = {}): BoardTask => ({
	id,
	subject: `task ${id}`,
	status,
	...extra,
});

const snapshotMsg = (tasks: BoardTask[], nextId = 10) => ({
	type: "message",
	message: {
		role: "toolResult",
		toolName: "todo",
		details: { action: "list", params: {}, tasks, nextId },
	},
});

describe("board", () => {
	test("empty branch → empty board", () => {
		expect(replayBoard([]).tasks).toEqual([]);
	});

	test("last todo snapshot wins", () => {
		const branch = [
			snapshotMsg([task(1, "pending")]),
			{ type: "message", message: { role: "assistant", content: "x" } },
			snapshotMsg([task(1, "completed"), task(2, "in_progress")]),
		];
		const b = replayBoard(branch);
		expect(b.tasks).toHaveLength(2);
		expect(b.tasks[1].status).toBe("in_progress");
	});

	test("corrupt/non-todo entries skipped", () => {
		const branch = [
			snapshotMsg([task(1, "pending")]),
			{ type: "message", message: { role: "toolResult", toolName: "todo", details: { nope: true } } },
			{ type: "message", message: { role: "toolResult", toolName: "read", details: {} } },
			{ type: "entry", message: undefined },
		];
		expect(replayBoard(branch).tasks).toHaveLength(1);
	});

	test("isTaskDetails shape check", () => {
		expect(isTaskDetails({ tasks: [], nextId: 1 })).toBe(true);
		expect(isTaskDetails({ tasks: "x" })).toBe(false);
		expect(isTaskDetails(null)).toBe(false);
	});

	test("visibleTasks hides deleted", () => {
		const b = { tasks: [task(1, "pending"), task(2, "deleted"), task(3, "completed")], nextId: 4 };
		expect(visibleTasks(b).map((t) => t.id)).toEqual([1, 3]);
	});

	test("renderBoardLines mirrors /todos rows", () => {
		const b = {
			tasks: [
				task(1, "completed"),
				task(3, "in_progress", { subject: "Build repo", activeForm: "building repo", blockedBy: [1] }),
			],
			nextId: 4,
		};
		expect(renderBoardLines(b)).toEqual([
			"[completed] #1 task 1",
			"[in_progress] #3 Build repo (building repo) ⛓ #1",
		]);
	});

	test("inProgressTasks", () => {
		const b = { tasks: [task(1, "in_progress"), task(2, "pending")], nextId: 3 };
		expect(inProgressTasks(b).map((t) => t.id)).toEqual([1]);
	});

	test("in_progress entry stamped at transition loop", () => {
		const assistant = { type: "message", message: { role: "assistant", content: "x" } };
		const branch = [
			snapshotMsg([task(1, "pending")]),
			assistant, assistant, assistant, assistant, assistant, // 5 loops
			snapshotMsg([task(1, "in_progress")]),
			assistant, assistant, assistant, // 3 more loops → total 8
		];
		const b = replayBoardWithAges(branch);
		expect(b.inProgressSince.get(1)).toBe(5);
	});

	test("re-entry into in_progress restamps", () => {
		const assistant = { type: "message", message: { role: "assistant", content: "x" } };
		const branch = [
			snapshotMsg([task(1, "in_progress")]),
			assistant, assistant, // loops 2
			snapshotMsg([task(1, "pending")]),
			assistant, assistant, assistant, // loops 5
			snapshotMsg([task(1, "in_progress")]),
		];
		const b = replayBoardWithAges(branch);
		expect(b.inProgressSince.get(1)).toBe(5);
	});

	test("completed task drops stamp", () => {
		const assistant = { type: "message", message: { role: "assistant", content: "x" } };
		const branch = [
			snapshotMsg([task(1, "in_progress")]),
			assistant,
			snapshotMsg([task(1, "completed")]),
		];
		const b = replayBoardWithAges(branch);
		expect(b.inProgressSince.has(1)).toBe(false);
	});

	test("staleTaskIds flags only over-span tasks", () => {
		// interval 10, staleSpans 3 → stale when age > 30 loops
		const b: import("../board.js").BoardWithAges = {
			tasks: [task(1, "in_progress"), task(2, "in_progress"), task(3, "pending")],
			nextId: 4,
			inProgressSince: new Map([[1, 0], [2, 25]]),
		};
		// currentLoops 40: #1 age 40 (stale), #2 age 15 (not), #3 not in_progress
		expect(staleTaskIds(b, 40, 10, 3)).toEqual([1]);
		// currentLoops 35: #1 age 35 (>30 → stale), #2 age 10
		expect(staleTaskIds(b, 35, 10, 3)).toEqual([1]);
		// boundary: age exactly 30 → not stale (needs >)
		expect(staleTaskIds(b, 30, 10, 3)).toEqual([]);
	});
});
