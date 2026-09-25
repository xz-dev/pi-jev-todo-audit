/**
 * TypeSafe API client — one POST /v1/systemone per audit, all questions
 * batched into a single request (TypeSafe's documented practice). Choice
 * answers carry choice + probabilities + confidence; the caller decides.
 *
 * Per-task lifecycle questions use the key `task_status_<id>`: each visible
 * unfinished task gets its own Choice so one aggregate answer can never be
 * smeared across parallel in_progress tasks.
 */

import type { BoardSnapshot } from "./board.js";
import { renderBoardLines, inProgressTasks, unfinishedTasks, visibleTasks } from "./board.js";

export interface ChoiceAnswer {
	choice: string;
	probabilities?: Record<string, number>;
	confidence?: number;
}

/** Key for a task's independent lifecycle question/answer. */
export const lifecycleKey = (taskId: number) => `task_status_${taskId}`;

export interface AuditAnswers {
	alignment?: ChoiceAnswer;
	current_match?: ChoiceAnswer;
	drift?: ChoiceAnswer;
	board_warranted?: ChoiceAnswer;
	granularity?: ChoiceAnswer;
	/** Per-task lifecycle answers, keyed lifecycleKey(taskId). */
	lifecycle?: Record<string, ChoiceAnswer>;
}

export type AuditResult =
	| { ok: true; answers: AuditAnswers }
	| { ok: false; error: string };

export interface AuditRequest {
	state: string;
	model: string;
	questions: Record<string, { type: "choice"; instructions: string; criteria: Record<string, unknown> }>;
}

export const NOT_ON_BOARD = "not_on_board";

/** Explicit stop metadata carried by a `pi:semantic-hook:v1` user-ready event. */
export interface TerminalStopInfo {
	stopKind: string;
	reasonType?: string;
	reason?: string;
}

/** Task-agnostic lifecycle criteria (pending + in_progress share the set). */
const LIFECYCLE_CRITERIA: Record<string, string> = {
	still_ongoing: "The task is still actively being worked on or is queued next — leave it as is",
	actually_completed: "The work is finished but the board was never updated",
	cancelled: "The work was abandoned on purpose — the task should be deleted",
	deliberately_deferred: "The work was deliberately shelved for later — return it to pending with the reason noted",
	blocked: "The work cannot progress without user input, approval, credentials, or an external blocker",
	future: "Deliberately scheduled later work — not actionable now and not forgotten",
	unclear: "Not enough observable evidence to tell",
};

/**
 * Build the audit request. `activity` is the recent-work digest; `terminalStop`
 * (when present) appends the explicit watchdog stop metadata to the state.
 * Board rows become both readable state and the option list for current_match.
 */
