/**
 * Per-task and per-session judgment state (design D2) with loop cursors (D3).
 * Persisted as this extension's own non-context ledger entries on the session
 * branch; rebuilt from the active branch only. Every field is a finite answer
 * or a source id into the branch — never free text from a model.
 */
import { object } from "./context.js";

export type LifecycleStatus = "still_ongoing" | "actionable_now" | "completion_reported" | "cancelled" | "deliberately_deferred" | "blocked" | "future" | "unclear";
export type GranularityVerdict = "appropriate" | "split_independent_outcomes" | "split_verifiable_checkpoints" | "clarify_done_criteria" | "clarify_next_action" | "blocked" | "insufficient_evidence";
export type InteractionState = "working" | "waiting_user" | "waiting_external" | "idle" | "unclear";

export interface TaskState {
	status: LifecycleStatus;
	/** Source-selected partial-progress reports, including what remains open.
	 * Reload exact public text by id; no generated item labels or inferred checklist.
	 */
	progressReports: { sourceId: string }[];
	blocker?: { sourceId: string };
	deferral?: { sourceId: string };
	/** Main-agent completion report; never independently verified by the audit. */
	completionReport?: { sourceId: string; verified: false };
	/** Source id supporting a specific conclusion (`status`, `granularity`, `blocker`, ...). */
	anchors: Record<string, string>;
	granularity?: { last: GranularityVerdict };
	boardCheck?: { last: "accurate" | "needs_reconciliation" | "unclear"; snapshotHash: string; scopeHash?: string };
	/** Last loop id judged with a non-uncertain answer for this task. */
	cursor?: string;
	/** Earliest loop still answered uncertain; the next segment starts here. */
	open?: string;
	/** Loop id at which the task first became in_progress (reset target). */
	firstActive?: string;
}

export interface SessionState {
	interaction: { state: InteractionState; waitingFor?: string; anchor?: string };
	currentWork: { target: "none" | "off_board" | number; anchor?: string };
	authorizedScope: { anchor?: string };
	boardWarrant?: { last: "warranted" | "trivial" | "idle"; activity?: string };
	/** Last confident drift finding for the current work object. */
	lastDrift?: "on_track" | "drifted" | "blocked";
	cursor?: string;
	open?: string;
}

export interface JudgmentState {
	version: 3;
	/** Native acceptance policy used for this snapshot (LLM compatibility scores are not probabilities). */
	minConfidence?: number;
	/** Backend/model identity the state was last judged by. */
	model?: string;
	tasks: Record<string, TaskState>;
	session: SessionState;
}

export const STATE_TYPE = "jev-todo-audit-state";

export const emptyTask = (): TaskState => ({ status: "unclear", progressReports: [], anchors: {} });
export const emptyState = (): JudgmentState => ({ version: 3, tasks: {}, session: {
	interaction: { state: "unclear" }, currentWork: { target: "none" }, authorizedScope: {} } });

const str = (v: unknown): string | undefined => typeof v === "string" && v.length ? v : undefined;
const LIFECYCLE = new Set<string>(["still_ongoing", "actionable_now", "completion_reported", "cancelled", "deliberately_deferred", "blocked", "future", "unclear"]);
const GRANULARITY = new Set<string>(["appropriate", "split_independent_outcomes", "split_verifiable_checkpoints", "clarify_done_criteria", "clarify_next_action", "blocked", "insufficient_evidence"]);
const INTERACTION = new Set<string>(["working", "waiting_user", "waiting_external", "idle", "unclear"]);

function copyTask(raw: unknown, loopIds: ReadonlySet<string>): TaskState | undefined {
	const t = object(raw);
	// Reject the whole derived scope when any dependency disappeared. Keeping
	// a verdict while merely dropping its missing anchor invents provenance.
	if (!scopePresent(t, loopIds)) return undefined;
	if (!LIFECYCLE.has(t.status)) return undefined;
	const id = (v: unknown) => { const s = str(v); return s !== undefined && loopIds.has(s.split(":call:")[0]) ? s : undefined; };
	const out: TaskState = { status: t.status, progressReports: [], anchors: {} };
	for (const p of Array.isArray(t.progressReports) ? t.progressReports : []) {
		const sourceId = id(object(p).sourceId);
		if (sourceId) out.progressReports.push({ sourceId });
	}
	for (const key of ["blocker", "deferral"] as const) { const s = id(object(t[key]).sourceId); if (s) out[key] = { sourceId: s }; }
	{ const s = id(object(t.completionReport).sourceId); if (s) out.completionReport = { sourceId: s, verified: false }; }
	for (const [k, v] of Object.entries(object(t.anchors))) { const s = id(v); if (s) out.anchors[k] = s; }
	if (GRANULARITY.has(object(t.granularity).last)) out.granularity = { last: object(t.granularity).last };
	{ const b = object(t.boardCheck); if (["accurate", "needs_reconciliation", "unclear"].includes(b.last) && str(b.snapshotHash)) out.boardCheck = { last: b.last, snapshotHash: b.snapshotHash, ...(str(b.scopeHash) ? { scopeHash: b.scopeHash } : {}) }; }
	for (const key of ["cursor", "open", "firstActive"] as const) { const s = id(t[key]); if (s) out[key] = s; }
	return out;
}

