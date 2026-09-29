/** Rolling review: processed input is remembered as conclusions, not resent raw. */
import { beforeEach, expect, test } from "bun:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import makeExtension from "../index.js";
import { DEFAULT_CONFIG } from "../config.js";
import { collectContext } from "../context.js";
import { reviewRolling, REPORT_RETAIN_CHARS, type Rolling } from "../rolling.js";
import { newEvaluationCache, type AuditRequest } from "../typesafe.js";

let requests: AuditRequest[] = [];
let failWhen: ((req: AuditRequest) => boolean) | undefined;
let omit: RegExp | undefined;
beforeEach(() => {
	requests = []; failWhen = undefined; omit = undefined;
	process.env.JEV_ROLLING_KEY = "sk-rolling-test";
	globalThis.fetch = (async (_u: unknown, init: any) => {
		const req = JSON.parse(init.body) as AuditRequest; requests.push(req);
		if (failWhen?.(req)) return new Response("invalid question", { status: 422 });
		const answers = Object.fromEntries(Object.entries(req.questions).filter(([k]) => !omit?.test(k))
			.map(([k, q]) => [k, { choice: Object.keys(q.criteria).includes("unclear") ? "unclear" : Object.keys(q.criteria)[0], confidence: 0.9 }]));
		return new Response(JSON.stringify({ answers, model: "jev-1.13" }));
	}) as unknown as typeof fetch;
});

const user = (id: string, text: string) => ({ id, type: "message", message: { role: "user", content: text } });
const review = (history: unknown[], extra: Partial<Parameters<typeof reviewRolling>[0]> = {}) => {
	const commits: Rolling[] = [];
	return reviewRolling({ board, context: collectContext(history, supplements), processed: new Set(), inputKey: "k", model: "m", opts: opts(),
		commit: (r) => (commits.push(r), true), ...extra }).then((o) => ({ ...o, commits }));
};
const say = (id: string, text: string) => ({ id, type: "message", message: { role: "assistant", content: text } });
const tool = (id: string, body: string) => [
	{ id: `${id}a`, type: "message", message: { role: "assistant", content: [{ type: "toolCall", id: `${id}c`, name: "bash", arguments: { command: body } }] } },
	{ id: `${id}r`, type: "message", message: { role: "toolResult", toolCallId: `${id}c`, toolName: "bash", content: body } },
];
const task = { id: 5, subject: "Parser", status: "in_progress" as const, description: "Blocked: waiting for schema approval" };
const boardEntry = { id: "board", type: "message", message: { role: "toolResult", toolName: "todo", content: "ok", details: { tasks: [task], nextId: 6 } } };
const board = { tasks: [task], nextId: 6 };
const supplements = [{ id: "task:5", value: task }];
const opts = () => ({ apiUrl: "http://jev", apiKey: "sk-rolling-direct", timeoutMs: 1000, cache: newEvaluationCache() });

test("an earlier reported blocker and user decision survive a later opinion update; opinions and progress stay separate", async () => {
	const first = [user("u1", "Only analyse; do not deploy."), say("r1", "Stage 1 done. Blocker: schema approval pending from owner.")];
	const commits: Rolling[] = [];
	const o = opts();
	const run1 = await reviewRolling({ board, context: collectContext(first, supplements), processed: new Set(), inputKey: "k1", model: "m", opts: o, commit: (r) => (commits.push(r), true) });
	expect(run1.final).toBe(true); expect(commits).toHaveLength(1); expect(commits[0].through).toBe("r1");
	const second = [...first, ...tool("t1", "SECRET_TOOL_BODY"), say("r2x", "Comparing option B.")];
	const run2 = await reviewRolling({ board, context: collectContext(second, supplements), processed: new Set(["u1", "r1"]), rolling: commits[0], inputKey: "k2", model: "m", opts: o, commit: (r) => (commits.push(r), true) });
	expect(run2.final).toBe(true);
	const state = requests[1].state;
	// Reported work is carried as authored, not replaced by a cursor or a Choice label.
	expect(state).toContain("Blocker: schema approval pending"); expect(state).toContain("Only analyse; do not deploy.");
	expect(state).toContain("retained from processed range");
	const packet = run2.context;
	expect(packet.rolling?.progress).toEqual({ processedThrough: "r1", final: true });
	expect(Object.keys(packet.rolling?.opinions ?? {})).toContain("task_status_5");
	// Task body is serialized once (as its supplement), never twice.
	expect(state.split("Blocked: waiting for schema approval").length - 1).toBe(1);
	expect(state).not.toContain("SECRET_TOOL_BODY");
});

