/** Historical HTTP/cache engine comparison. Never imported by production. */
import type { BoardSnapshot } from "../../board.js";
import { redact, object, digest, type AuditContext } from "../../context.js";
import { observe, overflowConstraint, sizeOf, type CapacityConstraint, type CapacityProfile, type ContextLimits } from "./capacity.js";
import { buildAuditRequest, type AuditAnswers, type ChoiceAnswer, type AuditRequest, type Attempt, type WithheldChoice, type TerminalStopInfo } from "../../typesafe.js";
export { buildAuditRequest, NOT_ON_BOARD } from "../../typesafe.js";
export type { AuditAnswers, ChoiceAnswer, AuditRequest, Attempt, WithheldChoice, TerminalStopInfo } from "../../typesafe.js";
export type AuditResult = ({ ok: true; answers: AuditAnswers } | { ok: false; error: string; contextOverflow?: boolean; retryable?: boolean; predicted?: boolean; constraint?: CapacityConstraint }) & { withheld?: WithheldChoice[] };
const withheldChoice = (question: string, definition: AuditRequest["questions"][string]): WithheldChoice | undefined => {
	const count = Object.keys(definition.criteria).length;
	return count > 255 ? { question, count, limit: 255 } : undefined;
};

/** Validate against this attempt's actual options, never a global list of conceivable keys. */
function normalizeAnswers(raw: unknown, req: AuditRequest): AuditAnswers | undefined {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
	const flat: Record<string, ChoiceAnswer> = {};
	for (const [key, v] of Object.entries(raw)) {
		const a = object(v), q = Object.hasOwn(req.questions, key) ? req.questions[key] : undefined;
		if (!q || typeof a.choice !== "string" || !Object.hasOwn(q.criteria, a.choice) ||
			typeof a.confidence !== "number" || !Number.isFinite(a.confidence) || a.confidence < 0 || a.confidence > 1) continue;
		flat[key] = { choice: a.choice, confidence: a.confidence };
	}
	return groupAnswers(flat);
}

const GROUPS = [["task_status_", "lifecycle"], ["task_granularity_", "granularity"], ["task_evidence_", "evidence"], ["task_board_", "reconciliation"]] as const;
export function groupAnswers(flat: Record<string, ChoiceAnswer>): AuditAnswers {
	const out: AuditAnswers = {};
	for (const [key, answer] of Object.entries(flat)) {
		const group = GROUPS.find(([prefix]) => key.startsWith(prefix))?.[1];
		if (group) (out[group] ??= {})[key] = answer;
		else (out as Record<string, unknown>)[key] = answer;
	}
	return out;
}
export function flattenAnswers(answers: AuditAnswers): Record<string, ChoiceAnswer> {
	const flat: Record<string, ChoiceAnswer> = {};
	for (const [key, value] of Object.entries(answers)) {
		if (GROUPS.some(([, group]) => group === key)) Object.assign(flat, value);
		else flat[key] = value as ChoiceAnswer;
	}
	return flat;
}

/** Bump when projection/judgment rules change the meaning of an otherwise identical request. */
export const JUDGMENT_VERSION = "share-audit-question-rubric/1";
/**
 * Uniform, topic-agnostic evaluation memory: one valid answer per exact
 * (endpoint, model, rules, state, complete question definition). Not a
 * similarity match; a changed option, instruction or state is a new key.
 */
export interface EvaluationCache {
	answers: Map<string, ChoiceAnswer>;
	pending: Map<string, Promise<ChoiceAnswer | undefined>>;
	/** Exact request envelopes the provider rejected for context size; never resent unchanged. */
	rejected: Set<string>;
	/** Evaluation keys answered during each explicit fresh review (by fresh-review token). */
	fresh?: Map<string, Set<string>>;
}
export const newEvaluationCache = (): EvaluationCache => ({ answers: new Map(), pending: new Map(), rejected: new Set(), fresh: new Map() });
/** Identity of one exact sent request (state plus the batch of questions actually asked). */
export const envelopeKey = (req: AuditRequest, endpoint: string) =>
	digest({ v: JUDGMENT_VERSION, endpoint, model: req.model, state: req.state, questions: req.questions });
