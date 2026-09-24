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

/** Board + the loop index at which each task entered in_progress. */
export interface BoardWithAges extends BoardSnapshot {
	/** taskId → assistant-message count when it last transitioned to in_progress. */
	inProgressSince: Map<number, number>;
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
	return replayBoardWithAges(branch);
}

/**
 * Same last-write-wins replay as replayBoard, but also stamps each task's
 * in_progress entry point: the assistant-message count at the snapshot where
 * the task's status transitioned to in_progress. Re-entries restamp.
 * Completed/deleted tasks drop their stamp.
 */
export function replayBoardWithAges(branch: Iterable<unknown>): BoardWithAges {
	let result: BoardSnapshot = { tasks: [], nextId: 1 };
	const inProgressSince = new Map<number, number>();
	const prevStatus = new Map<number, BoardTask["status"]>();
	let loops = 0;
	for (const entry of branch) {
		const e = entry as BranchEntry;
		if (e.type !== "message") continue;
		const msg = e.message;
		if (msg?.role === "assistant") {
			loops++;
			continue;
		}
		if (msg?.role !== "toolResult" || msg.toolName !== "todo") continue;
		if (!isTaskDetails(msg.details)) continue;
		result = {
			tasks: msg.details.tasks.map((t) => ({ ...t })),
			nextId: msg.details.nextId,
		};
		const seen = new Set<number>();
		for (const t of result.tasks) {
			seen.add(t.id);
			const was = prevStatus.get(t.id);
			if (t.status === "in_progress" && was !== "in_progress") {
				inProgressSince.set(t.id, loops);
			} else if (t.status !== "in_progress") {
				inProgressSince.delete(t.id);
			}
			prevStatus.set(t.id, t.status);
		}
		for (const id of prevStatus.keys()) {
			if (!seen.has(id)) {
				prevStatus.delete(id);
				inProgressSince.delete(id);
			}
		}
	}
	return { ...result, inProgressSince };
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

/**
 * Task ids that have been in_progress for more than `staleSpans` audit
 * intervals. `currentLoops` is the counter's totalLoops; `interval` is the
 * audit cadence. Missing stamp (task was in_progress before the first
 * snapshot we saw) counts as age 0 — conservative.
 */
export function staleTaskIds(board: BoardWithAges, currentLoops: number, interval: number, staleSpans: number): number[] {
	const out: number[] = [];
	for (const t of inProgressTasks(board)) {
		const since = board.inProgressSince.get(t.id) ?? currentLoops;
		const ageLoops = currentLoops - since;
		if (ageLoops > staleSpans * interval) out.push(t.id);
	}
	return out;
}
