/**
 * Representative captured-request replay corpus. Offline only: requests go to a
 * mock endpoint. MOCK_CAPACITY is an explicit test contract measured in JSON
 * bytes (state + longest question); it is NOT the provider's tokenizer or its
 * real 32k/64k token limits.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import makeExtension from "../index.js";
import { DEFAULT_CONFIG } from "../config.js";

export const MOCK_CAPACITY = 24_000;
type Req = { state: string; model: string; questions: Record<string, { criteria: Record<string, unknown> }> };
export interface CaseMetrics {
	requests: number; presplits: number; receipts: number; rejected: number; failed: number; bytes: number; stateBytes: number; questionBytes: number; maxStatePlusQuestion: number;
	questionsAsked: number; textSeen: number; textTotal: number; toolBodyLeaks: number;
	/** Bytes of non-task records already sent in an earlier request of this case (re-sent processed input). */
	resentBytes: number;
	/** Bytes of the rolling opinions/progress block (added overhead). */
	rollingBytes: number;
	/** Requests that reused nothing but the cache: full-repeat audits answered locally. */
	auditsWithoutRequest: number;
}
type Step = { push: unknown[] } | { audit: string } | { failNext: number } | { omit: RegExp } | { answerAll: true };
export interface Case { name: string; ordinary: boolean; steps: Step[]; textMarkers: string[] }

let n = 0;
const id = (p: string) => `${p}-${++n}`;
export const user = (text: string) => ({ id: id("u"), type: "message", message: { role: "user", content: text } });
export const say = (text: string) => ({ id: id("a"), type: "message", message: { role: "assistant", content: [{ type: "text", text }] } });
export const tool = (name: string, args: unknown, body: string, isError = false) => {
	const call = id("call");
	return [
		{ id: id("a"), type: "message", message: { role: "assistant", content: [{ type: "toolCall", id: call, name, arguments: args }] } },
		{ id: id("r"), type: "message", message: { role: "toolResult", toolCallId: call, toolName: name, isError, content: [{ type: "text", text: body }] } },
	];
};
export const todo = (tasks: unknown[]) => [
	{ id: id("a"), type: "message", message: { role: "assistant", content: [{ type: "toolCall", id: id("todo"), name: "todo", arguments: { action: "update" } }] } },
	{ id: id("r"), type: "message", message: { role: "toolResult", toolName: "todo", content: [{ type: "text", text: "Board updated" }], details: { tasks, nextId: 20 } } },
];
const TOOL_BODY = "TOOL_BODY_MARK";
const pad = (mark: string, bytes: number) => `${mark} ` + "analysis detail sentence. ".repeat(Math.ceil(bytes / 26));
const t5 = { id: 5, subject: "Parser rewrite", description: "Reject malformed input in src/parser.ts", status: "in_progress" };