export const evaluationKey = (req: AuditRequest, questionKey: string, endpoint: string) =>
	digest({ v: JUDGMENT_VERSION, endpoint, model: req.model, state: req.state, key: questionKey, question: req.questions[questionKey] });
export interface Reuse { hits: number; joined: number; sent: number }
export interface EvaluateOptions extends ClientOptions {
	cache?: EvaluationCache;
	/**
	 * Explicit forced review: ignore answers not produced by this fresh review. Answers stored under the same
	 * `fresh` token are reused, so a later failure never re-buys newly completed parts of the forced review.
	 */
	fresh?: string;
	/** Newly validated answers, keyed by evaluation identity (for persistence). */
	onStore?: (stored: Record<string, ChoiceAnswer>, attempt: { model?: string }) => void;
	/** A context-overflow rejection of this exact envelope (for persistence). */
	onReject?: (envelope: string) => void;
	/** Channel capacity: predict overflow of the actual miss envelope before sending, and learn from real attempts. */
	capacity?: { profile: CapacityProfile; limits?: ContextLimits };
	/** Retained state without new evidence. A soft prediction defeated by this floor needs real batch admission. */
	fixedState?: string;
	/** Irreducible scope: a single-question envelope is always sent so server admission decides. */
	sendIrreducible?: boolean;
	/** An envelope was split before sending (not a provider attempt). */
	onPresplit?: () => void;
}

