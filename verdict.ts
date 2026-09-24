/**
 * Map jev's Choice answers to an action: stay silent, inject a corrective
 * message into the conversation, or notify the user when confidence is low.
 *
 * Confidence gate: only the answers actually used to compose a corrective
 * message are gated — aligned verdicts never inject, whatever the others say.
 */

import type { BoardSnapshot } from "./board.js";
import { inProgressTasks } from "./board.js";
import type { AuditAnswers, ChoiceAnswer } from "./typesafe.js";
import { NOT_ON_BOARD } from "./typesafe.js";

export type VerdictAction =
	| { kind: "silent" }
	| { kind: "inject"; text: string }
	| { kind: "notify"; text: string };

function conf(a: ChoiceAnswer | undefined): number {
	return a?.confidence ?? 0;
}

export function decide(answers: AuditAnswers, board: BoardSnapshot, threshold: number, loop: number): VerdictAction {
	const align = answers.alignment;
	if (!align) return { kind: "notify", text: "[jev audit] missing alignment answer — audit skipped" };

	if (align.choice === "aligned") {
		if (conf(align) < threshold) {
			return { kind: "notify", text: `[jev audit @ loop ${loop}] alignment uncertain (confidence ${conf(align).toFixed(2)}) — left alone` };
		}
		return { kind: "silent" };
	}

	// Verdict requires action → every used answer must clear the threshold.
	const used = [align, answers.stale_status, answers.current_match, answers.drift].filter(Boolean) as ChoiceAnswer[];
	const low = used.find((a) => conf(a) < threshold);
	if (low) {
		return {
			kind: "notify",
			text: `[jev audit @ loop ${loop}] verdict "${align.choice}" but confidence ${conf(low).toFixed(2)} < ${threshold} — no correction injected`,
		};
	}

	const stale = answers.stale_status?.choice;
	const match = answers.current_match?.choice;
	const drift = answers.drift?.choice;
	const inProg = inProgressTasks(board);
	const inProgLabel = inProg.map((t) => `#${t.id} "${t.subject}"`).join(", ") || "(none)";

	const lines: string[] = [
		`[jev audit @ loop ${loop}] Todo board ↔ actual work mismatch.`,
		`- Board shows in_progress: ${inProgLabel} → jev: ${stale ?? "unknown"}`,
		`- Current work matches: ${match && match !== NOT_ON_BOARD ? `#${match}` : "nothing on the board"}`,
	];
	if (drift === "drifted") lines.push("- Direction: drifted off the board's plan");

	const steps: string[] = [];
	if (stale === "actually_completed") steps.push(`mark ${inProgLabel} completed`);
	else if (stale === "still_ongoing") steps.push(`set ${inProgLabel} back to pending (or keep it only if you truly resumed it)`);
	else if (stale === "cancelled") steps.push(`delete ${inProgLabel} (cancelled)`);
	else if (stale === "deliberately_deferred") steps.push(`set ${inProgLabel} to pending and note the deferral in its description`);

	if (match && match !== NOT_ON_BOARD) steps.push(`set #${match} in_progress with an accurate activeForm`);
	else steps.push("create todo task(s) for the work you are actually doing, plus planned follow-ups, and set the current one in_progress");

	if (drift === "drifted") steps.push("STOP the off-plan work and resume the next pending board task");

	lines.push("Fix the board now via the todo tool:", ...steps.map((s, i) => `${i + 1}. ${s}`));
	return { kind: "inject", text: lines.join("\n") };
}
