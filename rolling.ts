/**
 * Rolling review: already processed input is represented by remembered
 * conclusions, not resent raw. Three parts stay distinct in each stage:
 *   - reported work: current task records (supplements) plus user decisions,
 *     the latest host summary and the latest main-agent report, as authored;
 *   - JEV opinions: the latest validated answers (derived, revisable);
 *   - processing progress: the reviewed frontier and whether this is the final piece.
 * Every stage goes through the uniform evaluation cache. On an explicit context
 * overflow the unresolved work is subdivided with structural progress: first the
 * dominant dimension (context records → ordered text fragments, or independent
 * question batches over the same frozen state), then stop with a diagnostic.
 */
import type { BoardSnapshot } from "./board.js";
import { safeJson, type AuditContext, type EvidenceRecord } from "./context.js";
import { buildAuditRequest, evaluate, evaluateBatched, evaluationKey, flattenAnswers, groupAnswers, type AuditResult, type ChoiceAnswer, type EvaluateOptions, type Reuse, type TerminalStopInfo } from "./typesafe.js";

/** Cumulative result of the latest completed stage (replaces, never accumulates). */
export interface Rolling {
	through?: string; inputKey: string; opinions: Record<string, ChoiceAnswer>; answerKeys: string[];
	/** Processed entries that could only be reviewed in fragments: never retained whole (that would recreate the overflow). */
	oversized?: string[];
}
/** A retained main-agent report larger than this is not repeated; the leader asks for a concise account instead. */
export const REPORT_RETAIN_CHARS = 4000;
/** A text record is fragmented only while each half stays at least this long (finite, progress-making). */
export const FRAGMENT_MIN_CHARS = 1000;

/** Source entry of a projected record (tool calls are `<entry>:call:<id>`). */
export const entryOf = (r: EvidenceRecord) => (r.fragment?.of ?? r.id).split(":call:")[0];

/** Entry ids on the active branch up to and including `through`; undefined when `through` is not on this branch. */
export function processedEntries(branch: Iterable<unknown>, through?: string): Set<string> | undefined {
	const out = new Set<string>();
	if (!through) return out;
	for (const raw of branch) {
		const id = (raw as { id?: unknown })?.id;
		if (typeof id !== "string") continue;
		out.add(id);
		if (id === through) return out;
	}
	return undefined;
}

/** Reported work carried forward from processed records, each replaced by newer material. */
function retainedFrom(processed: EvidenceRecord[], oversized: ReadonlySet<string>): { records: EvidenceRecord[]; note?: string } {
	const users = processed.filter((r) => r.kind === "user");
	const summary = processed.filter((r) => r.kind === "summary").at(-1);
	// The most recent reports are kept (newest facts fit first); a short reply like "Acknowledged."
	// must not silently replace a still-applicable earlier report.
	const reports = processed.filter((r) => r.kind === "assistant" && !r.advice);
	// A record that needed fragmenting is never repeated whole: that would recreate the overflow on every later
	// audit; its reviewed content lives in the stored opinions. User decisions and summaries are always kept.
	const fragmented = (r?: EvidenceRecord) => !!r && (!!r.fragment || oversized.has(entryOf(r)));
	const keptReports = new Set<EvidenceRecord>();
	// Budget the serialized record (metadata included), not only its text — tiny reports still cost envelope bytes.
	const serial = (r: EvidenceRecord) => safeJson({ ...r, view: "global", selection: "retained from processed range" }).length;
	let budget = REPORT_RETAIN_CHARS;
	let omittedCount = 0;
	for (const r of [...reports].reverse()) {
		if (fragmented(r)) continue;
		const cost = serial(r);
		if (cost > budget) { omittedCount++; continue; }
		budget -= cost;
		keptReports.add(r);
	}
	const keep = new Set([...users, summary, ...keptReports].filter((r): r is EvidenceRecord => !!r && !fragmented(r)));
	const latest = reports.at(-1);
	const droppedReport = !!latest && !keptReports.has(latest);
	const notes = [
		...(droppedReport ? [latest.text.length > REPORT_RETAIN_CHARS
			? `latest main-agent report ${latest.id} exceeds the compact size and is not repeated; ask the main agent for a concise current account if its facts are needed`
			: fragmented(latest)
				? `latest main-agent report ${latest.id} could only be reviewed in fragments and is not repeated whole; its reviewed content is reflected in the opinions`
				: `latest main-agent report ${latest.id} does not fit the compact report budget and is not repeated`] : []),
		...(omittedCount ? [`${omittedCount} older main-agent report${omittedCount > 1 ? "s" : ""} omitted by the compact report budget; their reviewed content is reflected in the opinions`] : []),
		...[...users, summary].filter(fragmented).map((r) => `${r!.kind} ${r!.id} could only be reviewed in fragments and is not repeated whole; its reviewed content is reflected in the opinions`),
	];
	return {
		records: processed.filter((r) => keep.has(r)).map((r) => ({ ...r, view: "global" as const, selection: "retained from processed range" })),
		note: notes.length ? notes.join("; ") : undefined,
	};
}