/** Answer every question from cache, joined in-flight work, or one batch of the misses only. */
export async function evaluate(req: AuditRequest, opts: EvaluateOptions): Promise<{ result: AuditResult; reuse: Reuse }> {
	const cache = opts.cache ?? newEvaluationCache();
	const flat: Record<string, ChoiceAnswer> = {};
	const joins: [string, Promise<ChoiceAnswer | undefined>][] = [];
	const misses: [string, string][] = [];
	const withheld: WithheldChoice[] = [];
	for (const q of Object.keys(req.questions)) {
		const key = evaluationKey(req, q, opts.apiUrl);
		const hit = opts.fresh ? cache.fresh?.get(opts.fresh)?.has(key) ? cache.answers.get(key) : undefined : cache.answers.get(key);
		const pending = cache.pending.get(key);
		if (hit) flat[q] = hit;
		else if (pending) joins.push([q, pending]);
		else {
			const blocked = withheldChoice(q, req.questions[q]);
			if (blocked) withheld.push(blocked);
			else misses.push([q, key]);
		}
	}
	const reuse: Reuse = { hits: Object.keys(flat).length, joined: joins.length, sent: misses.length };
	let result: AuditResult | undefined;
	const sub: AuditRequest = { ...req, questions: Object.fromEntries(misses.map(([q]) => [q, req.questions[q]])) };
	const envelope = envelopeKey(sub, opts.apiUrl);
	const size = sizeOf(sub), capacity = opts.capacity;
	const constraint = capacity && overflowConstraint(capacity.profile, size, capacity.limits);
	const fixedSize = opts.fixedState === undefined ? undefined : { ...size, stateBytes: Buffer.byteLength(opts.fixedState) };
	const floor = capacity && fixedSize && overflowConstraint(capacity.profile, fixedSize, capacity.limits);
	// Question batching cannot resolve a request-wide prediction if even fixed state plus one question exceeds it.
	const requestFloor = capacity && fixedSize && overflowConstraint(capacity.profile,
		{ ...fixedSize, questionBytes: size.longestQuestionBytes }, { request: capacity.limits?.request });
	// Shrinking new records cannot resolve a fixed-state prediction. Admit the useful batch, not a validation-only probe.
	const admitFixed = floor === "state" || floor === "rejection" || requestFloor === "request";
	// A rejected single question proves that every superset with this exact state also cannot fit.
	const rejected = cache.rejected.has(envelope) || misses.some(([q]) =>
		cache.rejected.has(envelopeKey({ ...sub, questions: { [q]: sub.questions[q] } }, opts.apiUrl)));
	if (misses.length && rejected) {
		reuse.sent = 0;
		result = { ok: false, error: "context overflow: this exact envelope or a required single question was already rejected for this state", contextOverflow: true };
	} else if (misses.length && constraint && !admitFixed && !(opts.sendIrreducible && misses.length === 1)) {
		reuse.sent = 0;
		opts.onPresplit?.();
		result = { ok: false, error: "context overflow predicted by channel capacity estimate; split before sending", contextOverflow: true, predicted: true, constraint };
	} else if (misses.length) {
		let model: string | undefined;
		const run = runAudit(sub, { ...opts, onAttempt: (a) => {
			model = a.model ?? model;
			if (opts.capacity) observe(opts.capacity.profile, a);
			opts.onAttempt?.(a);
		} }).then((r) => {
			if (!r.ok && r.contextOverflow) { cache.rejected.add(envelope); opts.onReject?.(envelope); }
			const got = r.ok ? flattenAnswers(r.answers) : {};
			const stored: Record<string, ChoiceAnswer> = {};
			const freshKeys = opts.fresh ? (cache.fresh ??= new Map()).get(opts.fresh) ?? (cache.fresh.set(opts.fresh, new Set()), cache.fresh.get(opts.fresh)!) : undefined;
			for (const [q, key] of misses) if (got[q]) { cache.answers.set(key, got[q]); stored[key] = got[q]; freshKeys?.add(key); }
			if (Object.keys(stored).length) opts.onStore?.(stored, { model });
			return { r, got };
		});
		for (const [q, key] of misses) {
			const p = run.then(({ got }) => got[q], () => undefined);
			cache.pending.set(key, p);
			void p.finally(() => { if (cache.pending.get(key) === p) cache.pending.delete(key); });
		}
		const { r, got } = await run;
		Object.assign(flat, got);
		if (!r.ok) result = r;
	}
	for (const [q, p] of joins) { const a = await p; if (a) flat[q] = a; }
	return { result: { ...(result ?? { ok: true, answers: groupAnswers(flat) }), ...(withheld.length ? { withheld } : {}) }, reuse };
}

/** Only explicit input-context overflow permits cropping. Status alone never does. */
export function isContextOverflow(status: number, body: string): boolean {
	if (status !== 400 && status !== 422) return false;
	let payload: unknown;
	try { payload = JSON.parse(body); } catch { payload = { message: body }; }
	const e = object(payload), inner = object(e.error), detail = object(e.detail);
	// Do not scan echoed request state, validation input, or arbitrary nested data.
	// Observed live contract: {"detail":{"error_type":"max_tokens_exceeded"}}.
	// OpenRouter: {"error":{"code":400,"metadata":{"error_type":"context_length_exceeded"}}}; its numeric code is only the status.
	const code = object(inner.metadata).error_type ?? inner.code ?? e.code ?? detail.code ?? detail.error_type;
	const message = typeof e.error === "string" ? e.error : inner.message ?? e.message ?? (typeof e.detail === "string" ? e.detail : detail.message ?? "");
	if (/quota|billing|rate.?limit|per[- ](?:minute|second|hour|day)|balance|authentication|unauthorized/i.test(`${code ?? ""} ${message}`)) return false;
	if (code === "context_length_exceeded" || code === "context_window_exceeded" || code === "max_tokens_exceeded") return true;
	return typeof message === "string" && [
		/\b(?:maximum|max) context (?:length|window) (?:is |of )?\d[\s\S]*\b(?:exceed|requested|resulted)/i,
		/\b(?:input|request|state|combined|total) (?:token count|tokens|context length)[\s\S]*\bexceeds? (?:the )?(?:maximum|model|allowed|limit)/i,
		/\bcontext (?:length|window|token limit) (?:has been |is )?exceeded\b/i,
	].some((p) => p.test(message));
}