export function buildAuditRequest(
	board: BoardSnapshot,
	activity: string,
	model: string,
	terminalStop?: TerminalStopInfo,
): AuditRequest {
	const lines = renderBoardLines(board);
	const boardText = lines.length === 0 ? "(board is empty)" : lines.join("\n");
	let state = `Todo board:\n${boardText}\n\nRecent agent activity:\n${activity}`;
	if (terminalStop) {
		state += `\n\nTerminal stop (pi-continue-watchdog user-ready):\n- STOP_KIND: ${terminalStop.stopKind}`;
		if (terminalStop.reasonType) state += `\n- REASON_TYPE: ${terminalStop.reasonType}`;
		if (terminalStop.reason) state += `\n- REASON: ${terminalStop.reason}`;
		state += "\nThe agent autonomously stopped; judge whether the board still matches observable work and whether unfinished tasks are actionable now, blocked, future work, or intentionally deferred.";
	}

	const matchCriteria: Record<string, string> = {};
	for (const t of visibleTasks(board)) {
		matchCriteria[String(t.id)] = `Task #${t.id}: ${t.subject} [${t.status}]`;
	}
	matchCriteria[NOT_ON_BOARD] = "The current work does not correspond to any task on the board";

	const questions: AuditRequest["questions"] = {
		alignment: {
			type: "choice",
			instructions: "Is the agent's current work the task(s) currently marked in_progress on the todo board?",
			criteria: {
				aligned: "Current work matches the in_progress task(s)",
				not_aligned: "Current work is something else than the in_progress task(s)",
				no_in_progress_task: "The board has no in_progress task right now",
				unclear: "Not enough evidence to tell",
			},
		},
		current_match: {
			type: "choice",
			instructions: "Which board task does the agent's current work actually correspond to?",
			criteria: matchCriteria,
		},
		drift: {
			type: "choice",
			instructions: "Has the agent drifted away from the plan represented by the todo board?",
			criteria: {
				on_track: "Work follows the board's plan",
				drifted: "Work has wandered off the board's plan",
				blocked: "Work is blocked, not drifted",
			},
		},
		granularity: {
			type: "choice",
			instructions: "Can the in_progress task(s) on the board each be verified by a single observable result (a test passing, a file existing, a command succeeding)?",
			criteria: {
				single_verifiable_outcome: "Each in_progress task maps to one checkable deliverable",
				bundles_multiple_outcomes: "At least one in_progress task bundles several deliverables and should be split",
				ambiguous_done_criteria: "At least one in_progress task has no clear completion signal",
				not_applicable: "No in_progress task exists, or the board cannot be evaluated",
			},
		},
	};

	// Independent lifecycle question per visible unfinished task. Each task is
	// judged on its own evidence — multiple in_progress tasks are valid
	// parallel work, never an error by themselves.
	for (const t of unfinishedTasks(board)) {
		questions[lifecycleKey(t.id)] = {
			type: "choice",
			instructions: `For task #${t.id} "${t.subject}" [${t.status}]: judging ONLY this task, what is its real lifecycle state? Multiple in_progress tasks are allowed — do not treat parallelism itself as a problem.`,
			criteria: { ...LIFECYCLE_CRITERIA },
		};
	}

	// Only ask when nothing is in_progress: an empty board OR an all-done
	// board. If something is already claimed in_progress, the board is live
	// and the warrant question would be noise.
	if (inProgressTasks(board).length === 0) {
		questions.board_warranted = {
			type: "choice",
			instructions: "Does the agent's current activity warrant tracking on a todo board?",
			criteria: {
				warranted: "Long-running or multi-step work that benefits from tracked tasks",
				trivial: "Short single-step work (one answer, one edit, a quick lookup) that does not need a board",
				idle: "No substantive work in progress (chat, clarifying question, awaiting input)",
			},
		};
	}

	return { state, model, questions };
}

/** Narrow a raw answers payload: task_status_* keys fold into `lifecycle`. */
function normalizeAnswers(raw: unknown): AuditAnswers | undefined {
	if (!raw || typeof raw !== "object") return undefined;
	const src = raw as Record<string, unknown>;
	const out: AuditAnswers = {};
	const lifecycle: Record<string, ChoiceAnswer> = {};
	for (const [k, v] of Object.entries(src)) {
		if (!v || typeof v !== "object" || typeof (v as ChoiceAnswer).choice !== "string") continue;
		if (k.startsWith("task_status_")) lifecycle[k] = v as ChoiceAnswer;
		else if (k === "alignment" || k === "current_match" || k === "drift" || k === "board_warranted" || k === "granularity") {
			(out as Record<string, unknown>)[k] = v;
		}
	}
	if (Object.keys(lifecycle).length > 0) out.lifecycle = lifecycle;
	return out;
}

export async function runAudit(
	req: AuditRequest,
	opts: { apiUrl: string; apiKey: string; timeoutMs: number; fetchFn?: (url: string, init?: RequestInit) => Promise<Response> },
): Promise<AuditResult> {
	const fetchFn = opts.fetchFn ?? fetch;
	try {
		const res = await fetchFn(opts.apiUrl, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				authorization: `Bearer ${opts.apiKey}`,
			},
			body: JSON.stringify(req),
			signal: AbortSignal.timeout(opts.timeoutMs),
		});
		if (!res.ok) {
			const body = await res.text().catch(() => "");
			return { ok: false, error: `HTTP ${res.status}${body ? `: ${body.slice(0, 300)}` : ""}` };
		}
		const body = (await res.json()) as { answers?: unknown };
		const answers = normalizeAnswers(body.answers);
		if (!answers) {
			return { ok: false, error: "malformed response: no answers" };
		}
		return { ok: true, answers };
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : String(e) };
	}
}