export function corpus(): Case[] {
	const toolHeavy: Step[] = [{ push: [user("Rewrite src/parser.ts so malformed input is rejected."), ...todo([t5])] }];
	for (let i = 0; i < 3; i++) {
		const batch: unknown[] = [];
		for (let j = 0; j < 6; j++) batch.push(...tool(j % 2 ? "bash" : "read", { command: `${TOOL_BODY} cmd ${i}-${j} src/parser.ts`, path: "src/parser.ts" }, pad(`${TOOL_BODY} out ${i}-${j}`, 1500), j === 5 && i === 1));
		toolHeavy.push({ push: [...batch, say(`TEXT_TH_${i} progress on parser`)] }, { audit: "" });
	}
	const textMarks = Array.from({ length: 8 }, (_, i) => `TEXT_AN_${i}`);
	const textOnly: Step[] = [
		{ push: [user("Analyse the trade-offs of three caching strategies; no code changes."), ...todo([{ id: 7, subject: "Caching analysis", status: "in_progress" }])] },
		{ push: textMarks.slice(0, 4).map((m) => say(pad(m, 900))) }, { audit: "" },
		{ push: [{ id: id("jev"), type: "custom_message", customType: "jev-todo-audit", display: true, content: "[jev audit] split #7 into three tasks?" }, say(`${textMarks[4]} Rebuttal: #7 is one coherent comparison; the three strategies are already sections of one deliverable.`)] },
		{ push: textMarks.slice(5).map((m) => say(pad(m, 900))) }, { audit: "" },
		{ audit: "" },
	];
	const short: Step[] = [{ push: [user("Rename a variable in src/a.ts"), ...todo([{ id: 1, subject: "Rename", status: "in_progress" }]), say("TEXT_SH_0 renamed")] }, { audit: "" }, { audit: "" }];
	const revisions: Step[] = [
		{ push: [user("Implement src/cache.ts eviction."), ...todo([{ id: 9, subject: "Eviction", status: "in_progress" }]), say("TEXT_RV_0 started")] }, { audit: "" },
		{ push: [...todo([{ id: 9, subject: "Eviction", description: "LRU with TTL", status: "in_progress" }]), say("TEXT_RV_1 refined scope")] },
		{ push: [...todo([{ id: 9, subject: "Eviction", description: "LRU with TTL; waiting for approval", status: "pending" }]), say("TEXT_RV_2 paused")] }, { audit: "" },
		{ push: [user("Approved, continue."), ...todo([{ id: 9, subject: "Eviction", description: "LRU with TTL", status: "in_progress" }]), say("TEXT_RV_3 resumed")] }, { audit: "" },
	];
	const mixed: Step[] = [
		{ push: [user("Work on src/x.ts and src/y.ts"), ...todo([{ id: 2, subject: "X", status: "in_progress" }, { id: 3, subject: "Y", status: "pending" }]), say("TEXT_MX_0 working on x")] },
		{ omit: /granularity|task_board/ }, { audit: "" }, { answerAll: true }, { audit: "" },
	];
	const longMarks = Array.from({ length: 12 }, (_, i) => `TEXT_LG_${i}`);
	const failedChunk: Step[] = [
		{ push: [user("Review the design document in depth; analysis only."), ...todo([{ id: 4, subject: "Design review", status: "in_progress" }]), ...longMarks.map((m) => say(pad(m, 4000)))] },
		{ failNext: 3 }, { audit: "" }, { audit: "" },
	];
	return [
		{ name: "tool-heavy", ordinary: true, steps: toolHeavy, textMarkers: ["TEXT_TH_0", "TEXT_TH_1", "TEXT_TH_2"] },
		{ name: "text-only+reply", ordinary: true, steps: textOnly, textMarkers: textMarks },
		{ name: "short", ordinary: true, steps: short, textMarkers: ["TEXT_SH_0"] },
		{ name: "todo-revisions", ordinary: true, steps: revisions, textMarkers: ["TEXT_RV_0", "TEXT_RV_1", "TEXT_RV_2", "TEXT_RV_3"] },
		{ name: "mixed-cached", ordinary: true, steps: mixed, textMarkers: ["TEXT_MX_0"] },
		{ name: "failed-later-chunk", ordinary: false, steps: failedChunk, textMarkers: longMarks },
	];
}

/** Neutral valid answers so replay measures request shape, not correction delivery. */
const PREFERRED = ["unclear", "insufficient_evidence", "appropriate", "accurate", "aligned", "on_track", "idle", "not_on_board"];
const pick = (criteria: Record<string, unknown>) => PREFERRED.find((k) => Object.hasOwn(criteria, k)) ?? Object.keys(criteria)[0];