function copySession(raw: unknown, loopIds: ReadonlySet<string>): SessionState {
	const s = object(raw), base = emptyState().session;
	const id = (v: unknown) => { const x = str(v); return x !== undefined && loopIds.has(x.split(":call:")[0]) ? x : undefined; };
	const interaction = object(s.interaction);
	if (INTERACTION.has(interaction.state)) base.interaction = { state: interaction.state, ...(str(interaction.waitingFor) ? { waitingFor: interaction.waitingFor } : {}), ...(id(interaction.anchor) ? { anchor: interaction.anchor } : {}) };
	const work = object(s.currentWork);
	if (work.target === "none" || work.target === "off_board" || (typeof work.target === "number" && Number.isInteger(work.target)))
		base.currentWork = { target: work.target, ...(id(work.anchor) ? { anchor: work.anchor } : {}) };
	if (id(object(s.authorizedScope).anchor)) base.authorizedScope = { anchor: object(s.authorizedScope).anchor };
	const warrant = object(s.boardWarrant);
	if (["warranted", "trivial", "idle"].includes(warrant.last)) base.boardWarrant = { last: warrant.last, ...(str(warrant.activity) ? { activity: warrant.activity } : {}) };
	if (["on_track", "drifted", "blocked"].includes(s.lastDrift)) base.lastDrift = s.lastDrift;
	for (const key of ["cursor", "open"] as const) { const x = id(s[key]); if (x) base[key] = x; }
	return base;
}

/** Every cursor and supporting source in a scope must still be on the branch. */
function scopePresent(raw: unknown, ids: ReadonlySet<string>): boolean {
	const s = object(raw);
	const refs = [s.cursor, s.open, s.firstActive, ...Object.values(object(s.anchors)),
		...['blocker', 'deferral', 'completionReport'].map((key) => object(s[key]).sourceId),
		...['interaction', 'currentWork', 'authorizedScope'].map((key) => object(s[key]).anchor),
		...(Array.isArray(s.progressReports) ? s.progressReports.map((p) => object(p).sourceId) : [])];
	return refs.every((id) => id === undefined || (typeof id === "string" && ids.has(id.split(":call:")[0])));
}

/**
 * Rebuild the latest state from the active branch. `loopIds` are the entry ids
 * present on the branch: cursors/anchors referring to absent ids are dropped
 * (branch switch reconciliation, D3). Later entries replace earlier ones.
 */
export function restoreState(branch: Iterable<unknown>, loopIds: ReadonlySet<string>): JudgmentState {
	let latest = emptyState();
	for (const raw of branch) {
		const e = object(raw);
		if (e.type !== "custom" || e.customType !== STATE_TYPE) continue;
		const d = object(e.data);
		if (d.version !== 3) continue;
		const next = emptyState();
		next.model = str(d.model);
		if (typeof d.minConfidence === "number" && Number.isFinite(d.minConfidence)) next.minConfidence = d.minConfidence;
		for (const [taskId, task] of Object.entries(object(d.tasks))) {
			const copied = copyTask(task, loopIds);
			if (copied) next.tasks[taskId] = copied;
			else if (latest.tasks[taskId]) next.tasks[taskId] = latest.tasks[taskId];
		}
		next.session = scopePresent(d.session, loopIds) ? copySession(d.session, loopIds) : latest.session;
		latest = next;
	}
	return latest;
}

/** Append one state snapshot; false means not durable. */
export function writeState(append: ((type: string, data: JudgmentState) => void) | undefined, state: JudgmentState): boolean {
	if (!append) return false;
	try { append(STATE_TYPE, structuredClone(state)); return true; } catch { return false; }
}

/** Own state entries are bookkeeping, never evidence. */
export const isStateEntry = (raw: unknown) => { const e = object(raw); return e.type === "custom" && e.customType === STATE_TYPE; };

// ---------------------------------------------------------------------------
// Cursor rules (D3)
// ---------------------------------------------------------------------------

/** Where the next segment for a scope starts: the open loop if any, else after the cursor. */
export function scopeStart(scope: { cursor?: string; open?: string }): { afterCursor?: string; from?: string } {
	return scope.open ? { from: scope.open } : { afterCursor: scope.cursor };
}

/** Advance after a non-uncertain, durably recorded segment. */
export function advance<T extends { cursor?: string; open?: string }>(scope: T, lastLoopId: string): T {
	return { ...scope, cursor: lastLoopId, open: undefined };
}

/** Keep the segment open after an uncertain answer; the cursor does not move. */
export function holdOpen<T extends { cursor?: string; open?: string }>(scope: T, firstLoopId: string): T {
	return { ...scope, open: scope.open ?? firstLoopId };
}

/**
 * Task scope changed or reopened (D3): keep only identity, re-judge from its
 * first-active loop. When first-active is unknown, re-judge from `from`
 * (the current segment or the earliest known loop), never from nothing.
 */
export function resetTask(task: TaskState | undefined, from?: string): TaskState {
	return { ...emptyTask(), firstActive: task?.firstActive, cursor: undefined, open: task?.firstActive ?? from };
}

/**
 * Judgment model identity changed (D3): stored findings stay as reference and
 * cursors stay in place, so only loops after each cursor are judged by the new
 * model. Nothing before a cursor is replayed unless the user asks for full mode.
 * No state mutation is needed; the rule is pinned by tests.
 */

/** Permission withdrawn: void the session anchors, keep cursors. */
export function withdrawPermission(session: SessionState): SessionState {
	return { ...session, interaction: { state: "waiting_user" }, authorizedScope: {}, currentWork: { ...session.currentWork, anchor: undefined } };
}