/** Ordered halves of a piece: whole records first; a single long text record becomes labelled fragments. */
export function splitPiece(piece: EvidenceRecord[]): [EvidenceRecord[], EvidenceRecord[]] | undefined {
	if (piece.length > 1) { const mid = Math.ceil(piece.length / 2); return [piece.slice(0, mid), piece.slice(mid)]; }
	const r = piece[0];
	if (!r || r.text.length < 2 * FRAGMENT_MIN_CHARS) return undefined;
	const f = r.fragment ?? { of: r.id, start: 0, end: r.text.length, total: r.text.length };
	let mid = Math.floor(r.text.length / 2);
	if (/[\uDC00-\uDFFF]/.test(r.text[mid])) mid++; // never split a surrogate pair
	const part = (start: number, end: number): EvidenceRecord => ({
		...r, id: `${f.of}#${f.start + start}-${f.start + end}`, text: r.text.slice(start, end),
		fragment: { of: f.of, start: f.start + start, end: f.start + end, total: f.total },
		selection: `ordered fragment ${f.start + start}-${f.start + end} of ${f.total} chars of ${f.of}`,
	});
	return [[part(0, mid)], [part(mid, r.text.length)]];
}

export interface RollingOutcome {
	result: AuditResult;
	context: AuditContext;
	reuse: Reuse;
	/** All pieces were processed; only then may the result become current advice. */
	final: boolean;
	/** The final piece's required questions were all answered (or nothing was unprocessed). */
	complete: boolean;
	/** Provider requests were avoided entirely because nothing new needed review. */
	unchanged: boolean;
	/** At least one overflow was met and the review still completed through subdivision. */
	recovered: boolean;
}

export interface RollingArgs {
	board: BoardSnapshot;
	context: AuditContext;
	processed: Set<string>;
	rolling?: Rolling;
	inputKey: string;
	model: string;
	opts: EvaluateOptions;
	stop?: TerminalStopInfo;
	/** Ordered pieces of the unprocessed records; default is one piece. */
	pieces?: (unprocessed: EvidenceRecord[]) => EvidenceRecord[][];
	/** Durably record a cumulative receipt; false means it is not durable and must not advance progress. */
	commit: (rolling: Rolling) => boolean;
}

const IRREDUCIBLE = "context overflow: the required state for this scope cannot fit even as one record/fragment and one question; completed parts are kept — ask the main agent for a concise current report of this task";

