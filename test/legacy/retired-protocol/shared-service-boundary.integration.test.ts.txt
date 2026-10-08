/** Opt-in acceptance traces: actual service and patched Pi, raw wire bodies only. */
import { expect, test } from "bun:test";
import { nativeFixture as fixture } from "./shared-native-fixture.js";
import { collectContext, contextVersion } from "../context.js";
import { decide } from "../verdict.js";
import { reviewShared } from "../shared-review.js";
import { processedEntries, type Rolling } from "../rolling.js";
import { restoreLedger, LEDGER_TYPE } from "../ledger.js";
import type { ReviewStageProjection } from "../judgment-client.js";

const root = process.env.PI_JUDGMENT_SOURCE;
const piRoot = process.env.PI_CLASSIFIER_SOURCE;
const enabled = !!root && !!piRoot;
const q = { type: "choice" as const, instructions: "Select", criteria: { yes: "Yes", no: "No" } };
const success = (body: any, omit: string[] = [], confidence = 0.9) => Response.json({
	answers: Object.fromEntries(Object.entries(body.questions).filter(([id]) => !omit.includes(id)).map(([id, value]) => {
		const keys = Object.keys((value as any).criteria), choice = keys.includes("unclear") ? "unclear" : keys[0];
		return [id, { type: "choice", choice, confidence, probabilities: Object.fromEntries(keys.map((key) => [key, key === choice ? 1 : 0])) }];
	})), usage: { input_tokens: 10 },
});

for (const partial of [true, false]) test.skipIf(!enabled)(`R16: incremental ${partial ? "partial stages" : "single stage"} preserves source facts and resumes only unfinished work`, async () => {
	let split = false, fail = false;
	const h = await fixture((body) => {
		const ids = body.state.evidence.map((e: any) => e.id);
		if (split && ids.length > 1) return Response.json({ detail: { error_type: "max_tokens_exceeded" } }, { status: 400 });
		if (fail && ids.includes("new-last")) return Response.json({ error: { code: "invalid_payload" } }, { status: 400 });
		return success(body);
	});
	const sources: any[] = [
		{ id: "old-user", type: "message", message: { role: "user", content: "XML only; no deployment permission." } },
		{ id: "old-report", type: "message", message: { role: "assistant", content: "SOURCE_FACT_X: parser accepts XML; waiting for approval." } },
		{ id: "old-call", type: "message", message: { role: "assistant", content: [{ type: "toolCall", id: "c1", name: "bash", arguments: { command: "PRIVATE_TOOL_BODY" } }] } },
		{ id: "old-result", type: "message", message: { role: "toolResult", toolName: "bash", toolCallId: "c1", content: "PRIVATE_TOOL_BODY" } },
	];
	const task = { id: 5, subject: "Parser", status: "in_progress" as const };
	let rolling: Rolling | undefined;
	const run = () => {
		const context = collectContext(sources, [{ id: "task:5", value: task }], true);
		const index = sources.findIndex((s) => s.id === rolling?.through);
		return reviewShared({ service: h.service, board: { tasks: [task], nextId: 6 }, context, inputKey: contextVersion(context), rolling,
			processed: new Set(sources.slice(0, index + 1).map((s) => s.id)), threshold: 0.5, timeoutMs: 3000, signal: new AbortController().signal,
			commit: (next) => { rolling = JSON.parse(JSON.stringify(next)); h.rows.push({ type: "custom", customType: LEDGER_TYPE, data: { kind: "receipt", receipt: rolling } }); return true; } });
	};
	expect((await run()).complete).toBe(true);
	expect(h.wire).toHaveLength(1);
	sources.push({ id: "new-one", type: "message", message: { role: "assistant", content: "Another XML case checked." } });
	if (!partial) expect((await run()).complete).toBe(true);
	sources.push({ id: "new-last", type: "message", message: { role: "assistant", content: "Approval still missing." } });
	const receiptsAtFailure = h.rows.filter((row) => row.data?.kind === "receipt").length;
	split = true; fail = true;
	const failed = await run();
	expect(failed.review.answers).toEqual({});
	expect(failed.final).toBe(false); expect(rolling?.through).toBe("new-one");
	const receiptsBefore = h.rows.filter((row) => row.data?.kind === "receipt").length;
	if (!partial) expect(receiptsBefore).toBe(receiptsAtFailure);
	const incremental = h.wire.slice(1);
	expect(incremental.every(({ body }) => body.state.evidence.every((e: any) => !e.id.startsWith("old-")))).toBe(true);
	expect(incremental.every(({ body }) => JSON.stringify(body.state.fixed).includes("SOURCE_FACT_X"))).toBe(true);
	const before = h.wire.length;
	fail = false; h.service.refreshBranch(); rolling = restoreLedger(h.rows);
	expect((await run()).complete).toBe(true);
	expect(h.wire.slice(before).map(({ body }) => body.state.evidence.map((e: any) => e.id))).toEqual([["new-last"]]);
	if (!partial) expect(h.rows.filter((row) => row.data?.kind === "receipt")).toHaveLength(receiptsBefore + 1);
	expect(h.rows.filter((row) => row.data?.kind === "receipt" && row.data.receipt.through === "new-last")).toHaveLength(1);
	expect(rolling?.through).toBe("new-last"); expect(JSON.stringify(h.wire)).not.toContain("PRIVATE_TOOL_BODY");
	const after = h.wire.length;
	expect((await run()).review.diagnostics.attemptCount).toBe(0);
	expect(h.wire).toHaveLength(after);
});

