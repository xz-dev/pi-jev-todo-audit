import { createHash } from "node:crypto";

export interface EvidenceRecord {
	id: string;
	kind: string;
	text: string;
	group: string;
	view: "recent" | "global" | "task";
	protected: boolean;
	complete: boolean;
	callId?: string;
	toolName?: string;
	isError?: boolean;
	advice?: boolean;
	producer?: string;
	request?: string;
	selection?: string;
	/** Ordered part of one oversized record; the record is covered only once its last fragment is reviewed. */
	fragment?: { of: string; start: number; end: number; total: number };
}

export interface AuditContext {
	records: EvidenceRecord[];
	/** Latest public user boundary, retained even when new evidence is not text. */
	userBoundary?: string;
	omissions: { id: string; reason: string }[];
	globalComplete: boolean;
	reduced: boolean;
	/** Rolling review: remembered JEV opinions and processing progress, kept apart from reported work (records). */
	rolling?: {
		opinions: Record<string, unknown>;
		reportNote?: string;
		progress: { processedThrough: string | null; final: boolean };
	};
}

export const object = (v: unknown): Record<string, any> =>
	v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, any> : {};

/** Redact recognizable secrets, not arbitrary prose that happens to say "token". */
export function redact(text: string, secrets: readonly string[] = []): string {
	return secrets.filter(Boolean).reduce((value, secret) => value.split(secret).join("[REDACTED]"), text)
		.replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[REDACTED]")
		.replace(/\bBearer\s+[^\s"'`,;]+/gi, "Bearer [REDACTED]")
		.replace(/\b(?:sk-|ghp_|github_pat_)[A-Za-z0-9_-]{8,}\b/g, "[REDACTED]")
		.replace(/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, "[REDACTED]")
		.replace(/(\b(?:[A-Z_]+_)?(?:api[_-]?key|api[_-]?token|password|passwd|access[_-]?token|refresh[_-]?token|secret(?:[_-]?access[_-]?key)?|clientSecret)["']?\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s"',;}]+)/gi, "$1[REDACTED]")
		.replace(/((?:set-cookie|cookie|authorization)\s*:\s*)[^\r\n]+/gi, "$1[REDACTED]")
		.replace(/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/gi, "$1[REDACTED]@");
}

/** Session data is JSON; also contain malformed/cyclic supplemental values. */
export function safeJson(value: unknown, secrets: readonly string[] = []): string {
	const ancestors: unknown[] = [];
	try {
		return JSON.stringify(value, function (key, v) {
			if (/(?:^|[_-])(?:api[_-]?key|api[_-]?token|token|authorization|proxy-authorization|password|passwd|secret|access[_-]?token|refresh[_-]?token|private[_-]?key|secret[_-]?access[_-]?key|cookie|set-cookie)$|^clientSecret$/i.test(key)) return "[REDACTED]";
			if (/^(?:thinking|chain_of_thought)$/i.test(key) || ["thinking", "image", "audio", "video", "Buffer"].includes(object(v).type) || ArrayBuffer.isView(v) || v instanceof ArrayBuffer) return "[unavailable: non-text/private content]";
			if (typeof v === "object" && v !== null) {
				while (ancestors.length && ancestors.at(-1) !== this) ancestors.pop();
				if (ancestors.includes(v)) return "[unavailable: circular value]";
				ancestors.push(v);
			}
			return typeof v === "string" ? redact(v, secrets) : typeof v === "bigint" ? String(v) : v;
		}) ?? "null";
	} catch {
		return "[unavailable: serialization failed]";
	}
}

function visibleText(content: unknown): string {
	if (typeof content === "string") return redact(content);
	if (!Array.isArray(content)) return "";
	return content.map((raw) => {
		const b = object(raw);
		if (b.type === "text") return typeof b.text === "string" ? redact(b.text) : "[unavailable: invalid text]";
		if (b.type === "thinking" || b.type === "toolCall") return "";
		return "[unavailable: unsupported content]";
	}).filter(Boolean).join("\n");
}

export const digest = (v: unknown) => createHash("sha256").update(safeJson(v)).digest("hex");

/**
 * Leader-level projection of the public session. JEV is a macro reviewer, not
 * an executor: visible user/assistant/custom text is kept in order, while tool
 * and shell activity is reduced to name, call identity/order and the existing
 * envelope status. Arguments, commands and result bodies are never exported,
 * and unfamiliar tools need no payload adapter. Supplements are task data.
 */
export type ToolStatus = "returned" | "error" | "cancelled" | "pending" | "unknown";
export function collectContext(
	entries: Iterable<unknown>,
	supplements: { id: string; value: unknown }[] = [],
	globalComplete = true,
	secrets: readonly string[] = [],
): AuditContext {
	const records: EvidenceRecord[] = [];
	const omissions: AuditContext["omissions"] = [];
	const calls = new Map<string, EvidenceRecord>();
	let lastUser = "", lastAssistantText = "";
	let index = 0;
	const add = (id: string, kind: string, text: string, extra: Partial<EvidenceRecord> = {}) => {
		if (!text.trim()) return;
		text = redact(text, secrets);
		records.push({ id, kind, text, group: id, view: "global", protected: kind === "user" || kind === "summary", request: lastUser,
			complete: !/\[REDACTED\]|\[unavailable:/.test(text), ...extra });
	};
	const event = (name: unknown, callId: string, status: ToolStatus) => safeJson({ tool: typeof name === "string" ? name : "unknown", call: callId, status });
	for (const raw of entries) {
		const e = object(raw);
		const id = typeof e.id === "string" ? e.id : `entry-${index}`;
		index++;
		if (e.type === "compaction" || e.type === "branch_summary") {
			if (typeof e.summary !== "string" || !e.summary.trim()) {
				globalComplete = false;
				omissions.push({ id, reason: "summary unavailable" });
			} else add(id, "summary", redact(e.summary));
			continue;
		}
		if (e.type === "custom_message") {
			if (e.display !== false) add(id, "custom", visibleText(e.content), { advice: e.customType === "jev-todo-audit", producer: e.customType });
			continue;
		}
		if (e.type !== "message") {
			omissions.push({ id, reason: e.type === "custom" ? "private extension state" : "unsupported/non-conversation entry" });
			continue;
		}
		const m = object(e.message);
		if (m.role === "user") {
			lastUser = id;
			// Keep the question a short reply ("yes") answers identifiable.
			add(id, "user", visibleText(m.content), lastAssistantText ? { selection: `replies to ${lastAssistantText}` } : {});
		} else if (m.role === "assistant") {
			const text = visibleText(m.content);
			if (text) { lastAssistantText = id; add(id, "assistant", text); }
			for (const [n, rawBlock] of (Array.isArray(m.content) ? m.content : []).entries()) {
				const b = object(rawBlock);
				if (b.type !== "toolCall") continue;
				const callId = typeof b.id === "string" ? b.id : `${id}-${n}`;
				add(`${id}:call:${callId}`, "tool_call", event(b.name, callId, "pending"), { callId, toolName: b.name });
				calls.set(callId, records.at(-1)!);
			}
		} else if (m.role === "toolResult") {
			const callId = typeof m.toolCallId === "string" ? m.toolCallId : id;
			const status: ToolStatus = m.isError === true ? "error" : m.isError === false || m.content !== undefined ? "returned" : "unknown";
			const call = calls.get(callId);
			calls.delete(callId);
			// Recorded events stay immutable: a later result is a new event linked to its earlier call by identity.
			add(id, "tool_result", event(m.toolName ?? call?.toolName, callId, status), { callId, toolName: m.toolName, isError: status === "error", group: call?.id ?? id });
		} else if (m.role === "custom" && m.display !== false) {
			add(id, "custom", visibleText(m.content), { advice: m.customType === "jev-todo-audit", producer: m.customType });
		} else if (m.role === "bashExecution" && !m.excludeFromContext) {
			const status: ToolStatus = m.cancelled === true ? "cancelled" : typeof m.exitCode === "number" ? (m.exitCode === 0 ? "returned" : "error") : "unknown";
			add(id, "shell", event("bash", id, status), { isError: status === "error" || status === "cancelled" });
		} else if (m.role !== "system") omissions.push({ id, reason: "unsupported or context-excluded message" });
	}
	// JEV's own opinion is not new work: it enters review only once a later reply can make it interpretable.
	let lastReply = records.length - 1;
	while (lastReply >= 0 && (records[lastReply].advice || !["user", "assistant", "custom", "summary"].includes(records[lastReply].kind))) lastReply--;
	// Not recorded as an omission either: it is known bookkeeping, not missing evidence, and must not change the input identity.
	for (let i = records.length - 1; i > lastReply; i--) if (records[i].advice) records.splice(i, 1);
	for (const call of calls.values()) omissions.push({ id: call.id, reason: "tool result unavailable" });
	for (const s of supplements) {
		const text = safeJson(s.value, secrets);
		records.push({ id: s.id, kind: "supplement", text, group: s.id, view: "task", protected: true,
			complete: !/\[REDACTED\]|\[unavailable:/.test(text) });
	}
	for (const r of records) {
		if (!r.complete) omissions.push({ id: r.id, reason: r.text.includes("[REDACTED]") ? "redacted evidence" : "unavailable: unsupported/serialization gap" });
	}
	if (!globalComplete) omissions.push({ id: "global", reason: "effective compaction-aware context unavailable" });
	return { records, omissions, globalComplete, reduced: false, userBoundary: lastUser };
}

/** Advice/acknowledgments and board bookkeeping are not new execution evidence. */
export function workVersion(context: AuditContext, bookkeepingTools: ReadonlySet<string> = new Set()): string {
	return digest({ userBoundary: context.userBoundary, records: context.records.filter((r) => r.kind === "user" ||
		(r.kind === "tool_result" && !bookkeepingTools.has(r.toolName ?? "")) || r.kind === "shell" ||
		(r.kind === "custom" && !r.advice)).map(({ id, text, isError }) => ({ id, text, isError })) });
}
