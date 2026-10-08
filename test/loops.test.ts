import { expect, test } from "bun:test";
import { collectContext } from "../context.js";
import { groupLoops, loopsAfter, packLoops, type Loop } from "../loops.js";

const user = (id: string, content: string) => ({ id, type: "message", message: { role: "user", content } });
const assistant = (id: string, content: unknown) => ({ id, type: "message", message: { role: "assistant", content } });
const call = (id: string, callId: string, name = "probe") => assistant(id, [{ type: "text", text: `calling ${name}` }, { type: "toolCall", id: callId, name, arguments: {} }]);
const result = (id: string, callId: string, isError = false) => ({ id, type: "message", message: { role: "toolResult", toolName: "probe", toolCallId: callId, isError, content: [{ type: "text", text: "ok" }] } });

test("groups assistant message + its tool results into one loop; user opens a new loop", () => {
	const entries = [
		user("u1", "Do the thing."),
		call("a1", "c1"), result("r1", "c1"),
		assistant("a2", "Done."),
		user("u2", "Now the other thing."),
		assistant("a3", [{ type: "toolCall", id: "c2", name: "probe", arguments: {} }, { type: "toolCall", id: "c3", name: "probe", arguments: {} }]),
		result("r2", "c2"), result("r3", "c3", true),
	];
	const loops = groupLoops(collectContext(entries).records);
	expect(loops.map((l) => l.id)).toEqual(["u1", "a1", "a2", "u2", "a3"]);
	expect(loops.every((l) => l.complete)).toBe(true);
	const a3 = loops.find((l) => l.id === "a3")!;
	expect(a3.records.map((r) => r.kind)).toEqual(["tool_call", "tool_call", "tool_result", "tool_result"]);
	expect(a3.bytes).toBeGreaterThan(0);
});

test("a loop with a pending tool call is incomplete and excluded from loopsAfter", () => {
	const entries = [user("u1", "Go."), call("a1", "c1"), result("r1", "c1"), call("a2", "c2")];
	const loops = groupLoops(collectContext(entries).records);
	expect(loops.map((l) => [l.id, l.complete])).toEqual([["u1", true], ["a1", true], ["a2", false]]);
	expect(loopsAfter(loops, undefined).map((l) => l.id)).toEqual(["u1", "a1"]);
	expect(loopsAfter(loops, "u1").map((l) => l.id)).toEqual(["a1"]);
	expect(loopsAfter(loops, "a1")).toEqual([]);
	// Cursor not on the branch: nothing is judged until the caller reconciles.
	expect(loopsAfter(loops, "missing")).toEqual([]);
});

test("compaction summary and aborted turn are ordinary records, never loop boundaries that split a call from its result", () => {
	const entries = [
		{ id: "s", type: "compaction", summary: "Earlier work summarized." },
		call("a1", "c1"),
		{ id: "err", type: "message", message: { role: "assistant", content: [{ type: "text", text: "" }], stopReason: "error" } },
		result("r1", "c1"),
	];
	const loops = groupLoops(collectContext(entries).records);
	expect(loops[0].id).toBe("s");
	const a1 = loops.find((l) => l.id === "a1")!;
	expect(a1.complete).toBe(true);
    expect(a1.records.some((r) => r.kind === "tool_result")).toBe(true);
});

const mk = (id: string, bytes: number): Loop => ({ id, index: 0, records: [], complete: true, bytes });

test("packLoops fits whole loops within the declared limit and reports the remainder", () => {
	const loops = [mk("l1", 1000), mk("l2", 1000), mk("l3", 1000)];
	const limits = { stateAndLongestQuestion: 1500, request: 4000, tokensPerByte: 1, envelopeOverheadBytes: 0 };
	const packed = packLoops(loops, 400, limits);
	expect(packed.loops.map((l) => l.id)).toEqual(["l1"]);
	expect(packed.remaining.map((l) => l.id)).toEqual(["l2", "l3"]);
	expect(packed.limitTokens).toBe(1500);
	expect(packed.oversize).toBeUndefined();
});