test.skipIf(!enabled)("R02: compaction gaps and id-less authority are new evidence, not covered by an old frontier", async () => {
	let workEvidence = "user";
	const h = await fixture((body) => {
		const choices: Record<string, string> = { alignment: "aligned", current_match: "5", drift: "on_track", interaction: "waiting_user", task_status_5: "still_ongoing", task_evidence_5: "kept", task_board_5: "accurate", task_granularity_5: "appropriate", work_evidence: workEvidence };
		return Response.json({ answers: Object.fromEntries(Object.entries(body.questions).map(([id, q]: [string, any]) => {
			if (!Object.hasOwn(choices, id)) throw new Error(`Unscripted question ${id}`);
			const choice = choices[id];
			return [id, { type: "choice", choice, confidence: 0.9, probabilities: Object.fromEntries(Object.keys(q.criteria).map((label) => [label, label === choice ? 1 : 0])) }];
		})), usage: { input_tokens: 10 } });
	});
	const task = { id: 5, subject: "Parser", status: "in_progress" as const, metadata: { auditBrief: { text: "XML investigation; waiting for approval.", sources: ["user", "origin", "kept"], covers: ["kept"] } } };
	const branch: any[] = [
		{ id: "user", type: "message", message: { role: "user", content: "Investigate only; no rollout without approval." } },
		{ id: "origin", type: "message", message: { role: "assistant", content: "CHOSEN_FORMAT: XML after comparing both." } },
		{ id: "kept", type: "message", message: { role: "assistant", content: "Kept report: still blocked on approval." } },
		{ id: "latest", type: "message", message: { role: "user", content: "Re-check XML; still awaiting approval." } },
	];
	let visible = branch.slice(), rolling: Rolling | undefined;
	const receipts: Rolling[] = [];
	const run = () => {
		const context = collectContext(visible, [{ id: "task:5", value: task }], true);
		return reviewShared({ service: h.service, board: { tasks: [task], nextId: 6 }, context, inputKey: contextVersion(context), rolling,
			processed: processedEntries(branch, rolling?.through) ?? new Set(), threshold: 0.5, timeoutMs: 3000, signal: new AbortController().signal,
			commit: (next) => {
				if (!processedEntries(branch, next.through)) return false;
				rolling = structuredClone(next); receipts.push(rolling);
				branch.push({ type: "custom", customType: LEDGER_TYPE, data: { kind: "receipt", receipt: rolling } }); return true;
			} });
	};
	expect((await run()).complete).toBe(true); expect(receipts).toHaveLength(1);
	visible = [{ id: "compact", type: "compaction", summary: "Raw details unavailable." }, branch[2],
		{ type: "message", message: { role: "user", content: "LEGACY_AUTHORITY: id-less user still decides." } }, branch[3]];
	h.service.refreshBranch(); rolling = restoreLedger(branch);
	const failed = await run();
	expect(failed.review.stopReason).toBe("error"); expect(failed.review.answers).toEqual({});
	expect(failed.review.unresolved).toEqual(["work_evidence"]);
	const wire = h.wire[1].body;
	expect(wire.state.evidence.some((r: any) => r.id === "compact")).toBe(true);
	expect(wire.state.evidence.some((r: any) => r.text.includes("LEGACY_AUTHORITY") && r.metadata.kind === "user" && r.metadata.protected)).toBe(true);
	expect(JSON.stringify(wire)).not.toContain("CHOSEN_FORMAT");
	expect(wire.questions.task_evidence_5.criteria).not.toHaveProperty("origin");
	expect(wire.questions.task_evidence_5.criteria).toHaveProperty("kept");
	expect(failed.context.factualMaterial!["task:5"].valid).toBe(false);
	expect(failed.context.factualMaterial!["task:5"].sources).toContainEqual({ id: "origin", role: "unavailable" });
	expect(receipts).toHaveLength(1);
	workEvidence = "latest"; h.service.refreshBranch(); rolling = restoreLedger(branch);
	const resumed = await run();
	expect(resumed.review.stopReason).toBe("stop"); expect(Object.keys(h.wire[2].body.questions)).toEqual(["work_evidence"]);
	expect(receipts).toHaveLength(1); expect(rolling?.through).toBe("latest");
	const beforeRepeat = h.wire.length;
	expect((await run()).review.diagnostics.attemptCount).toBe(0); expect(h.wire).toHaveLength(beforeRepeat);
});