test("processed raw ranges are not appended again: the oversized report is dropped as a clarification note", async () => {
	const big = "x".repeat(REPORT_RETAIN_CHARS + 1);
	const history = [user("u1", "Analyse caches."), say("a1", "Old analysis ONE."), say("a2", "Old analysis TWO."), say("a3", `Huge report ${big}`), say("a4", "New piece.")];
	const run = await reviewRolling({ board, context: collectContext(history, supplements), processed: new Set(["u1", "a1", "a2", "a3"]),
		rolling: { through: "a3", inputKey: "old", opinions: {}, answerKeys: [] }, inputKey: "new", model: "m", opts: opts(), commit: () => true });
	const state = requests[0].state;
	expect(state).not.toContain(big);
	expect(state).toContain("New piece."); expect(state).toContain("Analyse caches.");
	expect(run.context.rolling?.reportNote).toContain("ask the main agent for a concise current account");
});

test("unchanged input sends nothing; a failed receipt write does not advance progress", async () => {
	const history = [user("u1", "Analyse."), say("a1", "Done part one.")];
	const commits: Rolling[] = [];
	const o = opts();
	await reviewRolling({ board, context: collectContext(history, supplements), processed: new Set(), inputKey: "k", model: "m", opts: o, commit: (r) => (commits.push(r), true) });
	const again = await reviewRolling({ board, context: collectContext(history, supplements), processed: new Set(["u1", "a1"]), rolling: commits[0], inputKey: "k", model: "m", opts: o, commit: () => true });
	expect(again.unchanged).toBe(true); expect(requests).toHaveLength(1);
	// Not durable: the stored receipt is untouched, so the same work is still unprocessed next time.
	const attempted: Rolling[] = [];
	const nd = await reviewRolling({ board, context: collectContext([...history, say("a2", "Part two.")], supplements), processed: new Set(["u1", "a1"]), rolling: commits[0], inputKey: "k2", model: "m", opts: o, commit: (r) => (attempted.push(r), false) });
	expect(nd.final).toBe(true); expect(attempted).toHaveLength(1);
	expect(commits).toHaveLength(1); expect(commits[0].through).toBe("a1"); // the durable frontier did not move
	// Next time the same piece is still unprocessed, but its answers are already cached: no new provider work.
	const before = requests.length;
	await reviewRolling({ board, context: collectContext([...history, say("a2", "Part two.")], supplements), processed: new Set(["u1", "a1"]), rolling: commits[0], inputKey: "k2", model: "m", opts: o, commit: () => true });
	expect(requests.length).toBe(before);
});

test("chunk 3 failure keeps chunks 1/2; resumption sends only unresolved work and no intermediate result is final", async () => {
	const history = [user("u1", "Analyse."), say("p1", "PIECE-ONE"), say("p2", "PIECE-TWO"), say("p3", "PIECE-THREE")];
	const context = collectContext(history, supplements);
	const pieces = (rs: any[]) => rs.map((r) => [r]);
	const commits: Rolling[] = [];
	const o = opts();
	failWhen = (req) => req.state.includes("PIECE-THREE");
	const failed = await reviewRolling({ board, context, processed: new Set(), inputKey: "k", model: "m", opts: o, pieces, commit: (r) => (commits.push(r), true) });
	expect(failed.final).toBe(false); expect(failed.result.ok).toBe(false);
	expect(commits.map((c) => c.through)).toEqual(["u1", "p1", "p2"]);
	expect(commits.every((c) => c.inputKey === "k:partial")).toBe(true); // intermediate receipts never stand in for a final review
	const before = requests.length;
	failWhen = undefined;
	const resumed = await reviewRolling({ board, context, processed: new Set(["u1", "p1", "p2"]), rolling: commits.at(-1), inputKey: "k", model: "m", opts: o, pieces, commit: (r) => (commits.push(r), true) });
	expect(resumed.final).toBe(true);
	const sent = requests.slice(before);
	expect(sent).toHaveLength(1);
	expect(sent[0].state).toContain("PIECE-THREE");
	// Retained reports are re-sent as the compact account; the fragmented large piece is never repeated whole.
	expect(commits.at(-1)).toMatchObject({ through: "p3", inputKey: "k" });
});

test("partial answers keep completed ones, do not advance, and a retry sends only the missing questions", async () => {
	const history = [user("u1", "Analyse."), say("a1", "Part one.")];
	const commits: Rolling[] = [];
	const o = opts();
	omit = /task_granularity_5/;
	const partial = await reviewRolling({ board, context: collectContext(history, supplements), processed: new Set(), inputKey: "k", model: "m", opts: o, commit: (r) => (commits.push(r), true) });
	expect(commits).toHaveLength(0); expect(partial.unchanged).toBe(false);
	omit = undefined;
	await reviewRolling({ board, context: collectContext(history, supplements), processed: new Set(), inputKey: "k", model: "m", opts: o, commit: (r) => (commits.push(r), true) });
	expect(Object.keys(requests[1].questions)).toEqual(["task_granularity_5"]);
	expect(commits).toHaveLength(1);
});

