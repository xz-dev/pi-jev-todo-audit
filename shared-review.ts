/** Business projection/receipt adapter. All dispatch, subdivision and reuse belong to the service. */
import type { BoardSnapshot } from "./board.js";
import { redact, type AuditContext, type EvidenceRecord } from "./context.js";
import type { ClassifierQuestion, JsonObject, ReviewEvidenceFrame, ReviewResult, ReviewService } from "./judgment-client.js";
import { entryOf, retainedFrom, type Rolling, type RollingOutcome } from "./rolling.js";
import { buildAuditRequest, groupAnswers, type ChoiceAnswer, type TerminalStopInfo, type WithheldChoice } from "./typesafe.js";

export async function reviewShared(a: {
	service: ReviewService; board: BoardSnapshot; context: AuditContext; inputKey: string;
	rolling?: Rolling; processed: Set<string>;
	threshold: number; timeoutMs: number; signal: AbortSignal; fresh?: string; secrets?: readonly string[];
	stop?: TerminalStopInfo; commit: (receipt: Rolling) => boolean;
}): Promise<RollingOutcome & { review: ReviewResult }> {
	const supplements = a.context.records.filter((r) => r.kind === "supplement");
	const history = a.context.records.filter((r) => r.kind !== "supplement");
	// Reconstruct the SAME review after interruption/repeat: its starting seed is
	// not its newest completed checkpoint. New input can start from the latest receipt.
	const origin: NonNullable<Rolling["reviewOrigin"]> = !a.fresh && a.rolling?.reviewOrigin?.inputKey === a.inputKey
		? a.rolling.reviewOrigin
		: !a.fresh && a.rolling?.serviceCheckpoint && !a.rolling.inputKey.endsWith(":partial")
			? { inputKey: a.inputKey, checkpoint: a.rolling.serviceCheckpoint, through: a.rolling.through }
			: { inputKey: a.inputKey };
	// Membership comes from the active raw branch, not position in a compacted
	// context. New summaries/id-less entries before an old frontier are still new.
	// Truncate to this review's ORIGINAL frontier so partial retries reconstruct it.
	const priorIds = new Set<string>();
	if (origin.checkpoint && origin.through && a.processed.has(origin.through)) {
		for (const id of a.processed) { priorIds.add(id); if (id === origin.through) break; }
	}
	const priorRecords = history.filter((r) => priorIds.has(entryOf(r)));
	const newRecords = history.filter((r) => !priorIds.has(entryOf(r)));
	const originals = new Map(history.map((r) => [r.id, r]));
	const framed = (f: ReviewEvidenceFrame): EvidenceRecord => ({
		...originals.get(f.bounds?.of ?? f.record.id)!, id: f.record.id, text: f.record.text,
		...(f.bounds ? { fragment: f.bounds, complete: false } : {}),
	});
	let lastContext = a.context;
	let withheld: WithheldChoice[] = [];
	let through: string | undefined = origin.through;
	// The old HTTP boundary redacted these strings too. Credentials remain local
	// redaction inputs, never shared-service auth/config options. Preserve JSON keys.
	const project = (context: AuditContext, externalEvidence?: Set<string>): ReturnType<typeof buildAuditRequest> =>
		JSON.parse(JSON.stringify(buildAuditRequest(a.board, context, "shared-service", a.stop, externalEvidence),
			(_key, value) => typeof value === "string" ? redact(value, a.secrets) : value));
	const root = project({ ...a.context, records: supplements });
	const review = await a.service.review({
		state: { audit: root.state },
		questions: Object.fromEntries(Object.entries(root.questions).filter(([, q]) => Object.keys(q.criteria).length <= 255)) as Record<string, ClassifierQuestion>,
		evidence: newRecords.map(({ id, text, ...metadata }) => ({ id, text, metadata: metadata as unknown as JsonObject })),
	}, {
		checkpoint: origin.checkpoint,
		minConfidence: a.threshold, timeoutMs: a.timeoutMs, signal: a.signal, fresh: a.fresh,
		projectionRevision: "audit-source-projection/1",
		projectStage: (stage) => {
			// Completed bounds are processing metadata. Retain the actual source facts,
			// including original text after fragments, never substitute old opinions.
			// A completed prefix is not a completed source. Promoting its original
			// text here would reinsert the unsent remainder into fixed state and
			// make otherwise recoverable later fragments irreducible.
			const doneIds = new Set(stage.completed.filter((f) => !f.bounds || f.bounds.end === f.bounds.total).map((f) => f.bounds?.of ?? f.record.id));
			const retained = retainedFrom(history.filter((r) => priorRecords.includes(r) || doneIds.has(r.id))).records;
			const piece = stage.evidence.map(framed);
			const fragments = piece.filter((record) => record.fragment);
			lastContext = { ...a.context, records: [...retained, ...piece, ...supplements],
				globalComplete: a.context.globalComplete && fragments.length === 0,
				omissions: [...a.context.omissions, ...fragments.map((record) => ({ id: entryOf(record),
					reason: `unavailable: only source fragment ${record.fragment!.start}-${record.fragment!.end}/${record.fragment!.total} is in this stage; prior opinions are not source facts` }))],
				rolling: { opinions: stage.previousAnswers, progress: { processedThrough: through ?? null, final: stage.final } } };
			const req = project(lastContext, new Set(piece.map((r) => r.id)));
			withheld = Object.entries(req.questions).flatMap(([question, q]) => Object.keys(q.criteria).length > 255
				? [{ question, count: Object.keys(q.criteria).length, limit: 255 as const }] : []);
			const blocked = new Set(withheld.map((w) => w.question));
			return { state: { audit: req.state }, questions: Object.fromEntries(Object.entries(req.questions).filter(([id]) => !blocked.has(id))) as Record<string, ClassifierQuestion>, unresolved: [...blocked] };
		},
		onProgress: (stage) => {
			if (!stage.durable) return;
			const done = stage.sources.filter((s) => !s.bounds || s.bounds.end === s.bounds.total);
			const tail = done.at(-1);
			const nextThrough = tail ? entryOf(originals.get(tail.id)!) : through;
			if (!tail && stage.sources.length) return;
			if (a.commit({ through: nextThrough, inputKey: stage.final ? a.inputKey : `${a.inputKey}:partial`,
				opinions: stage.opinions as Record<string, ChoiceAnswer>, answerKeys: [], serviceCheckpoint: stage.checkpoint, reviewOrigin: origin })) through = nextThrough;
		},
	});
	const ok = review.stopReason === "stop";
	return { review, context: lastContext, reuse: review.reuse,
		result: { ...(ok ? { ok: true as const, answers: groupAnswers(review.answers as Record<string, ChoiceAnswer>) }
			: { ok: false as const, error: review.errorMessage ?? "shared review incomplete", contextOverflow: review.contextOverflow }), ...(withheld.length ? { withheld } : {}) },
		final: ok, complete: ok && review.unresolved.length === 0, unchanged: ok && review.diagnostics.attemptCount === 0,
		recovered: ok && review.diagnostics.attempts.some((x) => x.errorCategory === "overflow"),
		...(review.contextOverflow ? { needsAccount: true } : {}),
	};
}
