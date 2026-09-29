import { expect, test } from "bun:test";
import { auditWithContext, buildAuditRequest, isContextOverflow, runAudit, type AuditRequest } from "../typesafe.js";
import { collectContext } from "../context.js";
const options = { apiUrl: "https://example.invalid/v1/systemone", apiKey: "test-key", timeoutMs: 1000 };
const board = { tasks: [{ id: 5, subject: "Check parser", status: "in_progress" as const }], nextId: 6 };
const pair = (id: string, text: string) => [
	{ id: `${id}-call`, type: "message", message: { role: "assistant", content: [{ type: "toolCall", id, name: "unfamiliar_probe", arguments: { file: "parser.ts" } }] } },
	{ id, type: "message", message: { role: "toolResult", toolCallId: id, toolName: "unfamiliar_probe", content: text } },
];
const say = (id: string, text: string) => ({ id, type: "message", message: { role: "assistant", content: text } });
const context = () => collectContext([
	{ id: "goal", type: "message", message: { role: "user", content: "Work on parser.ts; malformed input must be rejected." } },
	...pair("probe", "tool body is projected away"),
	say("old", "Earlier parser.ts observation: " + "历史证据 ".repeat(1000)),
	say("latest", "Latest parser.ts acceptance check passed"),
], [{ id: "task:5", value: board.tasks[0] }]);
const ok = () => new Response(JSON.stringify({ answers: { alignment: { choice: "aligned", confidence: 0.9 } } }));

for (const body of [
	{ error: { code: "context_length_exceeded" } },
	{ error: { message: "Input token count exceeds the maximum context limit" } },
	{ message: "State tokens exceeds the allowed context length" },
	{ detail: "Maximum context length is 32000 tokens; requested 40000 tokens" },
	{ detail: { error_type: "max_tokens_exceeded" } },
]) test(`explicit overflow can be recognized: ${JSON.stringify(body)}`, () => { expect(isContextOverflow(422, JSON.stringify(body))).toBe(true); });

for (const [status, body] of [
	[422, { detail: [{ message: "bad choice", input: "context length exceeded" }] }],
	[422, { message: "invalid question", input: "context length exceeded" }],
	[422, { detail: "unknown validation error" }],
	[400, { message: "Total tokens exceeds the allowed per-minute rate limit" }],
	[401, { message: "context length exceeded" }],
	[429, { error: { code: "context_length_exceeded" } }],
	[413, { message: "payload too large" }],
	[503, { message: "context length exceeded" }],
] as const) test(`ordinary ${status} error never authorizes cropping: ${JSON.stringify(body)}`, async () => {
	let calls = 0;
	const res = await auditWithContext(board, context(), "jev-latest", { ...options, fetchFn: async () => {
		calls++; return new Response(JSON.stringify(body), { status });
	} });
	expect(calls).toBe(1); expect(res.result.ok).toBe(false);
});

test("valid source survives unknown answers, illegal confidence/options and inherited key names", async () => {
	const req = buildAuditRequest(board, context(), "jev-latest");
	const raw = JSON.parse('{"task_status_5":{"choice":"actually_completed","confidence":0.9},"task_evidence_5":{"choice":"invented","confidence":0.99},"task_status_99":{"choice":"cancelled","confidence":1},"alignment":{"choice":"aligned","confidence":1.1},"current_match":{"choice":"123","confidence":0.9},"drift":{"choice":"drifted"},"__proto__":{"choice":"x","confidence":1}}');
	const res = await runAudit(req, { ...options, fetchFn: async () => new Response(JSON.stringify({ answers: raw })) });
	expect(res.ok).toBe(true);
	if (res.ok) {
		expect(res.answers.lifecycle?.task_status_5.choice).toBe("actually_completed");
		expect(res.answers.lifecycle?.task_status_99).toBeUndefined(); expect(res.answers.evidence).toBeUndefined();
		expect(res.answers.alignment).toBeUndefined(); expect(res.answers.current_match).toBeUndefined(); expect(res.answers.drift).toBeUndefined();
	}
});

test("task rubric is scoped, differentiates levels, and never mandates one test/file per task", () => {
	const req = buildAuditRequest({ ...board, tasks: [...board.tasks, { id: 7, subject: "Second task", status: "in_progress" }] }, context(), "jev-latest");
	for (const id of [5, 7]) {
		const q = req.questions[`task_granularity_${id}`];
		for (const phrase of [`ONLY #${id}`, "feature/story", "concrete next action", "Age raises review", "already tracked", "One overall goal can still need checkpoints"]) expect(q.instructions).toContain(phrase);
		expect(Object.keys(q.criteria).sort()).toEqual(["appropriate", "blocked", "clarify_done_criteria", "clarify_next_action", "insufficient_evidence", "not_applicable", "split_independent_outcomes", "split_verifiable_checkpoints"]);
	}
	expect(req.questions.granularity).toBeUndefined();
});
