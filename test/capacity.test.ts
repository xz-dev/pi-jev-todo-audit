/** Legacy-engine comparison only; production capacity belongs to the shared service.
 * Migrated host assertions: real-wire R01 (rejections), classifier/none (recovery diagnostics),
 * classifier/http/full + R06 (full retry/fragments). See regression-map.md. */
import { expect, test } from "bun:test";
import { collectContext } from "../context.js";
import { reviewRolling, REPORT_RETAIN_CHARS, type Rolling } from "./legacy/rolling.js";
import { newEvaluationCache, type AuditRequest, type EvaluateOptions } from "./legacy/typesafe.js";
import { decide } from "../verdict.js";

const OVERFLOW = JSON.stringify({ detail: { error_type: "max_tokens_exceeded" } });
const user = (id: string, text: string) => ({ id, type: "message", message: { role: "user", content: text } });
const say = (id: string, text: string) => ({ id, type: "message", message: { role: "assistant", content: text } });
const pad = (mark: string, n: number) => `${mark} ` + "analysis sentence. ".repeat(Math.ceil(n / 19));
const task = { id: 4, subject: "Design review", status: "in_progress" as const };
const board = { tasks: [task], nextId: 5 };
const supplements = [{ id: "task:4", value: task }];

/** Mock provider: rejects when state + all asked questions exceed `capacity` bytes (explicit test contract, not a tokenizer). */
function provider(capacity: number, opts: { stateCap?: number; fail?: (req: AuditRequest) => boolean; choices?: Record<string, string> } = {}) {
	const requests: { req: AuditRequest; status: number }[] = [];
	const fetchFn = async (_u: string, init?: RequestInit) => {
		const req = JSON.parse(String(init!.body)) as AuditRequest;
		const state = Buffer.byteLength(req.state), size = state + Buffer.byteLength(JSON.stringify(req.questions));
		const status = size > capacity || (opts.stateCap !== undefined && state > opts.stateCap) ? 400 : opts.fail?.(req) ? 422 : 200;
		requests.push({ req, status });
		if (status === 422) return new Response("invalid question", { status });
		if (status === 400) return new Response(OVERFLOW, { status });
		const answers = Object.fromEntries(Object.entries(req.questions).map(([k, q]) => [k, { choice: opts.choices?.[k] && Object.hasOwn(q.criteria, opts.choices[k])
			? opts.choices[k] : Object.keys(q.criteria).includes("unclear") ? "unclear" : Object.keys(q.criteria)[0], confidence: 0.9 }]));
		return new Response(JSON.stringify({ answers, model: "jev-mock" }));
	};
	const opts2: EvaluateOptions = { apiUrl: "http://jev", apiKey: "sk-capacity-test", timeoutMs: 1000, cache: newEvaluationCache(), fetchFn };
	return { requests, opts: opts2 };
}
const scopedTask = (history: unknown[]) => ({ ...task, metadata: { auditBrief: {
	text: "Current authored account of the supplied design findings; analysis only, no implementation permission.",
	sources: (history as any[]).filter((e) => e.message?.role === "user").map((e) => e.id),
	covers: (history as any[]).filter((e) => e.message?.role === "assistant" && typeof e.message.content === "string").map((e) => e.id),
} } });
const review = (history: unknown[], p: ReturnType<typeof provider>, extra: Partial<Parameters<typeof reviewRolling>[0]> = {}) => {
	const commits: Rolling[] = [];
	return reviewRolling({ board, context: collectContext(history, supplements), processed: new Set(), inputKey: "k", model: "m", opts: p.opts,
		commit: (r) => (commits.push(r), true), ...extra }).then((o) => ({ ...o, commits }));
};
const longHistory = () => [user("u", "Review the design document in depth; analysis only."), ...Array.from({ length: 12 }, (_, i) => say(`a${i}`, pad(`TEXT_LG_${i}`, 4000)))];

