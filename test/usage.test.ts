/** Actual-attempt accounting: model/usage retained independently of answer validity. */
import { expect, test } from "bun:test";
import { auditWithContext, buildAuditRequest, runAudit, type Attempt } from "../typesafe.js";
import { sizeOf } from "../capacity.js";
import { collectContext } from "../context.js";

const opts = { apiUrl: "https://x.test/v1/systemone", apiKey: "k", timeoutMs: 1000, baseDelayMs: 1 };
const board = { tasks: [{ id: 5, subject: "Parser", status: "in_progress" as const }], nextId: 6 };
const req = buildAuditRequest(board, "x", "jev-latest");
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

test("valid, malformed and invalid answers all keep the response model and usage", async () => {
	for (const answers of [{ alignment: { choice: "aligned", confidence: 0.9 } }, undefined, { alignment: { choice: "bogus", confidence: 0.9 } }]) {
		const seen: Attempt[] = [];
		await runAudit(req, { ...opts, onAttempt: (a) => seen.push(a), fetchFn: async () => json({ answers, model: "jev-1.13", usage: { input_tokens: 1200, output_tokens: 7 } }) });
		expect(seen).toEqual([{ outcome: answers ? "answered" : "malformed", status: 200, model: "jev-1.13", inputTokens: 1200, outputTokens: 7, ...sizeOf(req) }]);
		expect(sizeOf(req).stateBytes).toBe(Buffer.byteLength(req.state)); expect(sizeOf(req).questionBytes).toBe(Buffer.byteLength(JSON.stringify(req.questions)));
	}
});

test("retries count every attempt; absent usage stays unknown rather than zero", async () => {
	const seen: Attempt[] = [];
	let n = 0;
	await runAudit(req, { ...opts, maxRetries: 3, onAttempt: (a) => seen.push(a), fetchFn: async () => {
		n++;
		if (n === 1) throw new Error("fetch failed");
		if (n === 2) return new Response("overloaded", { status: 503 });
		return json({ answers: { alignment: { choice: "aligned", confidence: 0.9 } } });
	} });
	expect(seen.map((a) => a.outcome)).toEqual(["network_error", "http_error", "answered"]);
	for (const a of seen) { expect(a.inputTokens).toBeUndefined(); expect(a.outputTokens).toBeUndefined(); }
	expect(seen.every((a) => !("inputTokens" in a) || a.inputTokens === undefined)).toBe(true);
});

test("overflow and recovery attempts are each counted", async () => {
	const seen: Attempt[] = [];
	const context = collectContext([{ id: "u", type: "message", message: { role: "user", content: "Work on parser.ts" } }]);
	let n = 0;
	// Question-batch subdivision over one frozen state: the rejected request and both halves are attempts.
	await auditWithContext(board, context, "jev-latest", { ...opts, onAttempt: (a) => seen.push(a), fetchFn: async () =>
		++n === 1 ? json({ detail: { error_type: "max_tokens_exceeded" } }, 400) : json({ answers: {}, usage: { input_tokens: 10 } }) });
	expect(seen.map((a) => a.outcome)).toEqual(["overflow", "answered", "answered"]);
	expect(seen[0].inputTokens).toBeUndefined(); expect(seen[1].inputTokens).toBe(10); expect(seen[1].outputTokens).toBeUndefined();
});

test("negative or non-numeric usage is unknown, not a fabricated count", async () => {
	const seen: Attempt[] = [];
	await runAudit(req, { ...opts, onAttempt: (a) => seen.push(a), fetchFn: async () => json({ answers: {}, usage: { input_tokens: -1, output_tokens: "3" } }) });
	expect(seen[0].inputTokens).toBeUndefined(); expect(seen[0].outputTokens).toBeUndefined();
});
