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

export interface FactualMaterial {
	role: "reported";
	/** Valid shape/references only, not verified factual accuracy or semantic coverage. */
	valid: boolean;
	sources: { id: string; role: string }[];
	covers: { id: string; role: string }[];
	gaps: { id: string; reason: string }[];
}

export interface AuditContext {
	records: EvidenceRecord[];
	/** The key is the containing task supplement; bodies remain in that record, once. */
	factualMaterial?: Record<string, FactualMaterial>;
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

/** Canonical public task data; object-key order is immaterial, array/user chronology is not. */
export function canonicalJson(value: unknown, secrets: readonly string[] = []): string {
	const json = safeJson(value, secrets);
	try {
		return JSON.stringify(JSON.parse(json), (_key, v) => v && typeof v === "object" && !Array.isArray(v)
			? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v);
	} catch { return json; }
}

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
	const unavailable = (id: string, reason: string) => {
		add(id, "unavailable", `[unavailable: ${reason}]`);
		omissions.push({ id, reason });
	};
	const event = (name: unknown, callId: string, status: ToolStatus) => safeJson({ tool: typeof name === "string" ? name : "unknown", call: callId, status });
	for (const raw of entries) {
		const e = object(raw);
		// Private/ambient entries must not occupy a synthetic historical identity either.
		if (["session", "custom", "model_change", "thinking_level_change", "usage", "label", "session_info", "context_edit"].includes(e.type) ||
			(e.type === "custom_message" && e.display === false) ||
			(e.type === "message" && (e.message?.role === "system" || (e.message?.role === "custom" && e.message.display === false)))) continue;
		const id = typeof e.id === "string" ? e.id : `entry-${index}`;
		index++;
		if (e.type === "compaction" || e.type === "branch_summary") {
			if (typeof e.summary !== "string" || !e.summary.trim()) {
				globalComplete = false;
				unavailable(id, "summary unavailable");
			} else add(id, "summary", redact(e.summary));
			continue;
		}
		if (e.type === "custom_message") {
			if (e.display !== false) add(id, "custom", visibleText(e.content), { advice: e.customType === "jev-todo-audit", producer: e.customType });
			continue;
		}
		if (e.type !== "message") {
			unavailable(id, "unsupported/non-conversation entry");
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
		} else if (m.role !== "system") unavailable(id, "unsupported or context-excluded message");
	}
	// JEV's own opinion is not new work: it enters review only once a later reply can make it interpretable.
	let lastReply = records.length - 1;
	while (lastReply >= 0 && (records[lastReply].advice || !["user", "assistant", "custom", "summary"].includes(records[lastReply].kind))) lastReply--;
	// Not recorded as an omission either: it is known bookkeeping, not missing evidence, and must not change the input identity.
	for (let i = records.length - 1; i > lastReply; i--) if (records[i].advice) records.splice(i, 1);
	for (const call of calls.values()) omissions.push({ id: call.id, reason: "tool result unavailable" });
	for (const s of supplements) {
		const text = canonicalJson(s.value, secrets);
		records.push({ id: s.id, kind: "supplement", text, group: s.id, view: "task", protected: true,
			complete: !/\[REDACTED\]|\[unavailable:/.test(text) });
	}
	for (const r of records) {
		// Placeholder records already have their explicit reason. Other incomplete records
		// retain an independent gap even when the same call also lacks a result.
		if (!r.complete && r.kind !== "unavailable") omissions.push({ id: r.id, reason: r.text.includes("[REDACTED]") ? "redacted evidence" : "unavailable: unsupported/serialization gap" });
	}
	if (!globalComplete) omissions.push({ id: "global", reason: "effective compaction-aware context unavailable" });
	const material = projectBriefs(records);
	return { records, omissions, globalComplete, reduced: false, userBoundary: lastUser,
		...(Object.keys(material).length ? { factualMaterial: material } : {}) };
}

/** Index only the already sanitized public task text and permitted active-history identities. */
function projectBriefs(records: EvidenceRecord[]): Record<string, FactualMaterial> {
	const byId = new Map<string, EvidenceRecord[]>();
	for (const r of records) byId.set(r.id, [...(byId.get(r.id) ?? []), r]);
	const material: Record<string, FactualMaterial> = {};
	for (const task of records.filter((r) => r.kind === "supplement")) {
		let value: unknown;
		try { value = JSON.parse(task.text); } catch { continue; } // The record already exposes the serialization gap.
		const metadata = object(object(value).metadata);
		if (!Object.hasOwn(metadata, "auditBrief")) continue;
		const brief = object(metadata.auditBrief);
		const gaps: FactualMaterial["gaps"] = [];
		const gap = (id: string, reason: string) => {
			if (!gaps.some((g) => g.id === id && g.reason === reason)) gaps.push({ id, reason });
		};
		if (typeof brief.text !== "string" || !brief.text.trim()) gap(task.id, "brief text unavailable");
		else if (/\[REDACTED\]|\[unavailable:/.test(brief.text)) gap(task.id, "brief text redacted or unsupported");
		const refs = (field: "sources" | "covers"): FactualMaterial["sources"] => {
			if (!Array.isArray(brief[field])) { gap(task.id, `invalid ${field} list`); return []; }
			const result: FactualMaterial["sources"] = [];
			for (const id of new Set(brief[field])) {
				if (typeof id !== "string" || !id.trim()) { gap(task.id, `invalid ${field} reference`); continue; }
				const found = byId.get(id) ?? [];
				const source = found.length === 1 ? found[0] : undefined;
				result.push({ id, role: source?.kind ?? "unavailable" });
				if (found.length > 1) gap(id, "ambiguous source identity");
				else if (!source) gap(id, "source unavailable");
				else if (!source.complete || source.advice || source.kind === "tool_call") gap(id, "source redacted or unsupported");
				else if (field === "covers" && source.kind !== "assistant") gap(id, "coverage requires a public main-agent report");
			}
			return result;
		};
		const sources = refs("sources"), covers = refs("covers");
		material[task.id] = { role: "reported", valid: !gaps.length, sources, covers, gaps };
	}
	return material;
}

/** Current supplied meaning, not opinions/progress; preserve user/source chronology. */
export const contextVersion = (context: AuditContext): string => digest({ records: context.records,
	factualMaterial: context.factualMaterial, userBoundary: context.userBoundary,
	omissions: context.omissions, globalComplete: context.globalComplete, reduced: context.reduced });

/** Execution-evidence lineage for correction deduplication, not current-input freshness. */
export function workVersion(context: AuditContext, bookkeepingTools: ReadonlySet<string> = new Set()): string {
	return digest({ userBoundary: context.userBoundary, records: context.records.filter((r) => r.kind === "user" ||
		(r.kind === "tool_result" && !bookkeepingTools.has(r.toolName ?? "")) || r.kind === "shell" ||
		(r.kind === "custom" && !r.advice)).map(({ id, text, isError }) => ({ id, text, isError })) });
}