export async function runCase(c: Case): Promise<CaseMetrics> {
	const branch: unknown[] = [];
	const bodies: string[] = [];
	const m: CaseMetrics = { requests: 0, presplits: 0, receipts: 0, rejected: 0, failed: 0, bytes: 0, stateBytes: 0, questionBytes: 0, maxStatePlusQuestion: 0, questionsAsked: 0, textSeen: 0, textTotal: c.textMarkers.length, toolBodyLeaks: 0, resentBytes: 0, rollingBytes: 0, auditsWithoutRequest: 0 };
	const seen = new Set<string>();
	let pendingIds: string[] = [];
	let omit: RegExp | undefined, failAt = 0;
	const fetchFn = async (_url: unknown, init: any): Promise<Response> => {
		const body = String(init.body), req = JSON.parse(body) as Req;
		m.requests++; bodies.push(body); (globalThis as any).__cap?.push(body); m.bytes += body.length;
		const state = Buffer.byteLength(req.state), qs = Object.values(req.questions).map((q) => Buffer.byteLength(JSON.stringify(q)));
		m.stateBytes += state; m.questionBytes += qs.reduce((a, b) => a + b, 0); m.questionsAsked += qs.length;
		m.maxStatePlusQuestion = Math.max(m.maxStatePlusQuestion, state + Math.max(0, ...qs));
		// Per-record accounting: parse the evidence packet embedded in state (JSON object starting at {"records").
		const start = req.state.indexOf('{"records"'), end = req.state.indexOf("\nInterpret evidence", start);
		if (start >= 0 && end > start) {
			try {
				const packet = JSON.parse(req.state.slice(start, end));
				// Only records of an answered request count as already bought; resending after a rejection is not re-buying.
				for (const r of packet.records ?? []) if (r.kind !== "supplement" && seen.has(r.id)) m.resentBytes += Buffer.byteLength(r.text ?? "");
				pendingIds = (packet.records ?? []).filter((r: any) => r.kind !== "supplement").map((r: any) => r.id);
				if (packet.rolling) m.rollingBytes += Buffer.byteLength(JSON.stringify(packet.rolling));
			} catch { /* unparsable packet: accounted as zero, visible in bytes */ }
		}
		if (failAt && m.requests === failAt) { failAt = 0; m.failed++; return new Response("invalid question", { status: 422 }); }
		if (state + Math.max(0, ...qs) > MOCK_CAPACITY) { m.rejected++; return new Response(JSON.stringify({ detail: { error_type: "max_tokens_exceeded" } }), { status: 400 }); }
		const answers: Record<string, unknown> = {};
		for (const [k, q] of Object.entries(req.questions)) if (!omit?.test(k)) answers[k] = { choice: pick(q.criteria), confidence: 0.9 };
		for (const id of pendingIds) seen.add(id);
		return new Response(JSON.stringify({ answers, model: "jev-mock", usage: { input_tokens: Math.ceil(body.length / 4), output_tokens: 0 } }));
	};
	const original = globalThis.fetch;
	globalThis.fetch = fetchFn as typeof fetch;
	process.env.JEV_CORPUS_KEY = "sk-corpus-test-key";
	try {
		const commands = new Map<string, any>(), handlers = new Map<string, any[]>();
		const pi = {
			on: (name: string, h: any) => handlers.set(name, [...(handlers.get(name) ?? []), h]),
			registerCommand: (name: string, cmd: any) => commands.set(name, cmd),
			sendMessage: (message: any) => branch.push({ id: id("jev"), type: "custom_message", ...message }),
			appendEntry: (customType: string, data: unknown) => {
				branch.push({ id: id("custom"), type: "custom", customType, data });
				const entry = data as { kind?: string; diag?: { presplits?: number } };
				if (entry.kind === "receipt") m.receipts++;
				if (entry.kind === "diag") m.presplits += entry.diag?.presplits ?? 0;
			},
			events: { on: () => () => {} },
		} as unknown as ExtensionAPI;
		const ctx = { sessionManager: { getSessionId: () => `corpus-${c.name}`, getBranch: () => branch, buildContextEntries: () => branch }, ui: { notify: () => {} } };
		// Mock failures (422 validation, 400 overflow) are non-retryable, so host retry settings add no attempts.
		makeExtension(pi, { ...DEFAULT_CONFIG, apiKeyEnvVar: "JEV_CORPUS_KEY" });
		for (const h of handlers.get("session_start") ?? []) await h({}, ctx);
		for (const step of c.steps) {
			if ("push" in step) branch.push(...step.push);
			else if ("failNext" in step) failAt = m.requests + step.failNext;
			else if ("omit" in step) omit = step.omit;
			else if ("answerAll" in step) omit = undefined;
			else { const before = m.requests; await commands.get("jev-audit").handler(step.audit, ctx); if (m.requests === before) m.auditsWithoutRequest++; }
		}
	} finally { globalThis.fetch = original; }
	const all = bodies.join("\n");
	m.textSeen = c.textMarkers.filter((mark) => all.includes(mark)).length;
	m.toolBodyLeaks = all.split(TOOL_BODY).length - 1;
	return m;
}

export async function runCorpus() {
	const rows: Record<string, CaseMetrics> = {};
	for (const c of corpus()) rows[c.name] = await runCase(c);
	const ordinary = Object.entries(rows).filter(([k]) => corpus().find((c) => c.name === k)!.ordinary).map(([, v]) => v);
	const sum = (key: keyof CaseMetrics) => ordinary.reduce((a, r) => a + r[key], 0);
	return { rows, aggregateOrdinary: { requests: sum("requests"), bytes: sum("bytes"), stateBytes: sum("stateBytes"), questionBytes: sum("questionBytes"), questionsAsked: sum("questionsAsked") } };
}
