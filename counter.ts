/**
 * Loop counting, reconstructed from the session branch.
 *
 * Pi's built-in turnIndex resets on every agent_start, so it cannot answer
 * "how many loops since session start". The branch can: one completed loop
 * = one finalized assistant message. Aborted turns never reach the branch,
 * so they never count — matching "10 loops" as actually-completed work.
 *
 * In-memory counters are authoritative between reconstructs; session_start /
 * session_compact / session_tree recompute both counters from the branch.
 */

interface BranchEntry {
	type?: string;
	message?: { role?: string };
}

export interface LoopCounter {
	/** Completed loops since session start (finalized assistant messages). */
	totalLoops: number;
	/** Loop index at which the most recent user message arrived (0 = before loop 1). */
	lastUserMsgAt: number;
}

export function freshCounter(): LoopCounter {
	return { totalLoops: 0, lastUserMsgAt: 0 };
}

/** Recompute both counters from a branch snapshot. */
export function replayCounter(branch: Iterable<unknown>): LoopCounter {
	const c = freshCounter();
	for (const entry of branch) {
		const e = entry as BranchEntry;
		if (e.type !== "message") continue;
		const role = e.message?.role;
		if (role === "assistant") c.totalLoops++;
		else if (role === "user") c.lastUserMsgAt = c.totalLoops;
	}
	return c;
}

/** turn_end: one more loop completed. */
export function onTurnEnd(c: LoopCounter): void {
	c.totalLoops++;
}

/**
 * message_end of a user message (fresh prompt or steer): the cooldown
 * reference becomes the loop count reached so far, so the next 5 completed
 * loops are inside the user-steering cooldown window.
 */
export function onUserMessage(c: LoopCounter): void {
	c.lastUserMsgAt = c.totalLoops;
}

/** Loops completed since the most recent user message. */
export function loopsSinceUserMsg(c: LoopCounter): number {
	return c.totalLoops - c.lastUserMsgAt;
}

/** Should an audit fire for the just-completed loop? */
export function shouldAudit(c: LoopCounter, interval: number, cooldownLoops: number): boolean {
	if (c.totalLoops <= 0 || c.totalLoops % interval !== 0) return false;
	return loopsSinceUserMsg(c) > cooldownLoops;
}
