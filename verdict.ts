/**
 * Map jev's Choice answers to an action: stay silent, inject a corrective
 * message into the conversation, or notify the user when confidence is low.
 *
 * Lifecycle verdicts are per task: `lifecycle["task_status_<id>"]` is judged
 * and confidence-gated independently, so one uncertain task never suppresses
 * or contaminates its siblings. Parallel in_progress is valid by default.
 * Aggregate answers (alignment/current_match/drift/warrant) are gated the
 * same way — a low-confidence answer never emits a state-changing step.
 */

import type { BoardSnapshot, BoardTask } from "./board.js";
import { inProgressTasks, unfinishedTasks } from "./board.js";
import type { AuditAnswers, ChoiceAnswer } from "./typesafe.js";
import { lifecycleKey, NOT_ON_BOARD } from "./typesafe.js";

export type VerdictAction =
	| { kind: "silent" }
	| { kind: "inject"; text: string }
	| { kind: "notify"; text: string };

/** Extra options for terminal-stop audits. */
export interface DecideOptions {
	/** True when this verdict comes from a `user-ready` terminal-stop check. */
	terminalStop?: boolean;
}

function conf(a: ChoiceAnswer | undefined): number {
	return a?.confidence ?? 0;
}

function taskLabel(board: BoardSnapshot, id: number): string {
	const t = board.tasks.find((t) => t.id === id);
	return t ? `#${id} "${t.subject}"` : `#${id}`;
}

/** Numbered corrective steps after a one-line headline. */
function injectText(trigger: string, headline: string, steps: string[]): string {
	return [`[jev audit ${trigger}] ${headline}`,
		"Fix the board now via the todo tool:", ...steps.map((s, i) => `${i + 1}. ${s}`)].join("\n");
}

/** Note (not a step) listing tasks whose verdict was too uncertain to act on. */
function uncertainNote(uncertain: TaskVerdict[]): string | undefined {
	return uncertain.length > 0
		? `(not touched: ${uncertain.map((v) => `#${v.task.id}`).join(", ")} — verdict uncertain)`
		: undefined;
}

/** Which in_progress task ids need splitting, from staleness + granularity. */
function splitTargets(answers: AuditAnswers, board: BoardSnapshot, threshold: number, staleIds: number[]): number[] {
	const ids = new Set<number>(staleIds);
	const g = answers.granularity;
	const coarse = g && (g.choice === "bundles_multiple_outcomes" || g.choice === "ambiguous_done_criteria") && conf(g) >= threshold;
	if (coarse) {
		// granularity answers describe the worst offender; flag all in_progress.
		for (const t of inProgressTasks(board)) ids.add(t.id);
	}
	return [...ids].sort((a, b) => a - b);
}

function splitStep(ids: number[], board: BoardSnapshot): string {
	const labels = ids.map((id) => taskLabel(board, id)).join(", ");
	return `split ${labels} into smaller tasks — each with a single verifiable outcome (test passes, file exists, command exits 0)`;
}

interface TaskVerdict {
	task: BoardTask;
	answer: ChoiceAnswer;
}

/**
 * Per-task lifecycle results, split into actionable vs uncertain.
 * Destructive/state-changing outcomes are confidence-gated individually.
 */
function classifyLifecycle(answers: AuditAnswers, board: BoardSnapshot, threshold: number): {
	actions: TaskVerdict[];
	uncertain: TaskVerdict[];
	ongoing: TaskVerdict[];
} {
	const actions: TaskVerdict[] = [];
	const uncertain: TaskVerdict[] = [];
	const ongoing: TaskVerdict[] = [];
	for (const t of unfinishedTasks(board)) {
		const a = answers.lifecycle?.[lifecycleKey(t.id)];
		if (!a) continue;
		switch (a.choice) {
			case "still_ongoing":
			case "future":
				// Non-destructive verdicts: leave the task alone regardless of confidence.
				ongoing.push({ task: t, answer: a });
				break;
			case "actually_completed":
			case "cancelled":
			case "deliberately_deferred":
			case "blocked":
				if (conf(a) >= threshold) actions.push({ task: t, answer: a });
				else uncertain.push({ task: t, answer: a });
				break;
			default:
				// unclear / unknown / missing → notify-level uncertainty
				uncertain.push({ task: t, answer: a });
		}
	}
	return { actions, uncertain, ongoing };
}

