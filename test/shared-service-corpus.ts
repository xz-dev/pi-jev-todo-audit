/** Candidate workload runner: actual audit -> actual service -> patched Pi -> fake transport. */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import makeExtension from "../index.js";
import { DEFAULT_CONFIG } from "../config.js";
import type { ReviewResult } from "../judgment-client.js";
import { corpus, MOCK_CAPACITY, type Case, type CaseMetrics } from "./corpus.js";
import { nativeFixture } from "./shared-native-fixture.js";

// Explicit decisions for the tasks declared by this corpus. Never select a
// question's first option or fill a missing provider member after the response.
const choices: Record<string, string> = { alignment: "unclear", current_match: "not_on_board", drift: "unclear", interaction: "unclear", work_evidence: "insufficient_evidence", board_warranted: "idle" };
for (const task of [1, 2, 3, 4, 5, 7, 9]) Object.assign(choices, { [`task_status_${task}`]: "unclear", [`task_evidence_${task}`]: "insufficient_evidence", [`task_board_${task}`]: "accurate", [`task_granularity_${task}`]: "appropriate" });

export async function runCase(c: Case) {
	const branch: any[] = [], fixtureErrors: string[] = [], reviews: ReviewResult[] = [];
	const m: CaseMetrics = { requests: 0, presplits: 0, receipts: 0, rejected: 0, failed: 0, bytes: 0, stateBytes: 0, questionBytes: 0, maxStatePlusQuestion: 0, questionsAsked: 0, textSeen: 0, textTotal: c.textMarkers.length, toolBodyLeaks: 0, resentBytes: 0, rollingBytes: 0, auditsWithoutRequest: 0 };
	const seen = new Set<string>();
	let omit: RegExp | undefined, failAt = 0;
	const h = await nativeFixture((body, raw) => {
		m.requests++; m.bytes += Buffer.byteLength(raw);
		const questionBytes = Buffer.byteLength(JSON.stringify(body.questions));
		const stateBytes = Buffer.byteLength(raw) - questionBytes;
		const longest = Math.max(0, ...Object.entries(body.questions).map(([key, q]) => Buffer.byteLength(JSON.stringify({ [key]: q }))));
		m.stateBytes += stateBytes; m.questionBytes += questionBytes; m.questionsAsked += Object.keys(body.questions).length;
		m.maxStatePlusQuestion = Math.max(m.maxStatePlusQuestion, stateBytes + longest);
		// Inspect the actual wire's business projection for its overhead; never
		// reconstruct a legacy request and call that reconstructed data the wire.
		const audit = body.state.fixed.audit as string;
		const start = audit.indexOf('{"records"'), end = audit.indexOf("\nInterpret evidence", start);
		if (start < 0 || end < 0) { fixtureErrors.push("Missing actual audit projection"); throw new Error(fixtureErrors.at(-1)); }
		const packet = JSON.parse(audit.slice(start, end));
		m.rollingBytes += Buffer.byteLength(JSON.stringify(packet.rolling ?? {}));
		const present = [...body.state.evidence, ...packet.records.filter((record: any) => record.view === "global")];
		for (const record of present) if (seen.has(record.id)) m.resentBytes += Buffer.byteLength(record.text);
		if (failAt && m.requests === failAt) { failAt = 0; m.failed++; return Response.json({ error: { code: "invalid_payload" } }, { status: 422 }); }
		if (stateBytes + longest > MOCK_CAPACITY) { m.rejected++; return Response.json({ detail: { error_type: "max_tokens_exceeded" } }, { status: 400 }); }
		const answers: Record<string, unknown> = {};
		for (const [id, q] of Object.entries(body.questions) as [string, any][]) {
			if (!Object.hasOwn(choices, id) || !Object.hasOwn(q.criteria, choices[id])) { fixtureErrors.push(`Unscripted choice ${id}`); throw new Error(fixtureErrors.at(-1)); }
			if (omit?.test(id)) continue; // deliberate partial native response
			const choice = choices[id];
			answers[id] = { type: "choice", choice, confidence: 0.95, probabilities: Object.fromEntries(Object.keys(q.criteria).map((label) => [label, label === choice ? 1 : 0])) };
		}
		for (const record of present) seen.add(record.id);
		return Response.json({ answers, model: "jev-latest", usage: { input_tokens: Math.ceil(Buffer.byteLength(raw) / 4), output_tokens: 0 } });
	}, 100000, branch);
	const originalReview = h.service.review.bind(h.service);
	h.service.review = async (...args) => { const result = await originalReview(...args); reviews.push(structuredClone(result)); return result; };
	const key = Symbol.for("pi-llm-as-jev:service"), globals = globalThis as Record<symbol, unknown>;
	const previous = globals[key], owner = process.env.PI_JEV_TODO_AUDIT_OWNER_PID, fetch = globalThis.fetch;
	let directHttp = 0;
	globals[key] = h.service; process.env.PI_JEV_TODO_AUDIT_OWNER_PID = String(process.pid);
	globalThis.fetch = (() => { directHttp++; throw new Error("Consumer HTTP forbidden"); }) as unknown as typeof fetch;
	try {
		const commands = new Map<string, any>(), handlers = new Map<string, any[]>();
		const pi = {
			on: (name: string, fn: any) => handlers.set(name, [...(handlers.get(name) ?? []), fn]),
			registerCommand: (name: string, command: any) => commands.set(name, command),
			sendMessage: (message: any) => branch.push({ id: `advice-${branch.length}`, type: "custom_message", ...message }),
			appendEntry: (customType: string, data: unknown) => branch.push({ id: `audit-${branch.length}`, type: "custom", customType, data }),
			events: { on: () => () => {} },
		} as unknown as ExtensionAPI;
		const ctx = { sessionManager: { getSessionId: () => `corpus-${c.name}`, getBranch: () => branch, buildContextEntries: () => branch }, ui: { notify: () => {} } };
		makeExtension(pi, { ...DEFAULT_CONFIG, timeoutMs: 10000 });
		for (const fn of handlers.get("session_start") ?? []) await fn({}, ctx);
		for (const step of c.steps) {
			if ("push" in step) branch.push(...step.push);
			else if ("failNext" in step) failAt = m.requests + step.failNext;
			else if ("omit" in step) omit = step.omit;
			else if ("answerAll" in step) omit = undefined;
			else { const before = m.requests; await commands.get("jev-audit").handler(step.audit, ctx); if (m.requests === before) m.auditsWithoutRequest++; }
		}
		for (const fn of handlers.get("session_shutdown") ?? []) await fn({}, ctx);
	} finally {
		globalThis.fetch = fetch;
		if (previous === undefined) delete globals[key]; else globals[key] = previous;
		if (owner === undefined) delete process.env.PI_JEV_TODO_AUDIT_OWNER_PID; else process.env.PI_JEV_TODO_AUDIT_OWNER_PID = owner;
	}
	if (directHttp || fixtureErrors.length) throw new Error(`Corpus fixture failed: directHttp=${directHttp}; ${fixtureErrors.join(", ")}`);
	const all = h.wire.map((wire) => wire.raw).join("\n");
	m.textSeen = c.textMarkers.filter((marker) => all.includes(marker)).length; m.toolBodyLeaks = all.split("TOOL_BODY_MARK").length - 1;
	m.presplits = reviews.reduce((n, review) => n + (review.diagnostics.presplits ?? 0), 0);
	m.receipts = branch.filter((entry) => entry.customType === "jev-todo-audit-ledger" && entry.data.kind === "receipt").length;
	return { metrics: m, wire: h.wire, attempts: h.events, reviews, ledger: branch.filter((entry) => entry.type === "custom") };
}

export async function runCorpus() {
	const rows: Record<string, CaseMetrics> = {}, cases = corpus();
	for (const c of cases) rows[c.name] = (await runCase(c)).metrics;
	const ordinary = cases.filter((c) => c.ordinary).map((c) => rows[c.name]);
	const sum = (key: keyof CaseMetrics) => ordinary.reduce((n, row) => n + row[key], 0);
	return { rows, aggregateOrdinary: { requests: sum("requests"), bytes: sum("bytes"), stateBytes: sum("stateBytes"), questionBytes: sum("questionBytes"), questionsAsked: sum("questionsAsked") } };
}
