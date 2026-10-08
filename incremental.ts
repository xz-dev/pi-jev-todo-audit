/**
 * Incremental audit run (design D4/D5): load judgment state, build complete-
 * loop segments per scope within the service-disclosed capacity, judge each
 * segment with one stateless service call, apply transitions, persist state
 * and advance cursors. No history before a cursor is re-sent; a scope held
 * open restarts from its open loop next time.
 */
import type { BoardSnapshot } from "./board.js";
import { unfinishedTasks } from "./board.js";
import type { AuditContext, EvidenceRecord } from "./context.js";
import type { CapacityDisclosure, JudgeResult, JudgmentService } from "./judgment-client.js";
import { groupLoops, loopsAfter, MAX_CHOICES, packLoops, type Loop, type PackLimits } from "./loops.js";
import { buildChangeRequest, taskScopeHash, type Question } from "./questions.js";
import { resetTask, scopeStart, type JudgmentState } from "./state.js";
import { applyAnswers, type Answer } from "./transitions.js";
import type { TerminalStopInfo } from "./typesafe.js";

export interface SegmentReport {
	scopes: string[];
	loops: string[];
	outcome: "advanced" | "partial" | "open" | "failed" | "oversize" | "unchanged";
	error?: string;
	contextOverflow?: boolean;
	reuse?: { hits: number; joined: number; sent: number };
	usage?: { input?: number; output?: number };
	model?: string;
}

export interface IncrementalOutcome {
	state: JudgmentState;
	reports: SegmentReport[];
	/** Every asked scope reached the branch tip with a non-uncertain answer. */
	complete: boolean;
	/** The latest loop id on the branch (what "current" means for the verdict). */
	tip?: string;
	/** Capacity the service disclosed (or undefined when it could not). */
	capacity?: CapacityDisclosure;
	persistenceFailed: boolean;
	missingCapacityMetadata: boolean;
}

const utf8 = (text: string) => Buffer.byteLength(text, "utf8");

/** Release the audit slot on cancellation even when a service ignores its signal. */
async function untilAbort<T>(work: Promise<T>, signal: AbortSignal): Promise<T | undefined> {
	let onAbort = () => {};
	const aborted = new Promise<undefined>((resolve) => { onAbort = () => resolve(undefined); });
	signal.addEventListener("abort", onAbort, { once: true });
	if (signal.aborted) onAbort();
	try { return await Promise.race([work, aborted]); }
	finally { signal.removeEventListener("abort", onAbort); }
}

/** Persist one state snapshot; returns false when the write is not acknowledged or the audit is no longer current. */
export type Persist = (state: JudgmentState) => boolean;

