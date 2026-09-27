/** Deterministic safety gates around advisory model judgments, not a second classifier. */
import { inProgressTasks, unfinishedTasks, type BoardSnapshot, type BoardTask } from "./board.js";
import { digest, redact, workVersion, type AuditContext, type EvidenceRecord } from "./context.js";
import { evidenceKey, granularityKey, lifecycleKey, reconciliationKey, NOT_ON_BOARD, type AuditAnswers, type ChoiceAnswer } from "./typesafe.js";

export interface Correction { key: string; text: string; bookkeeping: boolean; execution: boolean }
export type VerdictAction =
	| { kind: "silent" }
	| { kind: "inject"; text: string; corrections: Correction[]; mayWake: boolean }
	| { kind: "notify"; text: string };
export interface DecideOptions {
	terminalStop?: boolean;
	context?: AuditContext;
	suppressed?: ReadonlySet<string>;
	evidenceVersion?: string;
	scopeKey?: string;
}
export function decide(answers: AuditAnswers, board: BoardSnapshot, threshold: number, loop: number, _staleIds: number[] = [], opts: DecideOptions = {}): VerdictAction {
	const strong = (a?: ChoiceAnswer): a is ChoiceAnswer => !!a && typeof a.confidence === "number" && Number.isFinite(a.confidence) && a.confidence >= threshold && a.confidence <= 1 && a.confidence >= 0;
	const source = (a?: ChoiceAnswer): EvidenceRecord | undefined => strong(a)
		? opts.context?.records.find((r) => r.id === a.choice && r.complete && !r.advice && r.kind !== "tool_call") : undefined;
	const context = opts.context;
	const workSource = source(answers.work_evidence);
	const globallyUsable = !!context?.globalComplete && !context.reduced && !context.records.some((r) =>
		(r.kind === "user" || r.kind === "summary") && !r.complete);
	const ready = strong(answers.interaction) && answers.interaction.choice === "working" && !!workSource && !["assistant", "supplement"].includes(workSource.kind);
	const matched = strong(answers.current_match) ? answers.current_match.choice : undefined;
	const alignment = strong(answers.alignment) ? answers.alignment.choice : undefined;
	const warrant = strong(answers.board_warranted) ? answers.board_warranted.choice : undefined;
	const warrantAllows = inProgressTasks(board).length > 0 || warrant === "warranted";
	const corrections: Correction[] = [];
	const uncertain: number[] = [];
	const unresolvedUserInput = !!context?.userBoundary && !context.records.some((r) =>
		r.id === context.userBoundary && r.kind === "user" && r.complete);
	if (unresolvedUserInput) return { kind: "notify", text: "[jev audit] latest user evidence is unavailable or redacted — no correction authorized" };
	let suppressed = false;
	const evidenceVersion = opts.evidenceVersion ?? (context ? workVersion(context, new Set(["todo"])) : "unavailable");
	const add = (task: BoardTask | undefined, action: string, text: string, evidence: EvidenceRecord, bookkeeping = false, execution = false) => {
		// Recording the requested blocker is reconciliation, not new authorization.
		const taskIdentity = action === "block" || action === "defer"
			? task && { id: task.id, subject: task.subject, owner: task.owner, blockedBy: task.blockedBy }
			: task;
		const key = digest({ scope: opts.scopeKey, task: taskIdentity, action, evidenceVersion });
		if (opts.suppressed?.has(key)) { suppressed = true; return; }
		// Display-only excerpt; the model saw the entire selected source, without this cap.
		const excerpt = evidence.text.length > 300 ? `${evidence.text.slice(0, 300)}… [excerpt]` : evidence.text;
		corrections.push({ key, text: `${redact(text)}\n   Evidence [${evidence.id}] (${evidence.kind}): ${redact(excerpt)}`, bookkeeping, execution });
	};
	for (const task of unfinishedTasks(board)) {
		const life = answers.lifecycle?.[lifecycleKey(task.id)];
		const anchor = source(answers.evidence?.[evidenceKey(task.id)]);
		const label = `#${task.id} "${task.subject}"`;
		if (context?.records.some((r) => r.id === `task:${task.id}` && !r.complete)) { uncertain.push(task.id); continue; }
		if (!strong(life) || life.choice === "unclear") { uncertain.push(task.id); continue; }
		if (life.choice === "actually_completed" || life.choice === "cancelled") {
			const credible = anchor && (life.choice === "actually_completed"
				? !["assistant", "summary", "supplement"].includes(anchor.kind) && !anchor.isError
				: !["assistant", "supplement"].includes(anchor.kind));
			if (!credible) { uncertain.push(task.id); continue; }
			add(task, life.choice, life.choice === "actually_completed" ? `mark ${label} completed — supplied evidence establishes its completion scope` : `delete ${label} — supplied evidence establishes cancellation`, anchor, true);
			continue;
		}
		if (life.choice === "blocked" || life.choice === "deliberately_deferred") {
			const representation = answers.reconciliation?.[reconciliationKey(task.id)];
			if (strong(representation) && representation.choice === "needs_reconciliation") {
				if (!anchor) { uncertain.push(task.id); continue; }
				add(task, life.choice === "blocked" ? "block" : "defer", `${task.status === "pending" ? "leave" : "set"} ${label} pending and record the evidenced ${life.choice === "blocked" ? "blocker" : "deferral"} in its description/metadata; do not execute it`, anchor, true);
			}
			continue;
		}
		if (!["still_ongoing", "actionable_now"].includes(life.choice)) continue;
		const dependencyBlocked = task.blockedBy?.some((id) => board.tasks.find((t) => t.id === id)?.status !== "completed");
		if (dependencyBlocked) continue;
		const granularity = answers.granularity?.[granularityKey(task.id)];
		if (task.status === "in_progress" && strong(granularity) &&
			["split_independent_outcomes", "split_verifiable_checkpoints", "clarify_done_criteria", "clarify_next_action"].includes(granularity.choice)) {
			if (!anchor || !globallyUsable || !ready) { uncertain.push(task.id); continue; }
			const instruction = {
				split_independent_outcomes: `split ${label} only along the evidenced independent outcomes, preserving authorized scope and avoiding already tracked work`,
				split_verifiable_checkpoints: `split ${label} into the evidenced verifiable checkpoints while preserving its overall goal; do not duplicate existing tasks`,
				clarify_done_criteria: `clarify the completion criteria for ${label}; do not assume subdivision is needed`,
				clarify_next_action: `clarify the concrete next action for ${label}; do not treat uncertainty as excessive size`,
			}[granularity.choice]!;
			add(task, granularity.choice, instruction, anchor);
			continue;
		}
		// A known blocker contradicts readiness. Uncertainty about subdivision
		// does not invalidate independently evidenced execution authorization.
		if (strong(granularity) && granularity.choice === "blocked") continue;
		if (life.choice !== "actionable_now" || !ready || !anchor || !warrantAllows) continue;
		if (opts.terminalStop) {
			add(task, "continue", task.status === "pending" ? `set ${label} in_progress and CONTINUE its authorized next action` : `CONTINUE the authorized next action for ${label}`, anchor, false, true);
		} else if ((alignment === "not_aligned" || alignment === "no_in_progress_task") && matched === String(task.id)) {
			if (strong(answers.drift) && answers.drift.choice === "drifted")
				add(task, "return", `STOP the evidenced off-plan activity and return to the authorized next action for ${label}`, workSource!, false, true);
			else if (task.status === "pending") add(task, "claim", `set ${label} in_progress with an accurate activeForm`, anchor, false, true);
		}
	}
	if (!opts.terminalStop && ready && warrantAllows && matched === NOT_ON_BOARD &&
		(alignment === "not_aligned" || alignment === "no_in_progress_task")) {
		add(undefined, "create", "create and claim a task for the evidenced authorized current work; do not invent follow-ups", workSource!, false, true);
	}
	const trigger = opts.terminalStop ? "terminal-stop" : `@ loop ${loop}`;
	if (corrections.length) {
		const mayWake = corrections.some((c) => c.bookkeeping || c.execution);
		if (opts.terminalStop && !mayWake) return { kind: "notify", text: "[jev audit] task-level planning advice available; no restart authorized by split/clarification alone" };
		const boardOnly = opts.terminalStop && !corrections.some((c) => c.execution);
		return { kind: "inject", corrections, mayWake, text: [
			`[jev audit ${trigger}] Evidence-grounded board reconciliation.`,
			boardOnly ? "BOARD ONLY: reconcile the listed facts via todo, then return control to the user. This is NOT permission to execute tasks or bypass a wait." : "Reconcile only the following supported changes via the todo tool:",
			...corrections.map((c, i) => `${i + 1}. ${c.text}`),
			...(uncertain.length ? [`(not touched: ${uncertain.map((id) => `#${id}`).join(", ")} — evidence uncertain)`] : []),
		].join("\n") };
	}
	if (suppressed || ((warrant === "idle" || warrant === "trivial") && !inProgressTasks(board).length)) return { kind: "silent" };
	if (uncertain.length) return { kind: "notify", text: `[jev audit] insufficient evidence for ${uncertain.map((id) => `#${id}`).join(", ")} — no correction` };
	return { kind: "silent" };
}
