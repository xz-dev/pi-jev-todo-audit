/**
 * Shared business answer types and question keys consumed by the verdict.
 * Request construction lives in questions.ts (change questions over stored
 * judgment state); the historical whole-history request builder is retired
 * (see test/legacy/retired-protocol).
 */

export interface ChoiceAnswer { choice: string; probabilities?: Record<string, number>; confidence?: number }
export interface AuditAnswers {
	alignment?: ChoiceAnswer;
	current_match?: ChoiceAnswer;
	drift?: ChoiceAnswer;
	board_warranted?: ChoiceAnswer;
	interaction?: ChoiceAnswer;
	work_evidence?: ChoiceAnswer;
	lifecycle?: Record<string, ChoiceAnswer>;
	granularity?: Record<string, ChoiceAnswer>;
	granularityEvidence?: Record<string, ChoiceAnswer>;
	evidence?: Record<string, ChoiceAnswer>;
	reconciliation?: Record<string, ChoiceAnswer>;
}
/** Local structural withholding: no model judgment, usage or rejection envelope. */
export interface WithheldChoice { question: string; count: number; limit: 255 }
/** One actual provider request. Usage is provider-reported; undefined means unknown, never zero. */
export interface Attempt {
	id?: string;
	phase?: "start" | "end";
	outcome: "answered" | "malformed" | "overflow" | "http_error" | "network_error" | "unfinished" | "aborted";
	status?: number;
	model?: string;
	inputTokens?: number;
	outputTokens?: number;
	costUsd?: number;
	stateBytes?: number;
	questionBytes?: number;
	longestQuestionBytes?: number;
}
export interface TerminalStopInfo { stopKind: string; reasonType?: string; reason?: string }
export const NOT_ON_BOARD = "not_on_board";
export const lifecycleKey = (id: number) => `task_status_${id}`;
export const granularityKey = (id: number) => `task_granularity_${id}`;
export const evidenceKey = (id: number) => `task_evidence_${id}`;
export const reconciliationKey = (id: number) => `task_board_${id}`;

const GROUPS = [["task_status_", "lifecycle"], ["task_granularity_", "granularity"], ["task_evidence_", "evidence"], ["task_board_", "reconciliation"]] as const;
export function groupAnswers(flat: Record<string, ChoiceAnswer>): AuditAnswers {
	const out: AuditAnswers = {};
	for (const [key, answer] of Object.entries(flat)) {
		const group = GROUPS.find(([prefix]) => key.startsWith(prefix))?.[1];
		if (group) (out[group] ??= {})[key] = answer;
		else (out as Record<string, unknown>)[key] = answer;
	}
	return out;
}
