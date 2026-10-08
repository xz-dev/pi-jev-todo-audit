/** Legacy rolling-engine comparison; production uses reviewShared and the service.
 * The migrated incremental/failed-stage host guarantee runs as both real-wire R16 cases. */
import { beforeEach, expect, test } from "bun:test";
import { collectContext } from "../context.js";
import { reviewRolling, REPORT_RETAIN_CHARS, type Rolling } from "./legacy/rolling.js";
import { newEvaluationCache, type AuditRequest } from "./legacy/typesafe.js";

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

test("F1: XML and CSV remain distinguishable in the next packet after routine reports exceed 4K", async () => {
	const next: AuditRequest[] = [];
	for (const format of ["XML", "CSV"]) {
		const history = [user("u", "Compare formats for #5; rollout requires approval."),
			say("format", `Chosen format: ${format}. ` + "Detailed findings. ".repeat(110)),
			...Array.from({ length: 4 }, (_, i) => say(`routine${i}`, "Routine progress update. ".repeat(100))),
		];
		const first = await review(history);
		const prior = first.commits.at(-1)!;
		const second = await review([...history, say("new", "Check whether the account still fits the agreed format.")], {
			processed: new Set(history.map((e) => e.id)), rolling: prior, inputKey: "next",
		});
		expect(second.final && second.complete).toBe(true);
		const request = requests.at(-1)!;
		expect(request.state).toContain(`Chosen format: ${format}.`);
		expect(request.questions.task_evidence_5.criteria).toHaveProperty("format");
		next.push(request);
	}
	expect(next[0].state).not.toBe(next[1].state);
});

test("F2: an old brief cannot erase a later user decision, another task or a needed primary report", async () => {
	const history = [user("u", "Analyse both tasks; report only."), say("anchor", "PRIMARY_REPORT: investigation complete, schema still XML." + "x".repeat(4500)),
		say("other", "OTHER_TASK_FACT: task 6 requires a distinct schema." + "y".repeat(4500)), user("latest", "Use CSV for #5 and await approval. Do not change #6."), say("new", "Reviewing the updated scope.")];
	const first = await review(history);
	const scoped = { ...task, metadata: { auditBrief: { text: "Older report: XML and ready.", sources: ["u"], covers: ["anchor", "other"] } } };
	const other = { ...task, id: 6, description: "OTHER_TASK_CURRENT", status: "pending" as const };
	const context = collectContext(history, [{ id: "task:5", value: scoped }, { id: "task:6", value: other }]);
	const prior = { ...first.commits.at(-1)!, opinions: { ...first.commits.at(-1)!.opinions, task_evidence_5: { choice: "anchor", confidence: 0.95 } } };
	await review([], { board: { tasks: [scoped, other], nextId: 7 }, context, processed: new Set(["u", "anchor", "other", "latest"]), rolling: prior, inputKey: "updated" });
	const state = requests.at(-1)!.state;
	for (const text of ["PRIMARY_REPORT", "OTHER_TASK_FACT", "OTHER_TASK_CURRENT", "Use CSV for #5 and await approval"]) expect(state).toContain(text);
	expect(state.indexOf("Use CSV for #5 and await approval")).toBeGreaterThan(state.indexOf("PRIMARY_REPORT"));
	expect(state).toContain("later user scope/permission decisions supersede earlier plans");
	// Even when all task accounts declare coverage, the prior primary anchor must remain supplied.
	const single = collectContext(history, [{ id: "task:5", value: scoped }]);
	await review([], { context: single, processed: new Set(["u", "anchor", "other", "latest"]), rolling: prior, inputKey: "primary" });
	expect(requests.at(-1)!.state).toContain("PRIMARY_REPORT");
	expect(requests.at(-1)!.questions.task_evidence_5.criteria).toHaveProperty("anchor");
});

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

test("F1: a processed uncovered report is retained even beyond the ancillary budget", async () => {
	const big = "x".repeat(REPORT_RETAIN_CHARS + 1);
	const history = [user("u1", "Analyse caches."), say("a1", "Old analysis ONE."), say("a2", "Old analysis TWO."), say("a3", `Huge report ${big}`), say("a4", "New piece.")];
	const run = await reviewRolling({ board, context: collectContext(history, supplements), processed: new Set(["u1", "a1", "a2", "a3"]),
		rolling: { through: "a3", inputKey: "old", opinions: {}, answerKeys: [] }, inputKey: "new", model: "m", opts: opts(), commit: () => true });
	const state = requests[0].state;
	expect(state).toContain(big);
	expect(state).toContain("New piece."); expect(state).toContain("Analyse caches.");
	expect(run.context.rolling?.reportNote).toBeUndefined();
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

test("F4: chunk 3 failure keeps completed ranges, qualified facts and gaps; resumption sends only unresolved work", async () => {
	const history = [user("u1", "Analyse; do not deploy."), say("p1", "PIECE-ONE: XML chosen."),
		say("p2", "PIECE-TWO: malformed input rejected."), say("p3", "PIECE-THREE: rollout awaits approval.")];
	const text = "XML chosen; malformed input rejected; rollout awaits approval.";
	const scoped = { ...task, metadata: { auditBrief: { text, sources: ["u1", "p1", "gone"], covers: ["p1", "p2"] } } };
	const context = collectContext(history, [{ id: "task:5", value: scoped }]);
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
	for (const fact of ["XML chosen", "malformed input rejected", "rollout awaits approval"]) expect(sent[0].state).toContain(fact);
	for (const req of requests) {
		expect(req.state.split(text).length - 1).toBe(1);
		expect(req.state).toContain('"role":"reported","valid":false');
		expect(req.state).toContain('"id":"gone","reason":"source unavailable"');
	}
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

test("P1/F1: processed covered reports retain potential primary eligibility without a prior pin", async () => {
	const pad = (s: string) => s + " " + "x".repeat(REPORT_RETAIN_CHARS / 2 - 50);
	const reports = [
		user("u", "Analyse; report only."),
		say("r1", pad("report one has many findings.")),
		say("r2", pad("report two has more findings.")),
		say("r3", pad("report three newest findings.")),
	];
	const first = await review(reports);
	const scoped = { ...task, metadata: { auditBrief: { text: "Current account represents all three reported findings; awaiting approval.", sources: ["u"], covers: ["r1", "r2", "r3"] } } };
	const context = collectContext([...reports, say("a9", "new small report.")], [{ id: "task:5", value: scoped }]);
	const second = await review([], { context,
		processed: new Set(reports.map((r) => r.id)), rolling: first.commits.at(-1)!, inputKey: "k2",
	});
	const state = requests.at(-1)!.state;
	expect(state).toContain("new small report."); expect(state).toContain("report three newest findings.");
	for (const [id, text] of [["r1", "report one has many findings."], ["r2", "report two has more findings."], ["r3", "report three newest findings."]]) {
		expect(state).toContain(text);
		expect(requests.at(-1)!.questions.task_evidence_5.criteria).toHaveProperty(id);
	}
	expect(state).toContain("Current account represents all three reported findings");
	expect(second.context.rolling?.reportNote).toBeUndefined();
});