test.skipIf(!enabled)("native missing member is not a final answer or durable stage; only that member is retried", async () => {
	let omit = true;
	const h = await fixture((body) => success(body, omit ? ["C"] : [], 0.7));
	const request = { state: {}, questions: { A: q, B: q, C: q } };
	const first = await h.service.review(request, { minConfidence: 0.8 });
	expect(first.stopReason).toBe("error"); expect(first.answers).toEqual({}); expect(first.progress.stages).toEqual([]); expect(first.unresolved).toEqual(["C"]);
	expect(h.rows.some((r) => r.data.kind === "review-stage")).toBe(false);
	h.service.refreshBranch(); omit = false;
	const next = await h.service.review(request, { minConfidence: 0.8 });
	expect(Object.keys(h.wire[1].body.questions)).toEqual(["C"]);
	expect(next.stopReason).toBe("stop"); expect(next.dropped.sort()).toEqual(["A", "B", "C"]);
	expect(next.reuse.hits).toBe(2); expect(next.diagnostics.attemptCount).toBe(1);
});

test.skipIf(!enabled)("explicit local withholding keeps independent final choices without advancing coverage", async () => {
	const h = await fixture((body) => success(body));
	const result = await h.service.review({ state: {}, questions: { A: q, B: q } }, {
		projectionRevision: "withhold-test/1", projectStage: () => ({ state: {}, questions: { A: q }, unresolved: ["B"] }),
	});
	expect(Object.keys(h.wire[0].body.questions)).toEqual(["A"]);
	expect(result.stopReason).toBe("stop"); expect(Object.keys(result.answers)).toEqual(["A"]);
	expect(result.unresolved).toEqual(["B"]); expect(result.progress.stages).toEqual([]);
});

for (const count of [1, 6, 69]) test.skipIf(!enabled)(`${count} records and 12 questions get one fixed-state admission; diagnostics match exact wire bytes`, async () => {
	const h = await fixture(async (body) => Response.json({ ...await success(body).json(), usage: { input_tokens: Math.ceil(Buffer.byteLength(JSON.stringify(body)) * 0.34) } }), 32000);
	const req = { state: { facts: "context ".repeat(8000) }, questions: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`q${i}`, q])),
		evidence: Array.from({ length: count }, (_, i) => ({ id: `e${i}`, text: `record ${i}` })) };
	const result = await h.service.review(req);
	expect(result.stopReason).toBe("stop"); expect(h.wire).toHaveLength(1);
	expect(h.wire[0].body.state.evidence).toHaveLength(count); expect(Object.keys(h.wire[0].body.questions)).toHaveLength(12);
	expect(h.events.map((e) => e.phase)).toEqual(["start", "end"]);
	expect(result.diagnostics.attemptCount).toBe(1);
	const attempt = result.diagnostics.attempts[0];
	expect(attempt.stateBytes! + attempt.questionBytes!).toBe(h.wire[0].bytes);
	expect(result.diagnostics.usage.outputTokens).toEqual({ knownSum: 0, missing: 1 });
	expect(result.diagnostics.usage.costUsd).toEqual({ knownSum: 0, missing: 1 });
	expect((await h.service.review(req)).diagnostics.attemptCount).toBe(0);
	expect(h.wire).toHaveLength(1);
});

test.skipIf(!enabled)("same fresh token resumes after reload; a new token buys new work and token text never persists", async () => {
	let omit = true;
	const h = await fixture((body) => success(body, omit ? ["B"] : []));
	const req = { state: {}, questions: { A: q, B: q } };
	const fresh = "private-first-fresh-token";
	expect((await h.service.review(req, { fresh })).stopReason).toBe("error");
	h.service.refreshBranch(); omit = false;
	expect((await h.service.review(req, { fresh })).stopReason).toBe("stop");
	expect(Object.keys(h.wire[1].body.questions)).toEqual(["B"]);
	expect((await h.service.review(req, { fresh })).diagnostics.attemptCount).toBe(0);
	expect((await h.service.review(req, { fresh: "different-fresh-token" })).diagnostics.attemptCount).toBe(1);
	expect(Object.keys(h.wire.at(-1)!.body.questions)).toEqual(["A", "B"]);
	expect(JSON.stringify(h.rows)).not.toContain(fresh);
	expect(JSON.stringify(h.rows)).not.toContain("different-fresh-token");
});

