/**
 * Non-context persistence for evaluation answers and processing receipts via
 * Pi `appendEntry` custom entries. Replayed from the active branch only, so
 * abandoned branches never become current. Not a database, not model context.
 */
import { object } from "./context.js";
import type { Rolling } from "./rolling.js";
import type { Attempt, ChoiceAnswer, EvaluationCache } from "./typesafe.js";

export const LEDGER_TYPE = "jev-todo-audit-ledger";
/** This extension's own bookkeeping: never evidence, never a freshness change. */
export const isOwnBookkeeping = (raw: unknown) => { const e = object(raw); return e.type === "custom" && e.customType === LEDGER_TYPE; };

/** A processing receipt is the cumulative rolling result of a completed stage. */
export type LedgerRecord =
	| { kind: "eval"; answers: Record<string, ChoiceAnswer>; model?: string }
	| { kind: "receipt"; receipt: Rolling }
	/** An exact request envelope rejected for context size: never resent unchanged, even after reload. */
	| { kind: "rejected"; envelope: string }
	/** Compact accounting only: never replayed as evidence or cache, never transcript bodies or credentials. */
	| { kind: "diag"; diag: AuditDiagnostics };

/** One audit's observable cost. Bytes are request shape, not tokens; missing usage is "unknown", never zero. */
export interface AuditDiagnostics {
	audit: string;
	label: string;
	/** Questions answered locally (cache/joined) versus sent to the provider. */
	hits: number; misses: number;
	/** Processed-range receipt before and after this audit. */
	range: { from: string | null; to: string | null };
	outcome: "unchanged" | "completed" | "recovered" | "incomplete" | "failed";
	/** Capacity channel (endpoint + requested model digest); attempts on it calibrate later predictions. */
	channel?: string;
	/** Envelopes split before sending by the capacity estimate: not provider attempts, no usage. */
	presplits?: number;
	attempts: { n: number; outcome: Attempt["outcome"]; status?: number; model?: string; stateBytes?: number; questionBytes?: number; longestQuestionBytes?: number; inputTokens: number | "unknown"; outputTokens: number | "unknown"; costUsd?: number }[];
	/** `costUsd` only on channels that report a charge; unknown if any attempt there lacks one. */
	usage: { inputTokens: number | "unknown"; outputTokens: number | "unknown"; costUsd?: number | "unknown" };
}

/** Pure: builds diagnostics from observed attempts without sending anything. */
export function diagnose(audit: string, label: string, reuse: { hits: number; joined: number; sent: number }, range: AuditDiagnostics["range"],
	outcome: AuditDiagnostics["outcome"], attempts: Attempt[], capacity?: { channel: string; presplits: number }): AuditDiagnostics {
	const known = (v: number | undefined): number | "unknown" => v ?? "unknown";
	const sum = (k: "inputTokens" | "outputTokens" | "costUsd") => attempts.every((a) => a[k] !== undefined) ? attempts.reduce((s, a) => s + a[k]!, 0) : "unknown" as const;
	const charged = attempts.some((a) => a.costUsd !== undefined);
	return { audit, label, hits: reuse.hits + reuse.joined, misses: reuse.sent, range, outcome, ...capacity,
		attempts: attempts.map((a, i) => ({ n: i + 1, outcome: a.outcome, status: a.status, model: a.model, stateBytes: a.stateBytes, questionBytes: a.questionBytes, longestQuestionBytes: a.longestQuestionBytes,
			inputTokens: known(a.inputTokens), outputTokens: known(a.outputTokens), ...(a.costUsd === undefined ? {} : { costUsd: a.costUsd }) })),
		usage: { inputTokens: sum("inputTokens"), outputTokens: sum("outputTokens"), ...(charged ? { costUsd: sum("costUsd") } : {}) } };
}

const validAnswer = (v: unknown): v is ChoiceAnswer => {
	const a = object(v);
	return typeof a.choice === "string" && typeof a.confidence === "number" && Number.isFinite(a.confidence) && a.confidence >= 0 && a.confidence <= 1;
};

/** Returns false when the write failed; callers must not treat that record as durable. */
export function writeLedger(append: ((type: string, data: LedgerRecord) => void) | undefined, record: LedgerRecord): boolean {
	if (!append) return false;
	try { append(LEDGER_TYPE, record); return true; } catch { return false; }
}

/**
 * Replay compatible records from the active branch into memory and return the
 * latest receipt. A receipt counts only when all its required answers were recorded.
 */
export function restoreLedger(branch: Iterable<unknown>, cache: EvaluationCache): Rolling | undefined {
	let latest: Rolling | undefined;
	for (const raw of branch) {
		if (!isOwnBookkeeping(raw)) continue;
		const d = object(object(raw).data);
		if (d.kind === "eval") {
			for (const [key, answer] of Object.entries(object(d.answers))) if (validAnswer(answer)) cache.answers.set(key, { choice: answer.choice, confidence: answer.confidence });
		} else if (d.kind === "rejected") {
			if (typeof d.envelope === "string") cache.rejected.add(d.envelope);
		} else if (d.kind === "receipt") {
			const r = object(d.receipt), opinions = object(r.opinions);
			if ((r.through === undefined || typeof r.through === "string") && typeof r.inputKey === "string" && Array.isArray(r.answerKeys) &&
				r.answerKeys.every((k: unknown) => typeof k === "string" && cache.answers.has(k)) && Object.values(opinions).every(validAnswer))
				latest = { through: r.through, inputKey: r.inputKey, opinions, answerKeys: r.answerKeys,
					...(Array.isArray(r.oversized) && r.oversized.every((k: unknown) => typeof k === "string") ? { oversized: r.oversized } : {}) };
		}
	}
	return latest;
}