test("packLoops reports oversize when the first loop alone cannot fit", () => {
	const packed = packLoops([mk("big", 5000), mk("l2", 10)], 100, { contextWindow: 2000, tokensPerByte: 1, envelopeOverheadBytes: 0 });
	expect(packed.loops).toEqual([]);
	expect(packed.oversize?.id).toBe("big");
	expect(packed.remaining.map((l) => l.id)).toEqual(["big", "l2"]);
});

test("packLoops without a declared limit falls back to a bounded loop count and no limit", () => {
	const loops = Array.from({ length: 12 }, (_, i) => mk(`l${i}`, 100));
	const packed = packLoops(loops, 0, { tokensPerByte: 0.5, envelopeOverheadBytes: 0 }, 5);
	expect(packed.loops.length).toBe(5);
	expect(packed.remaining.length).toBe(7);
	expect(packed.limitTokens).toBeUndefined();
});

test("envelope overhead and output reserve count against the limit", () => {
	const packed = packLoops([mk("l1", 100)], 0, { request: 300, tokensPerByte: 1, envelopeOverheadBytes: 150, outputReserve: 100 });
	expect(packed.oversize?.id).toBe("l1");
});

test("nonempty abort, summary and steering between call and result stay inside the same loop", () => {
	const records = collectContext([
		call("a", "c"), assistant("abort", "Transport failed; waiting for cleanup."),
		{ id: "summary", type: "compaction", summary: "Earlier work." }, user("steer", "Stop after cleanup."), result("r", "c", true), assistant("next", "Stopped."),
	]).records;
	const grouped = groupLoops(records);
	expect(grouped.map((l) => l.id)).toEqual(["a", "next"]);
	expect(grouped[0].records.map((r) => r.id)).toEqual(expect.arrayContaining(["abort", "summary", "steer", "r"]));
	expect(grouped[0].complete).toBe(true);
	const missing = groupLoops(records.filter((r) => r.id !== "r"));
	expect(loopsAfter(missing, undefined)).toEqual([]);
});

test("packing measures actual request and per-question dimensions independently", () => {
	const packed = packLoops([mk("a", 10), mk("b", 10)], 1,
		{ request: 1000, stateAndLongestQuestion: 100, tokensPerByte: 1, envelopeOverheadBytes: 0 }, 8,
		(segment) => ({ request: 400 + segment.length * 100, stateAndLongestQuestion: 50 + segment.length * 20 }));
	expect(packed.loops.map((l) => l.id)).toEqual(["a", "b"]);
});

// Choice ceiling (task 3.1): a loop whose sources would push any choice
// question past 255 options is never packed; alone it is a choice oversize.
test("packLoops honors the 255-choice ceiling with and without token metadata", () => {
	const choices = (segment: Loop[]) => ({ request: 10, stateAndLongestQuestion: 10, choices: segment.reduce((n, l) => n + l.bytes, 3) });
	const loops = [mk("l1", 100), mk("l2", 100), mk("l3", 100)]; // bytes stand in for source counts
	const withLimits = packLoops(loops, 0, { request: 1_000_000, tokensPerByte: 1, envelopeOverheadBytes: 0 }, 8, choices);
	expect(withLimits.loops.map((l) => l.id)).toEqual(["l1", "l2"]); // 203 ok, 303 not
	expect(withLimits.tooManyChoices).toBeUndefined();
	const noMeta = packLoops(loops, 0, { tokensPerByte: 1, envelopeOverheadBytes: 0 }, 8, choices);
	expect(noMeta.loops.map((l) => l.id)).toEqual(["l1", "l2"]);
	const single = packLoops([mk("huge", 300), mk("l2", 1)], 0, { request: 1_000_000, tokensPerByte: 1, envelopeOverheadBytes: 0 }, 8, choices);
	expect(single.loops).toEqual([]);
	expect(single.oversize?.id).toBe("huge");
	expect(single.tooManyChoices).toBe(true);
	const singleNoMeta = packLoops([mk("huge", 300)], 0, { tokensPerByte: 1, envelopeOverheadBytes: 0 }, 8, choices);
	expect(singleNoMeta.tooManyChoices).toBe(true);
});
