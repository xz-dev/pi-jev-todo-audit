/**
 * Non-context accounting via Pi `appendEntry` custom entries. Judgment state
 * lives in state.ts (`jev-todo-audit-state`); this ledger keeps per-audit
 * diagnostics only. Old entry kinds (eval/judgment/receipt/full-review/
 * rejected) from the retired protocol are tolerated on read and ignored.
 */
import { object } from "./context.js";
import type { Attempt, WithheldChoice } from "./typesafe.js";

export const LEDGER_TYPE = "jev-todo-audit-ledger";
/** This extension's own bookkeeping: never evidence, never a freshness change. */
export const isOwnBookkeeping = (raw: unknown) => { const e = object(raw); return e.type === "custom" && e.customType === LEDGER_TYPE; };

export type LedgerRecord =
	/** Compact accounting only: never replayed as evidence or cache, never transcript bodies or credentials. */
	| { kind: "diag"; diag: AuditDiagnostics };

/** One audit's observable cost. Bytes are request shape, not tokens; missing usage is "unknown", never zero. */
export interface AuditDiagnostics {
	audit: string;
	label: string;
	/** Questions answered locally versus sent to the provider. */
	hits: number; misses: number;
	/** Session cursor before and after this audit. */
	range: { from: string | null; to: string | null };
	outcome: "unchanged" | "completed" | "recovered" | "incomplete" | "failed";
	/** Selected backend/model, when disclosed. */
	channel?: string;
	presplits?: number;
	withheld?: WithheldChoice[];
	attempts: { id?: string; phase?: "start" | "end"; n: number; outcome: Attempt["outcome"]; status?: number; model?: string; stateBytes?: number; questionBytes?: number; longestQuestionBytes?: number; inputTokens: number | "unknown"; outputTokens: number | "unknown"; costUsd?: number }[];
	usage: { inputTokens: number; outputTokens: number; costUsd?: number; unreported?: { inputTokens?: number; outputTokens?: number; costUsd?: number } };
}

/** Pure: builds diagnostics from observed attempts without sending anything. */
export function diagnose(audit: string, label: string, reuse: { hits: number; joined: number; sent: number }, range: AuditDiagnostics["range"],
	outcome: AuditDiagnostics["outcome"], attempts: Attempt[], capacity?: { channel?: string; presplits?: number; withheld?: WithheldChoice[] }): AuditDiagnostics {
	const known = (v: number | undefined): number | "unknown" => v ?? "unknown";
	type Figure = "inputTokens" | "outputTokens" | "costUsd";
	const sum = (k: Figure) => attempts.reduce((s, a) => s + (a[k] ?? 0), 0);
	const charged = attempts.some((a) => a.costUsd !== undefined);
	const figures: Figure[] = charged ? ["inputTokens", "outputTokens", "costUsd"] : ["inputTokens", "outputTokens"];
	const unreported = Object.fromEntries(figures.map((k) => [k, attempts.filter((a) => a[k] === undefined).length]).filter(([, n]) => n));
	return { audit, label, hits: reuse.hits + reuse.joined, misses: reuse.sent, range, outcome, ...capacity,
		attempts: attempts.map((a, i) => ({ n: i + 1, ...(a.id ? { id: a.id, phase: a.phase } : {}), outcome: a.outcome, status: a.status, model: a.model, stateBytes: a.stateBytes, questionBytes: a.questionBytes, longestQuestionBytes: a.longestQuestionBytes,
			inputTokens: known(a.inputTokens), outputTokens: known(a.outputTokens), ...(a.costUsd === undefined ? {} : { costUsd: a.costUsd }) })),
		usage: { inputTokens: sum("inputTokens"), outputTokens: sum("outputTokens"), ...(charged ? { costUsd: sum("costUsd") } : {}),
			...(Object.keys(unreported).length ? { unreported } : {}) } };
}

/** Returns false when the write failed; callers must not treat that record as durable. */
export function writeLedger(append: ((type: string, data: LedgerRecord) => void) | undefined, record: LedgerRecord): boolean {
	if (!append) return false;
	try { append(LEDGER_TYPE, record); return true; } catch { return false; }
}