test.skipIf(!enabled)("unfinished transport remains explicit at deadline; late settlement cannot change receipts or returned accounting", async () => {
	let release!: (r: Response) => void;
	let enter!: () => void;
	const entered = new Promise<void>((resolve) => { enter = resolve; });
	const h = await fixture(() => { enter(); return new Promise<Response>((resolve) => { release = resolve; }); });
	const pending = h.service.review({ state: {}, questions: { A: q } }, { timeoutMs: 40 });
	await entered;
	const result = await pending;
	expect(result.stopReason).toBe("error"); expect(result.answers).toEqual({});
	expect(h.signals[0].aborted).toBe(true);
	expect(result.diagnostics.attemptCount).toBe(1);
	expect(result.diagnostics.attempts[0].phase).toBe("start");
	expect(result.diagnostics.usage.inputTokens).toEqual({ knownSum: 0, missing: 1 });
	const saved = JSON.stringify(result), rows = JSON.stringify(h.rows);
	release(success(h.wire[0].body)); await new Promise((resolve) => setTimeout(resolve, 10));
	expect(JSON.stringify(result)).toBe(saved); expect(JSON.stringify(h.rows)).toBe(rows);
});

test.skipIf(!enabled)("cancelled joiner owns no provider attempt and cannot cancel the owner's transport", async () => {
	let release!: (r: Response) => void, enter!: () => void;
	const entered = new Promise<void>((resolve) => { enter = resolve; });
	const h = await fixture(() => { enter(); return new Promise<Response>((resolve) => { release = resolve; }); });
	const req = { state: {}, questions: { A: q } };
	const owner = h.service.review(req); await entered;
	const ac = new AbortController();
	const joined = h.service.review(req, { signal: ac.signal });
	await new Promise((resolve) => setTimeout(resolve, 10)); ac.abort();
	const cancelled = await joined;
	expect(cancelled.stopReason).toBe("aborted"); expect(cancelled.reuse.joined).toBe(1);
	expect(cancelled.diagnostics.attemptCount).toBe(0); expect(h.signals[0].aborted).toBe(false);
	release(success(h.wire[0].body));
	expect((await owner).stopReason).toBe("stop"); expect(h.wire).toHaveLength(1);
});

test.skipIf(!enabled)("R01: irreducible retained facts stop at the first leaf and rejected wires stay rejected after reload", async () => {
	let reject = false;
	const h = await fixture((body) => reject ? Response.json({ detail: { error_type: "max_tokens_exceeded" } }, { status: 400 }) : success(body));
	const sources = [
		{ id: "user", type: "message", message: { role: "user", content: "Investigate #5 only; no rollout without approval." } },
		{ id: "needed", type: "message", message: { role: "assistant", content: "OLD_REQUIRED_FORMAT: XML; approval pending. " + "detail ".repeat(700) } },
	];
	const task = { id: 5, subject: "Parser", status: "in_progress" as const };
	let rolling: Rolling | undefined;
	const run = () => {
		const context = collectContext(sources, [{ id: "task:5", value: task }], true);
		return reviewShared({ service: h.service, board: { tasks: [task], nextId: 6 }, context, inputKey: contextVersion(context), rolling,
			processed: processedEntries(sources, rolling?.through) ?? new Set(),
			threshold: 0.5, timeoutMs: 3000, signal: new AbortController().signal,
			commit: (receipt) => { rolling = structuredClone(receipt); h.rows.push({ type: "custom", customType: LEDGER_TYPE, data: { kind: "receipt", receipt } }); return true; } });
	};
	expect((await run()).complete).toBe(true);
	const receipt = JSON.stringify(rolling), before = h.wire.length;
	for (let i = 0; i < 6; i++) sources.push({ id: `later${i}`, type: "message", message: { role: "assistant", content: `New stage ${i}` } });
	reject = true;
	const failed = await run();
	expect(failed.review.stopReason).toBe("error"); expect(failed.review.answers).toEqual({}); expect(failed.needsAccount).toBe(true);
	expect(JSON.stringify(rolling)).toBe(receipt);
	const attempts = h.wire.slice(before);
	expect(h.rows.filter((row) => row.data.kind === "rejected")).toHaveLength(attempts.length);
	expect(attempts.every(({ body }) => JSON.stringify(body.state.fixed).includes("OLD_REQUIRED_FORMAT"))).toBe(true);
	const leaves = attempts.filter(({ body }) => body.state.evidence.length === 1);
	expect(leaves.length).toBeGreaterThan(0);
	expect(leaves.every(({ body }) => body.state.evidence[0].id.startsWith("later0"))).toBe(true);
	const after = h.wire.length;
	h.service.refreshBranch(); rolling = restoreLedger(h.rows);
	expect((await run()).review.stopReason).toBe("error"); expect(h.wire).toHaveLength(after);
});