const RETRYABLE_ERROR_PATTERN = /overloaded|rate.?limit|too many requests|429|500|502|503|504|524|service.?unavailable|server.?error|internal.?error|provider.?returned.?error|exceeded request buffer limit while retrying upstream|network.?error|connection.?error|connection.?refused|connection.?lost|other side closed|fetch failed|getaddrinfo|ENOTFOUND|EAI_AGAIN|upstream.?connect|reset before headers|socket hang up|socket connection was closed|timed? out|timeout|terminated|websocket.?closed|websocket.?error|ended without|stream ended before message_stop|stream ended before a terminal response event|http2 request did not get a response|retry delay|you can retry your request|try your request again|please retry your request|ResourceExhausted/i;
const NON_RETRYABLE_ERROR_PATTERN = /GoUsageLimitError|FreeUsageLimitError|Monthly usage limit reached|available balance|insufficient_quota|out of budget|quota exceeded|billing/i;
const retryableError = (text: string) => !NON_RETRYABLE_ERROR_PATTERN.test(text) && RETRYABLE_ERROR_PATTERN.test(text);
const sleep = (ms: number, signal?: AbortSignal) => new Promise<boolean>((resolve) => {
	if (signal?.aborted) return resolve(false);
	const onAbort = () => { clearTimeout(t); resolve(false); };
	const t = setTimeout(() => { signal?.removeEventListener("abort", onAbort); resolve(true); }, ms);
	signal?.addEventListener("abort", onAbort, { once: true });
});
interface ClientOptions {
	apiUrl: string; apiKey: string; timeoutMs: number; maxRetries?: number; baseDelayMs?: number;
	signal?: AbortSignal; fetchFn?: (url: string, init?: RequestInit) => Promise<Response>;
	/** Called for every actual request, including retries, recovery and responses that later become stale. */
	onAttempt?: (attempt: Attempt) => void;
}
const tokens = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined;
/** Model/usage are retained independently of whether the answers are valid. */
function observed(body: unknown): Pick<Attempt, "model" | "inputTokens" | "outputTokens" | "costUsd"> {
	const b = object(body), usage = object(b.usage), cost = tokens(usage.cost);
	return { model: typeof b.model === "string" ? b.model : undefined, inputTokens: tokens(usage.input_tokens), outputTokens: tokens(usage.output_tokens), ...(cost === undefined ? {} : { costUsd: cost }) };
}
export async function runAudit(req: AuditRequest, opts: ClientOptions): Promise<AuditResult> {
	const withheld = Object.entries(req.questions).flatMap(([q, definition]) => {
		const blocked = withheldChoice(q, definition);
		return blocked ? [blocked] : [];
	});
	const blocked = new Set(withheld.map((w) => w.question));
	req = { ...req, questions: Object.fromEntries(Object.entries(req.questions).filter(([q]) => !blocked.has(q))) };
	if (!Object.keys(req.questions).length) return { ok: true, answers: {}, ...(withheld.length ? { withheld } : {}) };
	for (let attempt = 0; ; attempt++) {
		if (opts.signal?.aborted) return { ok: false, error: "aborted" };
		const res = await runOnce(req, opts.fetchFn ?? fetch, opts);
		if (res.ok || res.contextOverflow || opts.signal?.aborted || attempt >= (opts.maxRetries ?? 0) || !res.retryable)
			return { ...res, ...(withheld.length ? { withheld } : {}) };
		if (!(await sleep((opts.baseDelayMs ?? 2_000) * 2 ** attempt, opts.signal))) return { ok: false, error: "aborted" };
	}
}