/** Render the corrective step for one actionable lifecycle verdict. */
function lifecycleStep(v: TaskVerdict): string {
	const label = `#${v.task.id} "${v.task.subject}"`;
	switch (v.answer.choice) {
		case "actually_completed":
			return `mark ${label} completed — the work is done`;
		case "cancelled":
			return `delete ${label} — the work was cancelled (todo delete; the board keeps a deleted tombstone)`;
		case "deliberately_deferred":
			return `set ${label} back to pending and record the deferral reason in its description/metadata`;
		case "blocked":
			return v.task.status === "in_progress"
				? `set ${label} back to pending and record why it is blocked (user input, approval, or external blocker)`
				: `leave ${label} pending and record why it is blocked (user input, approval, or external blocker)`;
		default:
			return `reconcile ${label}`;
	}
}

export function decide(
	answers: AuditAnswers,
	board: BoardSnapshot,
	threshold: number,
	loop: number,
	staleIds: number[] = [],
	opts: DecideOptions = {},
): VerdictAction {
	const align = answers.alignment;
	const stop = opts.terminalStop === true;
	const trigger = stop ? "terminal-stop" : `@ loop ${loop}`;
	const { actions, uncertain, ongoing } = classifyLifecycle(answers, board, threshold);

	// Confidence of the aggregate answers — each gates its own derived steps.
	const alignOk = !!align && conf(align) >= threshold;
	const matchOk = !!answers.current_match && conf(answers.current_match) >= threshold;
	const drifted = answers.drift?.choice === "drifted" && conf(answers.drift) >= threshold;

	// No alignment answer at all: lifecycle evidence can still drive a
	// per-task correction; without either, the audit is unusable.
	if (!align) {
		if (actions.length === 0 && uncertain.length === 0) {
			return { kind: "notify", text: `[jev audit] missing alignment answer — audit skipped` };
		}
		if (actions.length === 0) {
			const labels = uncertain.map((v) => `#${v.task.id}`).join(", ");
			return { kind: "notify", text: `[jev audit ${trigger}] lifecycle verdict uncertain for ${labels} — left alone` };
		}
		const steps = actions.map(lifecycleStep);
		const note = uncertainNote(uncertain);
		if (note) steps.push(note);
		return { kind: "inject", text: injectText(trigger, "Per-task board reconciliation.", steps) };
	}

	if (align.choice === "aligned") {
		if (!alignOk) {
			return { kind: "notify", text: `[jev audit ${trigger}] alignment uncertain (confidence ${conf(align).toFixed(2)}) — left alone` };
		}
		// Per-task lifecycle findings still apply on an aligned board: the
		// aggregate match is right, but a sibling task may be stale/finished.
		const splits = splitTargets(answers, board, threshold, staleIds);
		if (actions.length === 0 && splits.length === 0) {
			if (uncertain.length > 0) {
				const labels = uncertain.map((v) => `#${v.task.id}`).join(", ");
				return { kind: "notify", text: `[jev audit ${trigger}] board aligned; lifecycle uncertain for ${labels} — left alone` };
			}
			return { kind: "silent" };
		}
		const steps = [...actions.map(lifecycleStep)];
		if (splits.length > 0) steps.push(splitStep(splits, board));
		const note = uncertainNote(uncertain);
		if (note) steps.push(note);
		return {
			kind: "inject",
			text: injectText(trigger,
				`Board aligned, but ${splits.length > 0 ? "task(s) too coarse to steer by" : "task lifecycle needs reconciliation"}.`,
				steps),
		};
	}

	// No in_progress task on the board: nothing to compare against. If the
	// agent is working anyway, the fix is "claim what you're doing", not
	// resolving a stale task. Per-task lifecycle answers still apply to
	// pending tasks (obsolete/deferred/blocked).
	if (align.choice === "no_in_progress_task") {
		const warrant = answers.board_warranted;
		if (warrant && (warrant.choice === "trivial" || warrant.choice === "idle")) {
			// Terminal-stop nuance: on an unfinished board, still surface
			// actionable lifecycle verdicts even when the immediate work is trivial.
			if (actions.length === 0) return { kind: "silent" };
		}
		const used = [align, answers.current_match, warrant].filter(Boolean) as ChoiceAnswer[];
		if (used.some((a) => conf(a) < threshold) && actions.length === 0) {
			return { kind: "notify", text: `[jev audit ${trigger}] board has no in_progress but agent is working — verdict uncertain (conf ${conf(align).toFixed(2)})` };
		}
		const steps: string[] = actions.map(lifecycleStep);
		// Match/create steps are confidence-gated independently: an uncertain
		// match contributes no claim instruction.
		if (matchOk && answers.current_match!.choice !== NOT_ON_BOARD) {
			steps.push(`set ${taskLabel(board, Number(answers.current_match!.choice))} in_progress with an accurate activeForm`);
		} else if (!(stop && actions.length > 0) && alignOk) {
			steps.push("create todo task(s) for your current work and mark it in_progress");
		}
		if (drifted) steps.push("STOP the off-plan work and resume the next pending board task");
		const note = uncertainNote(uncertain);
		if (note) steps.push(note);
		if (steps.length === 0) {
			return { kind: "notify", text: `[jev audit ${trigger}] board has no in_progress — verdict too uncertain to act on` };
		}
		return {
			kind: "inject",
			text: injectText(trigger, "No task marked in_progress but you are actively working.", steps),
		};
	}

	// not_aligned / unclear: aggregate gate + per-task lifecycle corrections.
	const used = [align, answers.current_match].filter(Boolean) as ChoiceAnswer[];
	const low = used.find((a) => conf(a) < threshold);
	if (low && actions.length === 0) {
		return {
			kind: "notify",
			text: `[jev audit ${trigger}] verdict "${align.choice}" but confidence ${conf(low).toFixed(2)} < ${threshold} — no correction injected`,
		};
	}

	const match = answers.current_match?.choice;
	const splits = splitTargets(answers, board, threshold, staleIds);
	const inProg = inProgressTasks(board);
	const inProgLabel = inProg.map((t) => `#${t.id} "${t.subject}"`).join(", ") || "(none)";

	const lines: string[] = [
		`[jev audit ${trigger}] Todo board ↔ actual work mismatch.`,
		`- Board shows in_progress: ${inProgLabel}`,
		`- Per-task verdicts: ${[
			...actions.map((v) => `${taskLabel(board, v.task.id)} → ${v.answer.choice}`),
			...ongoing.map((v) => `${taskLabel(board, v.task.id)} → ${v.answer.choice}`),
		].join(", ") || "none"}`,
		`- Current work matches: ${match && match !== NOT_ON_BOARD ? `#${match}` : "nothing on the board"}`,
	];
	if (drifted) lines.push("- Direction: drifted off the board's plan");

	const steps: string[] = actions.map(lifecycleStep);

	// No per-task verdict for an in_progress task that aggregate verdict calls
	// wrong → conservative fallback: ask to recheck, never auto-mutate.
	const judged = new Set([...actions, ...ongoing, ...uncertain].map((v) => v.task.id));
	const unjudged = inProg.filter((t) => !judged.has(t.id));
	if (align.choice === "not_aligned" && unjudged.length > 0 && actions.length === 0 && alignOk) {
		steps.push(`recheck ${unjudged.map((t) => `#${t.id}`).join(", ")} — is it still what you are doing?`);
	}

	// Aggregate match/create steps gated on their own confidence.
	if (matchOk && match && match !== NOT_ON_BOARD) steps.push(`set ${taskLabel(board, Number(match))} in_progress with an accurate activeForm`);
	else if (match && match !== NOT_ON_BOARD) steps.push(`recheck #${match} — the match verdict was too uncertain to claim it`);
	else if (!stop && alignOk) steps.push("create todo task(s) for the work you are actually doing, plus planned follow-ups, and set the current one in_progress");

	if (splits.length > 0) steps.push(splitStep(splits, board));
	if (drifted) steps.push("STOP the off-plan work and resume the next pending board task");
	const note = uncertainNote(uncertain);
	if (note) steps.push(note);

	if (steps.length === 0) {
		return { kind: "notify", text: `[jev audit ${trigger}] board ↔ work mismatch but no confident verdict — nothing injected` };
	}
	lines.push("Fix the board now via the todo tool:", ...steps.map((s, i) => `${i + 1}. ${s}`));
	return { kind: "inject", text: lines.join("\n") };
}
