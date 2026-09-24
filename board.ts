/**
 * Read the rpiv-todo board by replaying the session branch — the same seam
 * rpiv-todo itself uses for persistence (tool-result `details` snapshots,
 * last-write-wins). Deliberately no import of rpiv-todo internals: the wire
 * shape is the stable contract, module internals are not.
 */

export interface BoardTask {
	id: number;
	subject: string;
	description?: string;
	activeForm?: string;
	status: "pending" | "in_progress" | "completed" | "deleted";
	blockedBy?: number[];
	owner?: string;
	metadata?: Record<string, unknown>;
}

export interface BoardSnapshot {
	tasks: BoardTask[];
	nextId: number;
}

export const EMPTY_BOARD: BoardSnapshot = { tasks: [], nextId: 1 };

interface BranchEntry {
	type?: string;
	message?: { role?: string; toolName?: string; details?: unknown };
}

/** Duck-type check mirroring rpiv-todo's own discriminator. */
export function isTaskDetails(value: unknown): value is { tasks: BoardTask[]; nextId: number } {
	if (!value || typeof value !== "object") return false;
	const v = value as Record<string, unknown>;
	return Array.isArray(v.tasks) && typeof v.nextId === "number";
}

/**
 * Last todo tool result wins. Walks chronologically; returns EMPTY_BOARD
 * when no valid snapshot exists on the branch.
 */
export function replayBoard(branch: Iterable<unknown>): BoardSnapshot {
	let result: BoardSnapshot = { tasks: [], nextId: 1 };
	for (const entry of branch) {
		const e = entry as BranchEntry;
		if (e.type !== "message") continue;
		const msg = e.message;
		if (msg?.role !== "toolResult" || msg.toolName !== "todo") continue;
		if (!isTaskDetails(msg.details)) continue;
		result = {
			tasks: msg.details.tasks.map((t) => ({ ...t })),
			nextId: msg.details.nextId,
		};
	}
	return result;
}

/** Visible (non-deleted) tasks. */
export function visibleTasks(board: BoardSnapshot): BoardTask[] {
	return board.tasks.filter((t) => t.status !== "deleted");
}

/**
 * Render the board the same way `/todos`/`todo list` presents it, so jev sees
 * the same rows the model does: `[status] #id subject (activeForm) ⛓ #deps`.
 */
export function renderBoardLines(board: BoardSnapshot): string[] {
	const tasks = visibleTasks(board);
	if (tasks.length === 0) return [];
	return tasks.map((t) => {
		const form = t.status === "in_progress" && t.activeForm ? ` (${t.activeForm})` : "";
		const deps = t.blockedBy?.length ? ` ⛓ ${t.blockedBy.map((id) => `#${id}`).join(",")}` : "";
		return `[${t.status}] #${t.id} ${t.subject}${form}${deps}`;
	});
}

/** In-progress tasks currently claimed on the board. */
export function inProgressTasks(board: BoardSnapshot): BoardTask[] {
	return visibleTasks(board).filter((t) => t.status === "in_progress");
}