/**
 * On explicit context overflow, divide independent questions into smaller
 * batches over the same frozen state. Every answered pair is cached, so a later
 * failure never re-buys completed batches. Stops at a single rejected question.
 */
export async function evaluateBatched(req: AuditRequest, opts: EvaluateOptions): Promise<{ result: AuditResult; reuse: Reuse }> {
	const total: Reuse = { hits: 0, joined: 0, sent: 0 };
	const run = async (qs: string[]): Promise<AuditResult> => {
		const { result, reuse } = await evaluate({ ...req, questions: Object.fromEntries(qs.map((q) => [q, req.questions[q]])) }, opts);
		total.hits += reuse.hits; total.joined += reuse.joined; total.sent += reuse.sent;
		if (result.ok || !result.contextOverflow || qs.length < 2 || opts.signal?.aborted) return result;
		const mid = Math.ceil(qs.length / 2);
		const a = await run(qs.slice(0, mid));
		if (!a.ok) return a;
		const b = await run(qs.slice(mid));
		if (!b.ok) return b;
		const withheld = [...(a.withheld ?? []), ...(b.withheld ?? [])];
		return { ok: true, answers: groupAnswers({ ...flattenAnswers(a.answers), ...flattenAnswers(b.answers) }), ...(withheld.length ? { withheld } : {}) };
	};
	return { result: await run(Object.keys(req.questions)), reuse: total };
}

/** One cache-aware evaluation of a context with question-batch subdivision; context subdivision is the rolling reviewer's job. */
export async function auditWithContext(board: BoardSnapshot, context: AuditContext, model: string, opts: EvaluateOptions, stop?: TerminalStopInfo): Promise<{ result: AuditResult; context: AuditContext; reuse: Reuse }> {
	// No context subdivision here: single questions are the irreducible unit, so admission decides them.
	const { result, reuse } = await evaluateBatched(buildAuditRequest(board, context, model, stop), { ...opts, sendIrreducible: true });
	return { result, context, reuse };
}

async function runOnce(req: AuditRequest, fetchFn: NonNullable<ClientOptions["fetchFn"]>, opts: ClientOptions): Promise<AuditResult> {
	const size = sizeOf(req);
	try {
		const res = await fetchFn(opts.apiUrl, {
			method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${opts.apiKey}` },
			body: JSON.stringify(req, (_key, value) => typeof value === "string" && opts.apiKey ? value.split(opts.apiKey).join("[REDACTED]") : value),
			signal: opts.signal ? AbortSignal.any([opts.signal, AbortSignal.timeout(opts.timeoutMs)]) : AbortSignal.timeout(opts.timeoutMs),
		});
		if (!res.ok) {
			const body = await res.text().catch(() => "");
			let parsed: unknown;
			try { parsed = JSON.parse(body); } catch { parsed = undefined; }
			const contextOverflow = isContextOverflow(res.status, body);
			opts.onAttempt?.({ outcome: contextOverflow ? "overflow" : "http_error", status: res.status, ...observed(parsed), ...size });
			return { ok: false, error: `HTTP ${res.status}${body ? `: ${redact(body, [opts.apiKey]).slice(0, 300)}` : ""}`, contextOverflow, retryable: retryableError(`HTTP ${res.status}: ${body}`) };
		}
		let raw: unknown;
		try { raw = await res.json(); } catch { raw = undefined; }
		const body = object(raw);
		const answers = normalizeAnswers(body.answers, req);
		opts.onAttempt?.({ outcome: answers ? "answered" : "malformed", status: res.status, ...observed(body), ...size });
		return answers ? { ok: true, answers } : { ok: false, error: "malformed response: no answers" };
	} catch (e) {
		const error = e instanceof Error ? e.message : String(e);
		opts.onAttempt?.({ outcome: "network_error", ...size });
		return { ok: false, error: redact(error, [opts.apiKey]), retryable: retryableError(error) };
	}
}