test.skipIf(!enabled)("R06: mid-record full recovery reuses completed fragments without claiming the whole source", async () => {
	const text = Array.from({ length: 40 }, (_, i) => `PART_${String(i).padStart(2, "0")} ` + "detail ".repeat(60)).join("");
	let failing = true;
	const status: number[] = [];
	const h = await fixture((body) => {
		const bytes = Buffer.byteLength(JSON.stringify(body));
		const code = bytes > 14_000 ? 400 : failing && body.state.evidence.some((r: any) => r.text.includes("PART_39")) ? 422 : 200;
		status.push(code);
		if (code === 400) return Response.json({ detail: { error_type: "max_tokens_exceeded" } }, { status: code });
		if (code === 422) return Response.json({ error: { code: "invalid_payload" } }, { status: code });
		return success(body);
	});
	const sources = [{ id: "user", type: "message", message: { role: "user", content: "Analyse only; no execution authorized." } },
		{ id: "huge", type: "message", message: { role: "assistant", content: text } }];
	const task = { id: 5, subject: "Parser", status: "in_progress" as const };
	const receipts: Rolling[] = [];
	let rolling: Rolling | undefined;
	const run = () => {
		const context = collectContext(sources, [{ id: "task:5", value: task }], true);
		return reviewShared({ service: h.service, board: { tasks: [task], nextId: 6 }, context, inputKey: contextVersion(context), rolling,
			processed: processedEntries(sources, rolling?.through) ?? new Set(), fresh: "full-fragments", threshold: 0.5, timeoutMs: 3000, signal: new AbortController().signal,
			commit: (next) => { rolling = structuredClone(next); receipts.push(rolling); h.rows.push({ type: "custom", customType: LEDGER_TYPE, data: { kind: "receipt", receipt: rolling } }); return true; } });
	};
	const first = await run();
	expect(first.review.answers).toEqual({}); expect(status).toContain(200);
	expect(status).toContain(422); // reach the later fragment, not an invented fixed-state floor
	expect(receipts.every((receipt) => receipt.through !== "huge")).toBe(true);
	const paid = h.wire.filter((_, index) => status[index] === 200).map(({ body }) => JSON.stringify(body.state));
	const before = h.wire.length;
	failing = false; h.service.refreshBranch(); rolling = restoreLedger(h.rows);
	const resumed = await run();
	expect(resumed.complete).toBe(true); expect(h.wire.length).toBeGreaterThan(before);
	for (const { body } of h.wire.slice(before)) expect(paid).not.toContain(JSON.stringify(body.state));
	expect(h.wire.slice(before).every(({ body }) => !JSON.stringify(body.state).includes("PART_00"))).toBe(true);
	expect(h.wire.slice(before).some(({ body }) => JSON.stringify(body.state).includes("PART_39"))).toBe(true);
	expect(receipts.at(-1)?.through).toBe("huge");
	const pieces = new Map<number, { end: number; text: string }>();
	for (const [i, { body }] of h.wire.entries()) if (status[i] === 200) for (const r of body.state.evidence) {
		if (r.fragmentBounds?.of === "huge") pieces.set(r.fragmentBounds.start, { end: r.fragmentBounds.end, text: r.text });
	}
	let end = 0, rebuilt = "";
	for (const [start, part] of [...pieces].sort(([a], [b]) => a - b)) { expect(start).toBe(end); end = part.end; rebuilt += part.text; }
	expect(rebuilt).toBe(text); expect(end).toBe(text.length);
});