test("F1/F2: legacy and covered primary facts stop at the same irreducible floor; a bounded account remains useful", async () => {
	for (const format of ["XML", "CSV"]) {
	const facts = `Format ${format}; malformed input rejected; rollout awaits explicit user approval.`;
	const history = [user("u", "Investigate the parser, analysis only. No rollout without approval."),
		say("decision", facts + " Technical detail. ".repeat(350)),
		say("primary", "Reported acceptance result: malformed input is rejected; rollout still awaits approval."),
		...Array.from({ length: 3 }, (_, i) => say(`routine${i}`, "Routine review detail. ".repeat(220))),
		say("last", "Current report: investigation complete, rollout not authorized."),
	];
	const admitted = provider(80_000);
	const first = await review(history, admitted);
	expect(first.final && first.complete).toBe(true);
	const next = [...history, say("new", "Recheck the format and approval boundary.")];
	const compatible = await review(next, admitted, { processed: new Set(history.map((e) => e.id)), rolling: first.commits.at(-1), inputKey: "next" });
	expect(compatible.final && compatible.complete).toBe(true);
	expect(admitted.requests.at(-1)!.req.state).toContain(facts);

	const constrained = provider(12_000);
	const stopped = await review(history, constrained);
	expect(stopped.final || stopped.complete).toBe(false);
	expect(stopped.result.ok).toBe(false);
	expect(stopped.commits.length).toBeGreaterThan(0);
	expect(stopped.commits.at(-1)?.through).not.toBe("last");
	if (!stopped.result.ok) expect(stopped.result.error).toContain("concise current report");

	// Same reports and boundary: coverage cannot remove possible primary evidence to create admission.
	const current = { ...task, metadata: { auditBrief: { text: facts + " Investigation complete; no execution is requested.",
		sources: ["u", "primary"], covers: history.filter((e) => e.message.role === "assistant").map((e) => e.id),
	} } };
	const covered = provider(12_000);
	const stillStopped = await review(history, covered, { context: collectContext(history, [{ id: "task:4", value: current }]) });
	expect(stillStopped.final || stillStopped.complete).toBe(false);
	expect(stillStopped.needsAccount).toBe(true);
	expect(stillStopped.commits.at(-1)?.through).not.toBe("last");

	// Separate positive workload: supplied public report already contains the bounded goal and outcome.
	const bounded = [history[0], say("primary", facts + " Investigation complete; rollout not authorized.")];
	const scoped = provider(12_000, { choices: { task_status_4: "blocked", task_evidence_4: "primary", task_board_4: "needs_reconciliation", interaction: "waiting_user" } });
	const boundedTask = { ...task, metadata: { auditBrief: { text: facts, sources: ["u", "primary"], covers: ["primary"] } } };
	const recovered = await review(bounded, scoped, { context: collectContext(bounded, [{ id: "task:4", value: boundedTask }]) });
	expect(recovered.final && recovered.complete).toBe(true);
	expect(recovered.commits.at(-1)?.through).toBe("primary");
	const final = scoped.requests.at(-1)!.req;
	for (const fact of [`Format ${format}`, "malformed input rejected", "rollout awaits explicit user approval"]) expect(final.state).toContain(fact);
	expect(final.questions.task_evidence_4.criteria).toHaveProperty("primary");
	const packets = scoped.requests.filter((r) => r.status === 200).map((r) => JSON.parse(r.req.state.split("Macro-level evidence (tool activity is name/call/status only):\n")[1].split("\nInterpret evidence chronologically:")[0]));
	for (const e of bounded) {
		const supplied = packets.flatMap((p) => p.records).find((r: any) => r.id === e.id);
		expect(supplied?.text).toBe(e.message.content);
	}
	if (recovered.result.ok) {
		const action = decide(recovered.result.answers, board, 0.8, 1, [], { context: recovered.context, terminalStop: true });
		expect(action.kind).toBe("inject");
		if (action.kind === "inject") {
			expect(action.text).toContain("pending and record the evidenced blocker");
			expect(action.text).toContain("Evidence [primary]");
			expect(action.text).toContain("BOARD ONLY");
			expect(action.corrections.every((c) => c.bookkeeping && !c.execution)).toBe(true);
		}
	}
	}
});

test("covered long history still stops when retained primary obligations cannot fit", async () => {
	const p = provider(24_000);
	const history = longHistory();
	const context = collectContext(history, [{ id: "task:4", value: scopedTask(history) }]);
	const out = await review(history, p, { context });
	expect(out.final).toBe(false); expect(out.needsAccount).toBe(true); expect(out.result.ok).toBe(false);
	expect(out.commits.length).toBeGreaterThan(0);
	const through = out.commits.at(-1)!.through!;
	expect(through).not.toBe("a11");
	const last = p.requests.at(-1)!.req;
	for (const e of history.slice(1, history.findIndex((e) => e.id === through) + 1)) {
		expect(last.state).toContain(e.message.content);
	}
	// Only answered recent packets establish coverage; rejected packets cannot complete later reports.
	const packets = p.requests.filter((r) => r.status === 200).map((r) => JSON.parse(r.req.state.split("Macro-level evidence (tool activity is name/call/status only):\n")[1].split("\nInterpret evidence chronologically:")[0]));
	expect(packets.flatMap((p) => p.records).some((r: any) => r.id === "a11" && r.view === "recent")).toBe(false);
	const envelope = (r: typeof p.requests[number]) => JSON.stringify([r.req.state, r.req.questions]);
	const rejected = p.requests.filter((r) => r.status === 400).map(envelope);
	expect(new Set(rejected).size).toBe(rejected.length);
});

