/**
 * Per-channel request capacity: predict an overflow before sending instead of
 * buying a rejection. A channel is one endpoint + requested model. The estimate
 * is bytes × the densest tokens/byte actually observed on that channel (a
 * conservative prior until usage exists), checked separately against each
 * published limit, plus actual rejection sizes. It is an estimate, never a fit
 * guarantee: server admission stays authoritative for irreducible units.
 */
import { digest, object } from "./context.js";
import type { AuditRequest } from "./typesafe.js";

/** Token limits; `request` = state + all questions, `stateAndLongestQuestion` = state + the largest question. */
export interface ContextLimits { request?: number; stateAndLongestQuestion?: number }
/**
 * TypeSafe Models page (Jev 1.13) and OpenRouter model page (`typesafe/jev-1.13`, one 32K context), checked 2026-09-29.
 * OpenRouter publishes no separate per-question limit, so its single context bounds both dimensions.
 */
export const PUBLISHED_LIMITS: Readonly<Record<string, ContextLimits>> = {
	"https://api.typesafe.ai/v1/systemone": { request: 64_000, stateAndLongestQuestion: 32_000 },
	"https://openrouter.ai/api/v1/systemone": { request: 32_000, stateAndLongestQuestion: 32_000 },
};
/** Pi provider whose credentials serve each known endpoint; other URLs use extension config only. */
export const PI_PROVIDERS: Readonly<Record<string, string>> = {
	"https://api.typesafe.ai/v1/systemone": "typesafe",
	"https://openrouter.ai/api/v1/systemone": "openrouter",
};
/** Live smoke densest observation was 1/1.766 tokens per byte; slightly denser until real usage exists. */
export const PRIOR_TOKENS_PER_BYTE = 1 / 1.75;

/** UTF-8 byte sizes of what is (or would be) sent. */
export interface EnvelopeSize { stateBytes: number; questionBytes: number; longestQuestionBytes: number }
export interface CapacityProfile {
	/** Densest observed input tokens per sent byte; undefined until the provider reports usage. */
	tokensPerByte?: number;
	/** Minimal set of actually rejected sizes (dominated entries pruned). */
	rejections: EnvelopeSize[];
}
export const newCapacityProfile = (): CapacityProfile => ({ rejections: [] });
export const channelKey = (apiUrl: string, model: string) => digest({ apiUrl, model });

export function sizeOf(req: Pick<AuditRequest, "state" | "questions">): EnvelopeSize {
	const each = Object.entries(req.questions).map(([k, q]) => Buffer.byteLength(JSON.stringify({ [k]: q })));
	return { stateBytes: Buffer.byteLength(req.state), questionBytes: Buffer.byteLength(JSON.stringify(req.questions)), longestQuestionBytes: Math.max(0, ...each) };
}

const longest = (s: EnvelopeSize) => s.stateBytes + s.longestQuestionBytes;
const total = (s: EnvelopeSize) => s.stateBytes + s.questionBytes;
/** `a` is at least as large as `b` in both limited dimensions. */
const covers = (a: EnvelopeSize, b: EnvelopeSize) => longest(a) >= longest(b) && total(a) >= total(b);

export function predictOverflow(p: CapacityProfile, s: EnvelopeSize, limits?: ContextLimits): boolean {
	if (p.rejections.some((r) => covers(s, r))) return true;
	const ratio = p.tokensPerByte ?? PRIOR_TOKENS_PER_BYTE;
	return (limits?.stateAndLongestQuestion !== undefined && longest(s) * ratio > limits.stateAndLongestQuestion)
		|| (limits?.request !== undefined && total(s) * ratio > limits.request);
}

const size = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
/** Learn from one real provider attempt (answered usage or an explicit overflow rejection). */
export function observe(p: CapacityProfile, a: { outcome?: unknown; inputTokens?: unknown; stateBytes?: unknown; questionBytes?: unknown; longestQuestionBytes?: unknown }) {
	if (!size(a.stateBytes) || !size(a.questionBytes)) return;
	if (a.outcome === "answered" && size(a.inputTokens) && a.inputTokens > 0) {
		const ratio = a.inputTokens / (a.stateBytes + a.questionBytes);
		p.tokensPerByte = Math.max(p.tokensPerByte ?? 0, ratio);
	} else if (a.outcome === "overflow" && size(a.longestQuestionBytes)) {
		const s: EnvelopeSize = { stateBytes: a.stateBytes, questionBytes: a.questionBytes, longestQuestionBytes: a.longestQuestionBytes };
		if (p.rejections.some((r) => covers(s, r))) return;
		p.rejections = [...p.rejections.filter((r) => !covers(r, s)), s];
	}
}

/** Rebuild per-channel profiles from this extension's diagnostics on the active branch (no new store). */
export function restoreCapacity(branch: Iterable<unknown>, isOwn: (raw: unknown) => boolean): Map<string, CapacityProfile> {
	const out = new Map<string, CapacityProfile>();
	for (const raw of branch) {
		if (!isOwn(raw)) continue;
		const d = object(object(object(raw).data).diag);
		if (typeof d.channel !== "string" || !Array.isArray(d.attempts)) continue;
		const p = out.get(d.channel) ?? (out.set(d.channel, newCapacityProfile()), out.get(d.channel)!);
		for (const a of d.attempts) observe(p, object(a));
	}
	return out;
}