for (const outcome of ["actually_completed", "actionable_now"]) test.skipIf(!enabled)(`R06 safety: fragment loss cannot authorize ${outcome}`, async () => {
	for (const limit of [14_000, 100_000]) {
		const h = await fixture((body) => {
			if (Buffer.byteLength(JSON.stringify(body)) > limit) return Response.json({ detail: { error_type: "max_tokens_exceeded" } }, { status: 400 });
			const seesConstraint = JSON.stringify(body.state).includes("EARLY_CONSTRAINT");
			const choices: Record<string, string> = { alignment: "aligned", current_match: "5", drift: "on_track", interaction: seesConstraint ? "waiting_user" : "working", task_status_5: seesConstraint ? "blocked" : outcome, task_evidence_5: "user", task_board_5: "accurate", task_granularity_5: "appropriate", work_evidence: "user" };
			return Response.json({ answers: Object.fromEntries(Object.entries(body.questions).map(([id, q]: [string, any]) => {
				if (!Object.hasOwn(choices, id) || !Object.hasOwn(q.criteria, choices[id])) throw new Error(`Unscripted ${id}`);
				return [id, { type: "choice", choice: choices[id], confidence: 0.95, probabilities: Object.fromEntries(Object.keys(q.criteria).map((key) => [key, key === choices[id] ? 1 : 0])) }];
			})) });
		});
		const task = { id: 5, subject: "Parser", status: "in_progress" as const }, board = { tasks: [task], nextId: 6 };
		const sources = [{ id: "user", type: "message", message: { role: "user", content: "Investigate the parser acceptance scope before deciding what to do next." } },
			{ id: "report", type: "message", message: { role: "assistant", content: "EARLY_CONSTRAINT: security approval is still missing and the acceptance scope is NOT complete. " + "analysis detail ".repeat(1200) + "The last check passed; this tail looks ready to complete or continue." } }];
		const context = collectContext(sources, [{ id: "task:5", value: task }], true);
		const result = await reviewShared({ service: h.service, board, context, inputKey: contextVersion(context), processed: new Set(),
			threshold: 0.5, timeoutMs: 3000, signal: new AbortController().signal, commit: () => true,
			stop: { stopKind: "AI_UNLOCK", reasonType: "JOB_DONE" } });
		expect(result.result.ok).toBe(true);
		if (!result.result.ok) throw new Error("Expected an inspectable final judgment");
		const action = decide(result.result.answers, board, 0.5, 1, [], { context: result.context, serviceAccepted: true, terminalStop: true });
		expect(action.kind).not.toBe("inject");
		if (limit === 14_000) {
			expect(JSON.stringify(h.wire.at(-1)!.body.state)).not.toContain("EARLY_CONSTRAINT");
			expect(result.context.globalComplete).toBe(false);
			expect(result.context.omissions.some((gap) => gap.reason.includes("fragment"))).toBe(true);
		} else {
			expect(JSON.stringify(h.wire.at(-1)!.body.state)).toContain("EARLY_CONSTRAINT");
			expect(result.review.answers.task_status_5).toMatchObject({ choice: "blocked" });
		}
	}
});

test.skipIf(!enabled)("R15: channel learning and exact rejections survive reload; fresh work reports real pre-splits", async () => {
	const statuses: number[] = [];
	const h = await fixture(async (body) => {
		const state = Buffer.byteLength(JSON.stringify(body.state));
		const longest = Math.max(...Object.values(body.questions).map((q) => Buffer.byteLength(JSON.stringify(q))));
		const status = state + longest > 24_000 ? 400 : 200; statuses.push(status);
		if (status === 400) return Response.json({ detail: { error_type: "max_tokens_exceeded" } }, { status });
		return Response.json({ ...await success(body).json(), usage: { input_tokens: Math.ceil(Buffer.byteLength(JSON.stringify(body)) / 4) } });
	});
	const request = { state: {}, questions: { A: q, B: q }, evidence: Array.from({ length: 8 }, (_, i) => ({ id: `source-${i}`, text: `TEXT_${i}: ` + "x".repeat(4000) })) };
	const initial = await h.service.review(request);
	expect(initial.stopReason).toBe("stop"); expect(statuses).toContain(400);
	const count = h.wire.length;
	h.service.refreshBranch();
	const full = await h.service.review(request, { fresh: "full-reload" });
	expect(full.stopReason).toBe("stop"); expect(h.wire.length).toBeGreaterThan(count);
	expect(full.diagnostics.rejectedReuses).toBeGreaterThan(0);
	expect(statuses.slice(count)).not.toContain(400);
	// Different complete identity cannot hit the exact rejected-envelope digest.
	// Avoiding its otherwise-rejected large request therefore needs restored size learning.
	const changed = { ...request, questions: { A: { ...q, instructions: "Select now" }, B: q } };
	const beforeChanged = h.wire.length; h.service.refreshBranch();
	const learned = await h.service.review(changed, { fresh: "changed-full" });
	expect(learned.stopReason).toBe("stop"); expect(h.wire.length).toBeGreaterThan(beforeChanged);
	expect(statuses.slice(beforeChanged)).not.toContain(400);
	expect(learned.diagnostics.presplits).toBeGreaterThan(0);
	expect(learned.diagnostics.channel).toMatch(/^[a-f0-9]{64}$/);
	expect(learned.diagnostics.channel).toBe(initial.diagnostics.channel);
	expect([initial, full, learned].reduce((n, r) => n + r.diagnostics.attemptCount, 0)).toBe(h.wire.length);
	expect(h.events.filter((event) => event.phase === "start")).toHaveLength(h.wire.length);
	const capacity = h.rows.filter((row) => row.data.kind === "capacity");
	expect(capacity.every((row) => row.data.channel === learned.diagnostics.channel)).toBe(true);
	expect(capacity.some((row) => row.data.attempt.outcome === "overflow")).toBe(true);
	expect(capacity.some((row) => row.data.attempt.outcome === "answered" && row.data.attempt.inputTokens > 0)).toBe(true);
});