export async function runIncremental(a: {
	service: JudgmentService; board: BoardSnapshot; context: AuditContext; state: JudgmentState;
	/** Active-branch originals for anchor reload and continuation across Pi compaction. Never a different branch. */
	branchHistory?: EvidenceRecord[];
	timeoutMs?: number; signal: AbortSignal; secrets?: readonly string[]; stop?: TerminalStopInfo;
	minConfidence?: number; isCurrent?: () => boolean;
	persist: Persist; fallbackLoops?: number; outputReserve?: number; maxSegmentsPerRun?: number;
	/** Reset listed tasks to re-judge from first-active (explicit full mode). */
	full?: boolean;
}): Promise<IncrementalOutcome> {
	let state = a.state;
	const effective = a.context.records.filter((r) => r.kind !== "supplement");
	const archived = a.branchHistory?.filter((r) => r.kind !== "supplement");
	const byId = new Map<string, EvidenceRecord>([...(archived ?? []), ...effective].map((r) => [r.id, r]));
	let history = effective;
	const effectiveLoops = new Set(groupLoops(effective).map((l) => l.id));
	const boundaries = [state.session, ...Object.values(state.tasks)].flatMap((s) => s.open ? [s.open] : s.cursor ? [s.cursor] : []);
	if (archived && boundaries.some((id) => !effectiveLoops.has(id))) {
		const starts = [...boundaries, effective[0]?.id].flatMap((id) => {
			const index = archived.findIndex((r) => r.id === id || r.id.startsWith(`${id}:call:`));
			return index < 0 ? [] : [index];
		});
		// Do not resurrect the whole pre-compaction history. Only retain enough
		// original loops to locate the stored cursor and continue after it.
		if (starts.length) history = archived.slice(Math.min(...starts));
	}
	if (a.full && archived) history = archived;
	const loops = groupLoops(history);
	const tip = loopsAfter(loops, undefined).at(-1)?.id;
	// Task contract changed without a new history record: same reset rule as
	// an evidenced scope change (first-active, else the earliest known loop).
	for (const task of unfinishedTasks(a.board)) {
		const previous = state.tasks[String(task.id)];
		if (previous?.boardCheck?.scopeHash && previous.boardCheck.scopeHash !== taskScopeHash(task)) {
			state = { ...state, tasks: { ...state.tasks, [String(task.id)]: resetTask(previous, loops[0]?.id) } };
		}
	}
	const current = () => !a.signal.aborted && (a.isCurrent?.() ?? true);
	const reports: SegmentReport[] = [];
	let persistenceFailed = false;

	// Capacity: ask the service once per run; absence is surfaced, never guessed.
	let capacity: CapacityDisclosure | undefined;
	if (current() && a.service.capacityVersion === 1 && typeof a.service.describeSelection === "function") {
		const d = await untilAbort(a.service.describeSelection({ signal: a.signal, path: "judge" }), a.signal);
		if (d && !("error" in d)) capacity = d;
	}
	const limits: PackLimits = {
		stateAndLongestQuestion: capacity?.limits.stateAndLongestQuestion, request: capacity?.limits.request, contextWindow: capacity?.limits.contextWindow,
		tokensPerByte: capacity?.tokensPerByte ?? 1 / 1.75, envelopeOverheadBytes: capacity?.envelopeOverheadBytes ?? 2048, outputReserve: a.outputReserve ?? 1024,
	};
	const missingCapacityMetadata = !capacity || (capacity.limits.request === undefined && capacity.limits.stateAndLongestQuestion === undefined && capacity.limits.contextWindow === undefined);

	if (a.full) {
		for (const t of unfinishedTasks(a.board)) {
			const prev = state.tasks[String(t.id)];
			state = { ...state, tasks: { ...state.tasks, [String(t.id)]: resetTask(prev, loops[0]?.id) } };
		}
		state = { ...state, session: { interaction: { state: "unclear" }, currentWork: { target: "none" }, authorizedScope: {}, open: loops[0]?.id } };
		// Invalidate durably BEFORE sending: a failed full run must not resurrect
		// the old verdict on reload or on the next ordinary audit.
		if (!current() || !a.persist(state)) return { state: a.state, reports, complete: false, tip, capacity, persistenceFailed: current(), missingCapacityMetadata };
	}

	const filterAnswers = (result: JudgeResult, questions: Record<string, Question>): Record<string, Answer | undefined> =>
		Object.fromEntries(Object.entries(result.answers).map(([k, v]) => [k,
			v.type === "choice" && questions[k] && Object.hasOwn(questions[k].criteria, v.choice) &&
			(result.backend === "llm" || (Number.isFinite(v.confidence) && v.confidence >= (a.minConfidence ?? 0) && v.confidence <= 1))
				? { choice: v.choice } : undefined]));
	const taskIds = unfinishedTasks(a.board).map((t) => t.id);
	const anchorsFor = (st: JudgmentState, ids: number[]) => {
		const anchors = new Map<string, EvidenceRecord>();
		const add = (id?: string) => { if (id && byId.has(id)) anchors.set(id, byId.get(id)!); };
		for (const id of ids) { const t = st.tasks[String(id)]; if (!t) continue; for (const v of Object.values(t.anchors)) add(v); for (const p of t.progressReports) add(p.sourceId); add(t.blocker?.sourceId); add(t.deferral?.sourceId); add(t.completionReport?.sourceId); }
		add(st.session.interaction.anchor); add(st.session.currentWork.anchor); add(st.session.authorizedScope.anchor);
		return anchors;
	};
	/** Loops a scope still needs, honoring its open loop. */
	const pendingFor = (scope: { cursor?: string; open?: string }): Loop[] => {
		const start = scopeStart(scope);
		if (start.from !== undefined) { const at = loops.findIndex((l) => l.id === start.from); return at < 0 ? [] : loopsAfter(loops, at === 0 ? undefined : loops[at - 1].id); }
		return loopsAfter(loops, start.afterCursor);
	};

	const maxSegments = a.maxSegmentsPerRun ?? 32;
	let segments = 0;
	/** Scopes held open at a loop during this run: re-asking them without new input would loop. */
	const heldOpen = new Set<string>();
	// Iterate: each round groups scopes by the next loop they need, judges one segment, repeats until the tip.
	while (segments < maxSegments && current()) {
		const needs = new Map<string, { kind: "task"; id: number } | { kind: "session" }>();
		let firstLoop: Loop | undefined;
		for (const id of taskIds) {
			if (heldOpen.has(`task:${id}`)) continue;
			const pend = pendingFor(state.tasks[String(id)] ?? {});
			if (!pend.length) continue;
			if (!firstLoop || pend[0].index < firstLoop.index) firstLoop = pend[0];
			needs.set(`task:${id}`, { kind: "task", id });
		}
		if (!heldOpen.has("session")) {
			const pend = pendingFor(state.session);
			if (pend.length) { if (!firstLoop || pend[0].index < firstLoop.index) firstLoop = pend[0]; needs.set("session", { kind: "session" }); }
		}
		if (!firstLoop) break;
		// Scopes that start at the earliest loop are judged together; the others wait for their turn.
		const scoped = [...needs.entries()].filter(([, s]) => {
			const scope = s.kind === "task" ? state.tasks[String(s.id)] ?? {} : state.session;
			return pendingFor(scope)[0]?.id === firstLoop!.id;
		});
		const askTasks = scoped.flatMap(([, s]) => s.kind === "task" ? [s.id] : []);
		const askSession = scoped.some(([, s]) => s.kind === "session");
		const available = loopsAfter(loops, firstLoop.index === 0 ? undefined : loops[firstLoop.index - 1].id);
		const anchors = anchorsFor(state, askTasks);
		// Fixed bytes: request with zero loops.
		const fixed = buildChangeRequest({ board: a.board, state, segment: [], anchors, taskIds: askTasks, session: askSession, terminalStop: a.stop, secrets: a.secrets });
		const fixedBytes = utf8(fixed.state) + utf8(JSON.stringify(fixed.questions));
		const measure = (segment: Loop[]) => {
			const req = buildChangeRequest({ board: a.board, state, segment, anchors, taskIds: askTasks, session: askSession, terminalStop: a.stop, secrets: a.secrets });
			const stateBytes = utf8(JSON.stringify({ audit: req.state }));
			return { request: utf8(JSON.stringify({ state: { audit: req.state }, questions: req.questions })),
				stateAndLongestQuestion: stateBytes + Math.max(0, ...Object.entries(req.questions).map(([key, q]) => utf8(JSON.stringify({ [key]: q })))),
				choices: Math.max(0, ...Object.values(req.questions).map((q) => Object.keys(q.criteria).length)) };
		};
		let packed = packLoops(available, fixedBytes, limits, a.fallbackLoops ?? 8, measure);
		const scopeKeys = scoped.map(([k]) => k);
		// Estimates choose segments; only actual admission can declare a loop
		// irreducible. Try a predicted single-loop overflow once, without slicing.
		if (packed.oversize && packed.tooManyChoices) {
			// A single complete loop with more than MAX_CHOICES sources cannot be asked
			// without slicing it. Fail closed for these scopes; the cursor does not move.
			reports.push({ scopes: scopeKeys, loops: [packed.oversize.id], outcome: "oversize", error: `one loop carries more than ${MAX_CHOICES} candidate sources`, reuse: { hits: 0, joined: 0, sent: 0 }, model: capacity?.model ?? "" });
			return { state, reports, complete: false, tip, capacity, persistenceFailed, missingCapacityMetadata };
		}
		if (packed.oversize) packed = { ...packed, loops: [packed.oversize] };
		let judged = false;
		// Overflow recovery: drop trailing whole loops and retry; never slice a loop.
		while (packed.loops.length && segments < maxSegments && current()) {
			const req = buildChangeRequest({ board: a.board, state, segment: packed.loops, anchors, taskIds: askTasks, session: askSession, terminalStop: a.stop, secrets: a.secrets });
			const result = await untilAbort(a.service.judge({ state: { audit: req.state }, questions: req.questions }, { ...(a.timeoutMs !== undefined ? { timeoutMs: a.timeoutMs } : {}), signal: a.signal, minConfidence: a.minConfidence }), a.signal);
			if (!result || !current()) return { state, reports, complete: false, tip, capacity, persistenceFailed, missingCapacityMetadata };
			const loopIds = packed.loops.map((l) => l.id);
			segments++;
			if (result.stopReason !== "stop") {
				if (result.contextOverflow && packed.loops.length > 1) {
					reports.push({ scopes: scopeKeys, loops: loopIds, outcome: "partial", contextOverflow: true, reuse: result.reuse, model: result.model });
					packed = { ...packed, loops: packed.loops.slice(0, -1) }; continue;
				}
				reports.push({ scopes: scopeKeys, loops: loopIds, outcome: result.contextOverflow && packed.loops.length === 1 ? "oversize" : "failed", error: result.errorMessage, contextOverflow: result.contextOverflow, reuse: result.reuse, model: result.model });
				return { state, reports, complete: false, tip, capacity, persistenceFailed, missingCapacityMetadata };
			}
			const answers = filterAnswers(result, req.questions);
			// Drift depends on the newly selected user scope. A simultaneous drift
			// opinion cannot establish this dependency; rejudge ONLY drift against
			// that scope. Unrelated tasks can still persist if this call fails.
			if (askSession && answers.scope_update?.choice === "scope_updated") {
				delete answers.drift;
				const scopeId = answers.scope_evidence?.choice;
				const scopeSource = scopeId && req.sourceIds.includes(scopeId) ? byId.get(scopeId) : undefined;
				if (scopeSource?.kind === "user" && scopeSource.complete && current()) {
					const nextAnchors = new Map(anchors); nextAnchors.set(scopeSource.id, scopeSource);
					const scopedState = { ...state, session: { ...state.session, authorizedScope: { anchor: scopeSource.id } } };
					const scopedRequest = buildChangeRequest({ board: a.board, state: scopedState, segment: packed.loops, anchors: nextAnchors, taskIds: [], session: true, secrets: a.secrets });
					const questions = { drift: scopedRequest.questions.drift };
					const drift = await untilAbort(a.service.judge({ state: { audit: scopedRequest.state }, questions }, { ...(a.timeoutMs !== undefined ? { timeoutMs: a.timeoutMs } : {}), signal: a.signal, minConfidence: a.minConfidence }), a.signal);
					if (!drift || !current()) return { state, reports, complete: false, tip, capacity, persistenceFailed, missingCapacityMetadata };
					segments++;
					if (drift.stopReason === "stop" && drift.model === result.model && drift.backend === result.backend) answers.drift = filterAnswers(drift, questions).drift;
					reports.push({ scopes: ["session:drift"], loops: loopIds, outcome: answers.drift ? "advanced" : "failed", error: answers.drift ? undefined : drift.errorMessage ?? "dependent drift judgment unavailable", reuse: drift.reuse, model: drift.model,
						usage: drift.usage ? { input: drift.usage.input, output: drift.usage.output } : undefined });
				}
			}
			const applied = applyAnswers({ state, board: a.board, segment: packed.loops, answers, sourceIds: req.sourceIds, taskIds: askTasks, session: askSession,
				askedGranularity: new Set(askTasks.filter((id) => `task_granularity_${id}` in req.questions)), askedWarrant: "board_warranted" in req.questions, model: result.model });
			applied.state.minConfidence = a.minConfidence;
			// Persist before trusting: an unacknowledged write leaves the previous state and cursors in force.
			if (!current() || !a.persist(applied.state)) {
				persistenceFailed = true;
				reports.push({ scopes: scopeKeys, loops: loopIds, outcome: "failed", error: "state persistence failed", reuse: result.reuse, model: result.model });
				return { state, reports, complete: false, tip, capacity, persistenceFailed, missingCapacityMetadata };
			}
			state = applied.state;
			reports.push({ scopes: scopeKeys, loops: loopIds, reuse: result.reuse, model: result.model, usage: result.usage ? { input: result.usage.input, output: result.usage.output } : undefined,
				outcome: applied.unanswered.length ? "partial" : applied.open.length ? "open" : "advanced" });
			judged = true;
			// Open/unanswered scopes cannot progress this run without new input; advanced scopes continue after this segment.
			for (const key of [...applied.open, ...applied.unanswered]) heldOpen.add(key);
			break;
		}
		if (!judged) break;
	}
	const complete = taskIds.every((id) => { const t = state.tasks[String(id)]; return !!t && !t.open && t.cursor === tip; }) && !state.session.open && state.session.cursor === tip;
	return { state, reports, complete: current() && (tip === undefined || complete), tip, capacity, persistenceFailed, missingCapacityMetadata };
}