export async function reviewRolling(a: RollingArgs): Promise<RollingOutcome> {
	const supplements = a.context.records.filter((r) => r.kind === "supplement");
	const history = a.context.records.filter((r) => r.kind !== "supplement");
	let processed = history.filter((r) => a.processed.has(entryOf(r)));
	const unprocessed = history.filter((r) => !a.processed.has(entryOf(r)));
	let rolling = a.rolling;
	const oversized = new Set(a.rolling?.oversized ?? []);
	const stageContext = (piece: EvidenceRecord[], final: boolean): AuditContext => {
		const retained = retainedFrom(processed, oversized);
		return {
			...a.context,
			// Gaps inside already processed ranges were reviewed with them; only current gaps are resent.
			omissions: a.context.omissions.filter((o) => !a.processed.has(o.id.split(":call:")[0])),
			records: [...retained.records, ...piece.map((r) => ({ ...r, view: "recent" as const })), ...supplements],
			rolling: {
				opinions: rolling?.opinions ?? {},
				...(retained.note ? { reportNote: retained.note } : {}),
				progress: { processedThrough: rolling?.through ?? null, final },
			},
		};
	};
	const total: Reuse = { hits: 0, joined: 0, sent: 0 };
	const add = (r: Reuse) => { total.hits += r.hits; total.joined += r.joined; total.sent += r.sent; };
	if (!unprocessed.length && rolling && rolling.inputKey === a.inputKey) {
		return { result: { ok: true, answers: groupAnswers(rolling.opinions) }, context: stageContext([], true), reuse: total, final: true, complete: true, unchanged: true, recovered: false };
	}
	let recovered = false;
	// A real rejection anywhere (including inside question batches) makes a completed review a recovery.
	const opts: EvaluateOptions = { ...a.opts, onAttempt: (x) => { if (x.outcome === "overflow") recovered = true; a.opts.onAttempt?.(x); } };
	let last: { result: AuditResult; context: AuditContext; complete?: boolean } | undefined;

	/** Evaluate one leaf stage; on overflow subdivide the dominant dimension. Returns false to stop the run. */
	const stage = async (piece: EvidenceRecord[], final: boolean): Promise<boolean> => {
		const context = stageContext(piece, final);
		const req = buildAuditRequest(a.board, context, a.model, a.stop);
		const halves = splitPiece(piece);
		// With no context left to divide, a prediction never ends the scope: single questions are sent for admission.
		const stageOpts = halves ? opts : { ...opts, sendIrreducible: true };
		let { result, reuse } = await evaluate(req, stageOpts);
		add(reuse);
		if (!result.ok && result.contextOverflow && !a.opts.signal?.aborted) {
			if (!result.predicted) recovered = true;
			const stateBytes = Buffer.byteLength(req.state), questionBytes = Buffer.byteLength(JSON.stringify(req.questions));
			// Question batches share this frozen state: useful only when questions dominate or context cannot shrink.
			if (questionBytes > stateBytes || !halves) {
				({ result, reuse } = await evaluateBatched(req, stageOpts)); add(reuse);
			}
			if (!result.ok && result.contextOverflow && halves && !a.opts.signal?.aborted) {
				return await stage(halves[0], false) && await stage(halves[1], final);
			}
			if (!result.ok && result.contextOverflow) result = { ok: false, error: IRREDUCIBLE, contextOverflow: true };
		}
		last = { result, context, complete: true };
		if (!result.ok) { last.complete = false; return false; }
		const flat = flattenAnswers(result.answers);
		if (!Object.keys(req.questions).every((q) => flat[q])) {
			// Keep valid answers (already cached); do not advance, and never turn an intermediate stage into advice.
			// The result stays ok: missing answers only make the stage incomplete (the verdict already fails
			// closed per missing answer), not a provider failure.
			last.complete = false;
			return final;
		}
		// A non-final fragment is covered only once its record's last fragment is reviewed; its answers stay cached meanwhile.
		const done = piece.filter((r) => !r.fragment || r.fragment.end === r.fragment.total);
		const next: Rolling = {
			through: done.length ? entryOf(done.at(-1)!) : rolling?.through,
			inputKey: final ? a.inputKey : `${a.inputKey}:partial`,
			opinions: flat,
			answerKeys: Object.keys(req.questions).map((q) => evaluationKey(req, q, a.opts.apiUrl)),
		};
		for (const r of done) if (r.fragment) oversized.add(r.fragment.of);
		if (oversized.size) next.oversized = [...oversized];
		processed = [...processed, ...done.map((r) => r.fragment ? { ...history.find((h) => h.id === r.fragment!.of)!, fragment: r.fragment } : r)];
		// Within this run the next piece builds on this result; only a durable receipt advances stored progress.
		// Mid-record fragments are not receipts: resuming then rebuilds identical fragment stages, which hit the cache.
		if (!done.length && piece.length) rolling = { ...next, through: rolling?.through };
		else if (a.commit(next)) rolling = next;
		else rolling = { ...next, through: rolling?.through, inputKey: "not-durable" };
		return true;
	};

	const pieces = unprocessed.length ? (a.pieces?.(unprocessed) ?? [unprocessed]) : [[]];
	for (const [i, piece] of pieces.entries()) {
		if (!await stage(piece, i === pieces.length - 1)) {
			return { ...last!, reuse: total, final: false, complete: false, unchanged: false, recovered: false };
		}
	}
	return { result: last!.result, context: last!.context, reuse: total, final: true, complete: last!.complete !== false, unchanged: false, recovered };
}