test.skipIf(!enabled)("R10: failed service appends cannot acknowledge durable stages or avoid payment after reload", async () => {
	const h = await fixture((body) => success(body));
	const request = { state: { fact: "must remain available" }, questions: { A: q }, evidence: [{ id: "source", text: "Required public fact" }] };
	const progress: unknown[] = [];
	h.failWrites(true);
	const first = await h.service.review(request, { onProgress: (stage) => { progress.push(stage); } });
	expect(first.stopReason).toBe("stop"); expect(h.wire).toHaveLength(1); expect(h.rows).toHaveLength(0);
	expect(first.progress.stages.length).toBeGreaterThan(0);
	expect(first.progress.stages.every((stage) => !stage.durable)).toBe(true);
	expect(progress).toHaveLength(0);
	expect(first.diagnostics.attemptCount).toBe(1);
	expect(first.diagnostics.attempts[0]).toMatchObject({ phase: "end", status: 200, inputTokens: 10 });
	expect(first.diagnostics.usage.outputTokens).toEqual({ knownSum: 0, missing: 1 });
	h.failWrites(false); h.service.refreshBranch();
	const second = await h.service.review(request);
	expect(second.stopReason).toBe("stop"); expect(second.diagnostics.attemptCount).toBe(1); expect(h.wire).toHaveLength(2);
	expect(second.progress.stages.every((stage) => stage.durable)).toBe(true);
	h.service.refreshBranch();
	expect((await h.service.review(request)).diagnostics.attemptCount).toBe(0); expect(h.wire).toHaveLength(2);
});

test.skipIf(!enabled)("projection cannot silently omit a required question or ambiguously mark it unresolved", async () => {
	const projections: ReviewStageProjection[] = [{ state: {}, questions: { A: q } }, { state: {}, questions: { A: q, B: q }, unresolved: ["B"] }];
	for (const projected of projections) {
		const h = await fixture(body => success(body));
		const result = await h.service.review({ state: {}, questions: { A: q, B: q } }, {
			projectionRevision: "required/1", projectStage: () => projected,
		});
		expect(result.stopReason).toBe("error"); expect(result.answers).toEqual({});
		expect(result.progress.stages).toEqual([]); expect(h.wire).toHaveLength(0);
	}
});

test.skipIf(!enabled)("all questions explicitly withheld produce no request and no coverage", async () => {
	const h = await fixture(body => success(body));
	const result = await h.service.review({ state: {}, questions: { A: q } }, {
		projectionRevision: "all-withheld/1", projectStage: () => ({ state: {}, questions: {}, unresolved: ["A"] }),
	});
	expect(result.stopReason).toBe("stop"); expect(result.answers).toEqual({}); expect(result.unresolved).toEqual(["A"]);
	expect(result.progress.stages).toEqual([]); expect(h.wire).toHaveLength(0);
});

test.skipIf(!enabled)("projection descriptor mutations cannot replace original sources or forge bounds", async () => {
	const h = await fixture(body => success(body));
	const result = await h.service.review({ state: {}, questions: { A: q }, evidence: [{ id: "source", text: "ORIGINAL_FACT", metadata: { role: "user" } }] }, {
		projectionRevision: "immutable/1", projectStage: (stage) => {
			const mutable = stage as any;
			mutable.evidence[0].record.text = "FORGED_FACT"; mutable.evidence[0].record.metadata.role = "assistant";
			mutable.evidence[0].bounds = { of: "fake", start: 0, end: 1, total: 1 };
			return { state: {}, questions: { A: q } };
		},
	});
	expect(result.stopReason).toBe("stop"); expect(h.wire[0].body.state.evidence[0]).toMatchObject({ id: "source", text: "ORIGINAL_FACT", metadata: { role: "user" } });
	expect(h.wire[0].body.state.evidence[0].fragmentBounds).toBeUndefined();
});

test.skipIf(!enabled)("throwing and asynchronously rejecting projectors fail without dispatch or unhandled rejection", async () => {
	for (const projectStage of [() => { throw new Error("bad projector"); }, () => Promise.reject(new Error("late projector"))]) {
		const h = await fixture(body => success(body));
		const result = await h.service.review({ state: {}, questions: { A: q } }, { projectionRevision: "invalid/1", projectStage: projectStage as any });
		expect(result.stopReason).toBe("error"); expect(result.answers).toEqual({}); expect(h.wire).toHaveLength(0);
		await new Promise(resolve => setTimeout(resolve, 0));
	}
});

