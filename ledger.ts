/**
 * Non-context accounting via Pi `appendEntry` custom entries. Judgment state
 * lives in state.ts (`jev-todo-audit-state`); this ledger keeps per-audit
 * diagnostics only. Old entry kinds (eval/judgment/receipt/full-review/
 * rejected) from the retired protocol are tolerated on read and ignored.
 */
import { object } from "./context.js";
import type { WithheldChoice } from "./typesafe.js";

export const LEDGER_TYPE = "jev-todo-audit-ledger";
/** This extension's own bookkeeping: never evidence, never a freshness change. */
export const isOwnBookkeeping = (raw: unknown) => { const e = object(raw); return e.type === "custom" && e.customType === LEDGER_TYPE; };

export type LedgerRecord =
	/** Compact accounting only: never replayed as evidence or cache, never transcript bodies or credentials. */
	| { kind: "diag"; diag: AuditDiagnostics };

/** One judged segment's outcome. Model is the terminal model; usage keeps its stated scope. */
export interface SegmentDiag {
	scopes: string[];
	loops: string[];
	outcome: string;
	error?: string;
	contextOverflow?: boolean;
	model?: string;
	/** Provider-reported usage under the service's stated scope; absent is unknown. */
	usage?: { input?: number; output?: number };
}

/** One audit's compact observations. Missing usage is "unknown", never zero. */
export interface AuditDiagnostics {
	audit: string;
	label: string;
	/** Session cursor before and after this audit. */
	range: { from: string | null; to: string | null };
	outcome: "unchanged" | "completed" | "recovered" | "incomplete" | "failed";
	/** Selected backend/model, when disclosed. */
	channel?: string;
	presplits?: number;
	withheld?: WithheldChoice[];
	segments: SegmentDiag[];
}

/** Pure: builds diagnostics from returned segment reports without sending anything. */
export function diagnose(audit: string, label: string, range: AuditDiagnostics["range"],
	outcome: AuditDiagnostics["outcome"], segments: SegmentDiag[], capacity?: { channel?: string; presplits?: number; withheld?: WithheldChoice[] }): AuditDiagnostics {
	return { audit, label, range, outcome, ...capacity, segments };
}

/** Returns false when the write failed; callers must not treat that record as durable. */
export function writeLedger(append: ((type: string, data: LedgerRecord) => void) | undefined, record: LedgerRecord): boolean {
	if (!append) return false;
	try { append(LEDGER_TYPE, record); return true; } catch { return false; }
}
