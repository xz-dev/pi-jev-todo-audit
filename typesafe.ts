/**
 * TypeSafe API client — one POST /v1/systemone per audit, all questions
 * batched into a single request (TypeSafe's documented practice). Choice
 * answers carry choice + probabilities + confidence; the caller decides.
 */

import type { BoardSnapshot } from "./board.js";
import { renderBoardLines, inProgressTasks, visibleTasks } from "./board.js";

export interface ChoiceAnswer {
	choice: string;
	probabilities?: Record<string, number>;
	confidence?: number;
}

export interface AuditAnswers {
	alignment?: ChoiceAnswer;
	stale_status?: ChoiceAnswer;
	current_match?: ChoiceAnswer;
	drift?: ChoiceAnswer;
	board_warranted?: ChoiceAnswer;
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

/**
 * Build the audit request. `activity` is the recent-work digest. Board rows
 * become both readable state and the option list for current_match.
 */
export function buildAuditRequest(board: BoardSnapshot, activity: string, model: string): AuditRequest {
	const lines = renderBoardLines(board);
	const boardText = lines.length === 0 ? "(board is empty)" : lines.join("\n");
	const state = `Todo board:\n${boardText}\n\nRecent agent activity:\n${activity}`;

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
		stale_status: {
			type: "choice",
			instructions: "If the displayed in_progress task is not what the agent is doing, what actually happened to it?",
			criteria: {
				actually_completed: "It was finished but never marked completed",
				still_ongoing: "It was paused mid-way, not finished",
				cancelled: "It was abandoned on purpose",
				deliberately_deferred: "It was deliberately shelved for later",
				other: "None of the above fits",
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
	};

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
		const body = (await res.json()) as { answers?: AuditAnswers };
		if (!body.answers || typeof body.answers !== "object") {
			return { ok: false, error: "malformed response: no answers" };
		}
		return { ok: true, answers: body.answers };
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : String(e) };
	}
}