test("one oversized message is covered by ordered labelled fragments and counts as processed only after its last fragment", async () => {
	const p = provider(14_000);
	const big = Array.from({ length: 40 }, (_, i) => `PART_${String(i).padStart(2, "0")} ` + "detail ".repeat(60)).join("");
	const out = await review([user("u", "Analyse this."), say("huge", big)], p);
	expect(out.final).toBe(true);
	const answered = p.requests.filter((r) => r.status === 200).map((r) => r.req.state).join("\n");
	for (let i = 0; i < 40; i++) expect(answered).toContain(`PART_${String(i).padStart(2, "0")}`);
	expect(answered).toContain("ordered fragment 0-");
	// No receipt claims `huge` before its final fragment was reviewed.
	const throughHuge = out.commits.filter((c) => c.through === "huge");
	expect(throughHuge).toHaveLength(1); expect(throughHuge[0].inputKey).toBe("k");
	// The fragmented record is not repeated whole as a retained report afterwards.
	expect(p.requests.filter((r) => r.status === 200).every((r) => !r.req.state.includes(big))).toBe(true);
});

test("F2: a fragmented user constraint cannot disappear to make later work fit", async () => {
	const p = provider(14_000);
	const big = Array.from({ length: 40 }, (_, i) => `USER_PART_${String(i).padStart(2, "0")} ` + "detail ".repeat(60)).join("");
	const first = [user("huge-user", big), say("a1", "Working on it.")];
	const out = await review(first, p);
	expect(out.final).toBe(false); // The user was reviewed in fragments, but later required work cannot fit with its constraint.
	const receipt = out.commits.at(-1)!;
	expect(receipt.through).toBe("huge-user");
	const before = p.requests.length;
	const second = await review([...first, say("a2", "Design analysis finished.")], p,
		{ processed: new Set(["huge-user"]), rolling: receipt, inputKey: "k2" });
	expect(second.final).toBe(false); expect(second.result.ok).toBe(false);
	const later = p.requests.slice(before);
	expect(later.length).toBeGreaterThan(0);
	expect(later.every((r) => r.req.state.includes(big))).toBe(true);
	if (!second.result.ok) expect(second.result.error).toContain("concise current report");
	expect(receipt.oversized).toEqual(["huge-user"]); // Progress metadata cannot cover or supersede a user constraint.
});

test("a long user constraint that fits is still retained on later audits", async () => {
	const p = provider(60_000);
	const constraint = "USER_CONSTRAINT no deployment without approval. " + "scope detail. ".repeat(450); // ~6,000 chars
	expect(constraint.length).toBeGreaterThan(REPORT_RETAIN_CHARS);
	const first = [user("long-user", constraint), say("a1", "Working on it.")];
	const out = await review(first, p);
	expect(out.final).toBe(true); expect(out.commits.at(-1)!.oversized).toBeUndefined();
	const before = p.requests.length;
	await review([...first, say("a2", "Done with the analysis.")], p, { processed: new Set(["long-user", "a1"]), rolling: out.commits.at(-1)!, inputKey: "k2" });
	const later = p.requests.slice(before);
	expect(later.length).toBeGreaterThan(0);
	expect(later.every((r) => r.req.state.includes("USER_CONSTRAINT no deployment without approval"))).toBe(true);
});

test("question-dominated overflow splits independent questions over one frozen state and merges only same-state answers", async () => {
	const p = provider(4_000);
	const out = await review([user("u", "Rename a variable.")], p);
	expect(out.final).toBe(true); expect(out.recovered).toBe(true);
	const ok = p.requests.filter((r) => r.status === 200);
	expect(new Set(ok.map((r) => r.req.state)).size).toBe(1); // every batch evaluated the same frozen state
	const asked = ok.flatMap((r) => Object.keys(r.req.questions));
	expect(new Set(asked).size).toBe(asked.length); // no question paid twice
});

test("fixed state or a single question that cannot fit terminates with an actionable diagnostic and no advice", async () => {
	const p = provider(100);
	const out = await review([user("u", "Short.")], p);
	expect(out.final).toBe(false); expect(out.result.ok).toBe(false);
	expect(!out.result.ok && out.result.error).toContain("ask the main agent for a concise current report");
	expect(p.requests.map((r) => Object.keys(r.req.questions).length)).toEqual([9, 5, 3, 2, 1]); // stops at the first rejected single question
	const envelopes = p.requests.map((r) => JSON.stringify([r.req.state, Object.keys(r.req.questions)]));
	expect(new Set(envelopes).size).toBe(envelopes.length); // never the same rejected envelope twice
	expect(out.commits).toHaveLength(0);
});

