/**
 * Complete-loop segmentation. A loop is one assistant message plus every tool
 * result it produced on the active branch (shell executions and visible custom
 * messages attach to the loop they follow; user messages open a new loop
 * boundary). A loop is complete when each tool call has a recorded result or
 * explicit failure. Loops are never split; an incomplete trailing loop is
 * excluded. Packing works on projected records (name/call/status only for
 * tools) so bodies never enter the estimate.
 */
import type { EvidenceRecord } from "./context.js";

export interface Loop {
	/** Branch id of the opening record (assistant message or user message). */
	id: string;
	/** Zero-based position on the active branch's loop sequence. */
	index: number;
	records: EvidenceRecord[];
	/** All tool calls in this loop have a result or explicit failure. */
	complete: boolean;
	/** UTF-8 bytes of the projected records (not tokens). */
	bytes: number;
}

const utf8 = (text: string) => Buffer.byteLength(text, "utf8");
const entryIdOf = (record: EvidenceRecord) => (record.fragment?.of ?? record.id).split(":call:")[0];

/**
 * Group projected history records into loops. Supplements (task data) are
 * excluded: they are current state, not history. Records before the first
 * assistant/user message form loop 0 (e.g. a leading summary).
 */
export function groupLoops(records: readonly EvidenceRecord[]): Loop[] {
	const loops: Loop[] = [];
	let current: Loop | undefined;
	let pending = new Set<string>();
	const open = (id: string) => {
		current = { id, index: loops.length, records: [], complete: true, bytes: 0 };
		loops.push(current);
		pending = new Set();
	};
	for (const record of records) {
		if (record.kind === "supplement") continue;
		const entryId = entryIdOf(record);
		// A user message or an assistant message (text or first tool call) opens a loop.
		const opensLoop = record.kind === "user" ||
			((record.kind === "assistant" || record.kind === "tool_call") && (!current || current.id !== entryId));
		// Interleaved summaries, steering and error messages cannot separate a
		// call from its results. An unresolved call fences everything after it.
		if (!current || (opensLoop && pending.size === 0)) open(entryId);
		const loop = current!;
		loop.records.push(record);
		loop.bytes += utf8(JSON.stringify(record));
		if (record.kind === "tool_call" && record.callId) pending.add(record.callId);
		else if (record.kind === "tool_result" && record.callId) pending.delete(record.callId);
		loop.complete = pending.size === 0;
	}
	return loops;
}

/** Loops after the cursor (exclusive) that are complete; stops at the first incomplete one. */
export function loopsAfter(loops: readonly Loop[], cursor: string | undefined): Loop[] {
	let start = 0;
	if (cursor !== undefined) {
		const at = loops.findIndex((l) => l.id === cursor);
		if (at < 0) return [];
		start = at + 1;
	}
	const out: Loop[] = [];
	for (const loop of loops.slice(start)) {
		if (!loop.complete) break;
		out.push(loop);
	}
	return out;
}

export interface PackLimits {
	/** Tokens the backend admits for state plus the longest question. */
	stateAndLongestQuestion?: number;
	/** Tokens the backend admits for the whole request. */
	request?: number;
	/** Generic declared window, used when the two above are absent. */
	contextWindow?: number;
	/** Usable input tokens per UTF-8 byte (service prior or learned). */
	tokensPerByte: number;
	/** Bytes the backend reserves for its own envelope. */
	envelopeOverheadBytes: number;
	/** Tokens reserved for the answer. */
	outputReserve?: number;
}

export interface Packed {
	loops: Loop[];
	/** Loops that did not fit this time, in order. */
	remaining: Loop[];
	/** The first loop alone exceeds the budget with the fixed bytes. */
	oversize?: Loop;
	/** The oversize is a choice-count overflow (> MAX_CHOICES sources in one loop), not bytes. */
	tooManyChoices?: boolean;
	/** Estimated tokens of fixed + packed loops. */
	estimatedTokens: number;
	/** Limit used (tokens); undefined when no declared limit exists. */
	limitTokens?: number;
}

/**
 * Pack consecutive loops into one segment within the declared capacity.
 * `fixedBytes` covers stored state, question definitions and shared rules.
 * `fallbackLoops` bounds the segment when the backend declares no limit.
 */
/** Jev choice questions admit at most this many options; source-evidence questions grow with the segment. */
export const MAX_CHOICES = 255;

export function packLoops(loops: readonly Loop[], fixedBytes: number, limits: PackLimits, fallbackLoops = 8,
	measure?: (segment: Loop[]) => { request: number; stateAndLongestQuestion: number; choices?: number }): Packed {
	const limitTokens = limits.stateAndLongestQuestion !== undefined || limits.request !== undefined
		? Math.min(...[limits.stateAndLongestQuestion, limits.request].filter((n): n is number => typeof n === "number"))
		: limits.contextWindow;
	const tokens = (bytes: number) => Math.ceil((bytes + limits.envelopeOverheadBytes) * limits.tokensPerByte) + (limits.outputReserve ?? 0);
	const choicesFit = (dimensions?: { choices?: number }) => (dimensions?.choices ?? 0) <= MAX_CHOICES;
	if (limitTokens === undefined) {
		// No token metadata: the fallback count still honors the hard choice ceiling.
		const taken: Loop[] = [];
		for (const loop of loops.slice(0, fallbackLoops)) { if (!choicesFit(measure?.([...taken, loop]))) break; taken.push(loop); }
		return { loops: taken, remaining: loops.slice(taken.length), estimatedTokens: tokens(fixedBytes + taken.reduce((n, l) => n + l.bytes, 0)),
			...(taken.length === 0 && loops.length ? { oversize: loops[0], tooManyChoices: true } : {}) };
	}
	const taken: Loop[] = [];
	let bytes = fixedBytes;
	let tooManyChoices = false;
	for (const loop of loops) {
		const dimensions = measure?.([...taken, loop]);
		if (!choicesFit(dimensions)) { tooManyChoices = taken.length === 0; break; }
		const fits = dimensions
			? tokens(dimensions.request) <= (limits.request ?? limits.contextWindow ?? Infinity) &&
				tokens(dimensions.stateAndLongestQuestion) <= (limits.stateAndLongestQuestion ?? limits.contextWindow ?? Infinity)
			: tokens(bytes + loop.bytes) <= limitTokens;
		if (!fits) break;
		taken.push(loop);
		bytes += loop.bytes;
	}
	const remaining = loops.slice(taken.length);
	return { loops: taken, remaining, estimatedTokens: tokens(bytes), limitTokens,
		...(taken.length === 0 && loops.length ? { oversize: loops[0], ...(tooManyChoices ? { tooManyChoices: true } : {}) } : {}) };
}