test.skipIf(!enabled)("pre-abort stages survive, a switched branch receives no late writes, and reload pays only unfinished work", async () => {
	let enter!: () => void, reject!: (error: Error) => void, hang = true;
	const entered = new Promise<void>(resolve => { enter = resolve; });
	const h = await fixture(body => {
		const sources = body.state.evidence;
		if (sources.length > 1) return Response.json({ detail: { error_type: "max_tokens_exceeded" } }, { status: 400 });
		if (sources[0].id === "third" && hang) { enter(); return new Promise<Response>((_resolve, fail) => { reject = fail; }); }
		return success(body);
	});
	const req = { state: {}, questions: { A: q }, evidence: ["first", "second", "third"].map(id => ({ id, text: id })) };
	const progress: any[] = [];
	const pending = h.service.review(req, { onProgress: stage => { progress.push(stage); } });
	await entered;
	expect(progress).toHaveLength(2); expect(progress.every(stage => stage.durable && !stage.final)).toBe(true);
	const oldBranch = structuredClone(h.rows); h.rows.splice(0); h.service.refreshBranch();
	const stopped = await pending;
	expect(stopped.stopReason).toBe("aborted"); expect(stopped.answers).toEqual({}); expect(stopped.progress.stages).toHaveLength(2);
	expect(h.signals.at(-1)!.aborted).toBe(true);
	const saved = JSON.stringify(stopped); reject(new Error("late discarded transport failure"));
	await new Promise(resolve => setTimeout(resolve, 10));
	expect(h.rows).toHaveLength(0); expect(JSON.stringify(stopped)).toBe(saved); expect(progress).toHaveLength(2);
	h.rows.push(...oldBranch); h.service.refreshBranch(); hang = false;
	const before = h.wire.length, resumed = await h.service.review(req);
	expect(resumed.stopReason).toBe("stop"); expect(h.wire.slice(before).map(w => w.body.state.evidence.map((e: any) => e.id))).toEqual([["third"]]);
});

test.skipIf(!enabled)("locally withheld task evidence does not suppress an independently supported sibling correction", async () => {
	const otherTasks = Array.from({ length: 256 }, (_, i) => ({ id: i + 100, subject: `Earlier task ${i}`, status: "completed" as const }));
	const tasks = [
		{ id: 5, subject: "Uncertain scope", status: "in_progress" as const, blockedBy: otherTasks.map(task => task.id) },
		{ id: 7, subject: "Verified parser report", status: "in_progress" as const }, ...otherTasks,
	];
	const sources = [
		{ id: "user", type: "message", message: { role: "user", content: "Audit #5 and #7. Bookkeeping only; no new execution." } },
		{ id: "report", type: "message", message: { role: "assistant", content: "All acceptance checks for #7 passed. #5 remains uncertain. Reconcile #7 only." } },
	];
	const h = await fixture(async body => {
		const response = await success(body).json();
		for (const [id, choice] of [["task_status_5", "actually_completed"], ["task_status_7", "actually_completed"], ["task_evidence_7", "report"]]) {
			if (!Object.hasOwn(body.questions[id]?.criteria ?? {}, choice)) throw new Error(`Missing fixture choice ${id}/${choice}`);
			response.answers[id] = { type: "choice", choice, confidence: 0.99, probabilities: Object.fromEntries(Object.keys(body.questions[id].criteria).map(key => [key, key === choice ? 1 : 0])) };
		}
		return Response.json(response);
	});
	const context = collectContext(sources, tasks.map(task => ({ id: `task:${task.id}`, value: task })), true), board = { tasks, nextId: 400 };
	const receipts: Rolling[] = [];
	const result = await reviewShared({ service: h.service, board, context, inputKey: contextVersion(context), processed: new Set(), threshold: 0.5, timeoutMs: 3000,
		signal: new AbortController().signal, commit: receipt => { receipts.push(receipt); return true; } });
	expect(result.review.stopReason).toBe("stop"); expect(result.complete).toBe(false); expect(receipts).toHaveLength(0);
	expect(result.review.unresolved).toContain("task_evidence_5");
	expect(h.wire.every(w => !Object.hasOwn(w.body.questions, "task_evidence_5"))).toBe(true);
	if (!result.result.ok) throw new Error(result.result.error);
	const action = decide(result.result.answers, board, 0.99, 10, [], { context: result.context, serviceAccepted: true, terminalStop: true });
	expect(action.kind).toBe("inject");
	if (action.kind === "inject") {
		expect(action.corrections).toHaveLength(1); expect(action.corrections[0].text).toContain("#7");
		expect(action.text).toContain("#5 — evidence uncertain"); expect(action.text).toContain("BOARD ONLY");
		expect(action.corrections[0].execution).toBe(false);
	}
});

test.skipIf(!enabled)("provider error bodies never enter review errors or persisted diagnostics", async () => {
	const h = await fixture(() => Response.json({ error: { code: "invalid_payload", message: "PRIVATE_SOURCE_TEXT_ECHO" } }, { status: 400 }));
	const result = await h.service.review({ state: {}, questions: { A: q } });
	expect(result.stopReason).toBe("error"); expect(result.contextOverflow).not.toBe(true);
	expect(JSON.stringify(result)).not.toContain("PRIVATE_SOURCE_TEXT_ECHO");
	expect(JSON.stringify(h.rows)).not.toContain("PRIVATE_SOURCE_TEXT_ECHO");
	expect(h.wire).toHaveLength(1);
});