test("a later piece failure never re-buys earlier admitted pieces; resumption pays only the unfinished work", async () => {
	let failing = true;
	const p = provider(80_000, { fail: (req) => failing && req.state.includes("TEXT_LG_9") });
	const history = longHistory();
	const context = collectContext(history, [{ id: "task:4", value: scopedTask(history) }]);
	const first = await review(history, p, { context, pieces: (rs) => rs.map((r) => [r]) });
	expect(first.final).toBe(false);
	const paidBefore = p.requests.filter((r) => r.status === 200).flatMap((r) => [...r.req.state.matchAll(/TEXT_LG_(\d+)/g)].map((m) => m[1]));
	expect(paidBefore).toContain("0");
	failing = false;
	const through = first.commits.at(-1)!.through!;
	const processed = new Set(history.map((e) => e.id).slice(0, history.findIndex((e) => e.id === through) + 1));
	const n = p.requests.length;
	const admitted = p.requests.filter((r) => r.status === 200).map((r) => JSON.stringify([r.req.state, r.req.questions]));
	const second = await review(history, p, { context, processed, rolling: first.commits.at(-1), pieces: (rs) => rs.map((r) => [r]) });
	expect(second.final).toBe(true);
	for (const r of p.requests.slice(n)) expect(admitted).not.toContain(JSON.stringify([r.req.state, r.req.questions]));
	const resent = p.requests.slice(n).map((r) => r.req.state).join("\n");
	for (const id of new Set(paidBefore)) if (Number(id) < 8) expect(resent).toContain(`${pad(`TEXT_LG_${id}`, 4000)}`); // needed facts remain, completed pairs are not rebought
	expect(resent).toContain("TEXT_LG_9"); expect(resent).toContain("TEXT_LG_11");
});


test("a failure in a later fragment of one record resumes without re-paying earlier fragments", async () => {
	const big = Array.from({ length: 40 }, (_, i) => `PART_${String(i).padStart(2, "0")} ` + "detail ".repeat(60)).join("");
	let failing = true;
	const p = provider(14_000, { fail: (req) => failing && req.state.includes("PART_39") });
	const history = [user("u", "Analyse this."), say("huge", big)];
	const first = await review(history, p);
	expect(first.final).toBe(false);
	expect(first.commits.some((c) => c.through === "huge")).toBe(false); // not covered yet
	const paid = p.requests.filter((r) => r.status === 200).map((r) => r.req.state);
	failing = false;
	const n = p.requests.length;
	const receipt = first.commits.at(-1);
	const processed = new Set(receipt?.through ? ["u"] : []);
	const second = await review(history, p, { processed, rolling: receipt });
	expect(second.final).toBe(true);
	const again = p.requests.slice(n).map((r) => r.req.state);
	for (const state of again) expect(paid).not.toContain(state); // no completed stage bought twice
	expect(again.every((s) => !s.includes("PART_00 "))).toBe(true); // resumed past fragments already answered
	expect(second.commits.at(-1)).toMatchObject({ through: "huge", inputKey: "k" });
});


test("admitted covered tiny reports retain every primary candidate, not a newest-first crop", async () => {
	const p = provider(80_000);
	const history = [user("u", "Do the design review."), ...Array.from({ length: 160 }, (_, i) => say(`a${i}`, "ok"))];
	const context = collectContext(history, [{ id: "task:4", value: scopedTask(history) }]);
	const first = await review(history, p, { context });
	expect(first.final).toBe(true);
	const before = p.requests.length;
	const second = await review([...history, say("new", "Design review finished.")], p,
		{ context: collectContext([...history, say("new", "Design review finished.")], [{ id: "task:4", value: scopedTask(history) }]),
			processed: new Set(history.map((e) => e.id)), rolling: first.commits.at(-1)!, inputKey: "k2" });
	expect(second.final).toBe(true); expect(second.result.ok).toBe(true);
	const later = p.requests.slice(before);
	expect(later.filter((r) => r.status === 400)).toHaveLength(0); // fits the capacity that text-only budgeting blew past
	const retained = later.filter((r) => r.status === 200).map((r) => r.req.state).join("\n");
	for (let i = 0; i < 160; i++) {
		expect(retained).toContain(`\"id\":\"a${i}\"`);
		expect(later.at(-1)!.req.questions.task_evidence_4.criteria).toHaveProperty(`a${i}`);
	}
	expect(retained).not.toContain("declared-covered ancillary reports");
	expect(retained).toContain("Design review finished.");
});