test("host: later audits send only new records plus retained reports; a failed stage delivers nothing and resumes from the durable frontier", async () => {
	const branch: unknown[] = [user("u1", "Implement parser."), boardEntry, say("a1", "OLD-ANALYSIS about approach A."), ...tool("t1", "BODY")];
	const handlers = new Map<string, any[]>(), commands = new Map<string, any>(), sent: unknown[] = [];
	const pi = {
		on: (n: string, h: any) => handlers.set(n, [...(handlers.get(n) ?? []), h]),
		registerCommand: (n: string, c: any) => commands.set(n, c),
		sendMessage: (m: unknown) => sent.push(m),
		appendEntry: (customType: string, data: unknown) => branch.push({ id: `c${branch.length}`, type: "custom", customType, data }),
		events: { on: () => () => {} },
	} as unknown as ExtensionAPI;
	const ctx = { sessionManager: { getSessionId: () => "s", getBranch: () => branch, buildContextEntries: () => branch }, ui: { notify: () => {} } };
	makeExtension(pi, { ...DEFAULT_CONFIG, apiKeyEnvVar: "JEV_ROLLING_KEY" });
	for (const h of handlers.get("session_start") ?? []) await h({}, ctx);
	await commands.get("jev-audit").handler("", ctx);
	branch.push(say("a2", "NEW-ANALYSIS about approach B."));
	await commands.get("jev-audit").handler("", ctx);
	expect(requests).toHaveLength(2);
	expect(requests[1].state).toContain("NEW-ANALYSIS"); expect(requests[1].state).toContain("Implement parser.");
	expect(requests[1].state).not.toContain('"tool":"bash","call":"t1c"'); // processed tool activity is not resent
	// A failed stage delivers nothing and does not advance the durable frontier.
	const receipts = () => branch.filter((e: any) => e.type === "custom" && e.data?.kind === "receipt").length;
	const before = receipts();
	branch.push(say("a3", "LATER-WORK."));
	failWhen = () => true;
	await commands.get("jev-audit").handler("", ctx);
	expect(sent).toHaveLength(0); expect(receipts()).toBe(before);
	failWhen = undefined;
	await commands.get("jev-audit").handler("", ctx);
	const retry = requests.at(-1)!.state;
	expect(retry).toContain("LATER-WORK."); // only unreviewed input is new; earlier small reports are retained as the compact account
	expect(receipts()).toBe(before + 1);
});

test("a short reply does not silently replace a still-applicable earlier report", async () => {
	const reports = [
		user("u", "Analyse the rollout plan; report only."),
		say("blocker", "Investigation complete; rollout awaits security approval."),
		say("ack", "Acknowledged."),
		say("new", "Re-checking the approval path now."),
	];
	const first = await review(reports);
	const before = first.result;
	const second = await review([...reports, say("new2", "Still waiting on approval.")], {
		processed: new Set(reports.map((r) => r.id)), rolling: first.commits.at(-1)!, inputKey: "k2",
	});
	const state = JSON.stringify(second.context.records);
	expect(state).toContain("rollout awaits security approval");
	expect(state).toContain("Acknowledged.");
	expect(second.context.rolling?.reportNote).toBeUndefined();
});

test("only the reports that fit the compact budget are retained, newest first", async () => {
	// The budget covers the serialized record (metadata included): ~2,100 bytes of envelope per report
	// here, so only the newest fits inside REPORT_RETAIN_CHARS; the rest are disclosed as omitted.
	const pad = (s: string) => s + " " + "x".repeat(REPORT_RETAIN_CHARS / 2 - 50); // ~half the TEXT budget each
	const reports = [
		user("u", "Analyse; report only."),
		say("r1", pad("report one has many findings.")),
		say("r2", pad("report two has more findings.")),
		say("r3", pad("report three newest findings.")),
	];
	const first = await review(reports);
	const second = await review([...reports, say("a9", "new small report.")], {
		processed: new Set(reports.map((r) => r.id)), rolling: first.commits.at(-1)!, inputKey: "k2",
	});
	const state = JSON.stringify(second.context.records);
	expect(state).toContain("new small report."); expect(state).toContain("report three newest findings.");
	expect(state).not.toContain("report one has many findings."); expect(state).not.toContain("report two has more findings.");
	expect(second.context.rolling?.reportNote).toContain("omitted by the compact report budget");
});
