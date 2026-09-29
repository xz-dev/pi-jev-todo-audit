import { expect, test } from "bun:test";
import { collectContext, safeJson, type AuditContext } from "../context.js";
import { buildAuditRequest } from "../typesafe.js";

const user = (id: string, content: string) => ({ id, type: "message", message: { role: "user", content } });
const assistant = (id: string, content: unknown) => ({ id, type: "message", message: { role: "assistant", content } });
const pair = (id: string, args: unknown, result: string, isError = false) => [
	assistant(`${id}-call`, [{ type: "toolCall", id, name: "unfamiliar_probe", arguments: args }]),
	{ id, type: "message", message: { role: "toolResult", toolName: "unfamiliar_probe", toolCallId: id, isError, content: [{ type: "text", text: result }] } },
];
const board = { tasks: [{ id: 5, subject: "Parser", description: "src/parser.ts must reject malformed input; await approval before deployment.", owner: "parser-worker", blockedBy: [7], metadata: { expectation: "Malformed input rejected", unusualReason: "Approval not granted" }, status: "in_progress" as const }], nextId: 8 };
const collect = (entries: unknown[]) => collectContext(entries, board.tasks.map((value) => ({ id: `task:${value.id}`, value })));
const state = (context: AuditContext) => buildAuditRequest(board, context, "jev-latest").state;

test("tools are projected to name, call identity/order and status; arguments and bodies never leave", () => {
	const context = collect([
		user("goal", "Implement src/parser.ts; do not deploy without permission."),
		...pair("check", { command: "ARG_SECRET run the agreed acceptance check" }, "BODY_FAIL malformed input was accepted", true),
		...pair("docs", { url: "https://unrelated.example/guide.html" }, "UNRELATED_HISTORICAL_DUMP".repeat(1000)),
		assistant("claim", "Everything passed. Shall this be deployed?"),
		user("refusal", "No. Do not deploy; the earlier check failed."),
		{ id: "sh", type: "message", message: { role: "bashExecution", command: "CMD_SECRET npm test", output: "OUTPUT_BODY", exitCode: 1 } },
		{ id: "sh2", type: "message", message: { role: "bashExecution", command: "sleep", output: "", cancelled: true } },
		assistant("pending-call", [{ type: "toolCall", id: "later", name: "never_returns", arguments: { x: "PENDING_ARG" } }]),
	]);
	const sent = state(context);
	for (const hidden of ["ARG_SECRET", "BODY_FAIL", "UNRELATED_HISTORICAL_DUMP", "CMD_SECRET", "OUTPUT_BODY", "PENDING_ARG", "guide.html"]) expect(sent).not.toContain(hidden);
	for (const kept of ["Everything passed", "No. Do not deploy", "unfamiliar_probe", "never_returns"]) expect(sent).toContain(kept);
	const status = (id: string) => JSON.parse(context.records.find((r) => r.id === id)!.text).status;
	expect(status("check")).toBe("error"); expect(status("docs")).toBe("returned"); expect(status("sh")).toBe("error");
	expect(status("sh2")).toBe("cancelled"); expect(status("pending-call:call:later")).toBe("pending");
	expect(context.omissions.some((o) => o.id === "pending-call:call:later" && o.reason === "tool result unavailable")).toBe(true);
	expect(context.records.findIndex((r) => r.id === "check")).toBeLessThan(context.records.findIndex((r) => r.id === "refusal"));
	// A result is linked to its earlier call by identity without replaying arguments.
	expect(context.records.find((r) => r.id === "check")!.group).toBe("check-call:call:check");
	// Current TODO state is still supplied once through the board adapter.
	expect(sent.split("Malformed input rejected").length - 1).toBe(1);
});

test("a result without status flags or content is unknown, never success", () => {
	const context = collect([{ id: "r", type: "message", message: { role: "toolResult", toolCallId: "x", toolName: "odd" } }]);
	expect(JSON.parse(context.records.find((r) => r.id === "r")!.text).status).toBe("unknown");
});

test("all supported text-only analysis turns are kept in order, and a short reply keeps its question", () => {
	const entries: unknown[] = [user("goal", "Compare three designs; analysis only.")];
	for (let i = 0; i < 35; i++) entries.push(assistant(`t${i}`, `Analysis part ${i}: ` + "可见结果".repeat(150)));
	entries.push(assistant("q", "Shall I also cover migration?"), user("yes", "yes"));
	const context = collect(entries);
	const sent = state(context);
	expect(sent.length).toBeGreaterThan(16000);
	for (let i = 0; i < 35; i++) expect(sent).toContain(`Analysis part ${i}:`);
	expect(context.records.find((r) => r.id === "yes")!.selection).toBe("replies to q");
});

test("supplements retain prose, arbitrary metadata, owner and dependencies without private result details", () => {
	const context = collect([user("goal", "Work on src/parser.ts"),
		{ id: "tool", type: "message", message: { role: "toolResult", toolName: "unrecognized", content: "src/parser.ts approval denied", details: { privateCache: "DO_NOT_EXPORT" } } },
	]);
	const sent = state(context);
	for (const value of ["Malformed input rejected", "Approval not granted", "parser-worker", "blockedBy", "unrecognized"]) expect(sent).toContain(value);
	expect(sent).not.toContain("approval denied");
	expect(sent).not.toContain("DO_NOT_EXPORT");
});

test("credentials, thinking, images and private custom state stay out; gaps are explicit", () => {
	const context = collect([
		user("goal", "Work on src/parser.ts; Authorization: Bearer sk-abcdefghijk"),
		assistant("a", [{ type: "thinking", thinking: "HIDDEN_THOUGHT" }, { type: "text", text: "Visible result" }, { type: "image", data: "IMAGE_BYTES" }]),
		...pair("result", { file: "src/parser.ts", apiKey: "PRIVATE_KEY_VALUE", nested: { password: "NESTED_PASSWORD" } }, "password=OUTPUT_PASSWORD"),
		{ id: "private", type: "custom", customType: "internal", data: { secret: "PRIVATE_STATE" } },
		{ id: "hidden", type: "custom_message", customType: "internal", display: false, content: "HIDDEN_CUSTOM" },
	]);
	const sent = state(context);
	for (const value of ["sk-abcdefghijk", "HIDDEN_THOUGHT", "IMAGE_BYTES", "PRIVATE_KEY_VALUE", "NESTED_PASSWORD", "OUTPUT_PASSWORD", "PRIVATE_STATE", "HIDDEN_CUSTOM"]) expect(sent).not.toContain(value);
	expect(sent).toContain("[REDACTED]"); expect(sent).toContain("unavailable:");
	expect(context.omissions.some((o) => o.reason.includes("redacted"))).toBe(true);
});

test("safe JSON stays parseable after redaction, handles circular data and preserves repeated references", () => {
	const shared = { text: "safe" }; const cyclic: any = { shared }; cyclic.self = cyclic;
	expect(JSON.parse(safeJson({ a: shared, b: shared })).b.text).toBe("safe");
	expect(JSON.parse(safeJson({ text: "Authorization: Bearer secret\nVisible next line" })).text).toContain("Visible next line");
	expect(safeJson(cyclic)).toContain("circular value");
});

test("binary and conventional credential fields never become supplemental text evidence", () => {
	const json = safeJson({ payload: Buffer.from("RAW_BINARY"), bytes: new Uint8Array([1, 2, 3]),
		env: { TYPESAFE_API_KEY: "opaque-credential", AWS_SECRET_ACCESS_KEY: "opaque-secret", GITHUB_TOKEN: "opaque-token" },
		token: "bare-secret", clientSecret: "client-secret" });
	for (const value of ["RAW_BINARY", "opaque-credential", "opaque-secret", "opaque-token", "bare-secret", "client-secret"]) expect(json).not.toContain(value);
	expect(json).toContain("non-text/private content");
	expect(safeJson("AWS_SECRET_ACCESS_KEY=plaintext-secret")).not.toContain("plaintext-secret");
});

test("quoted credential values in visible JSON/log text are redacted completely", () => {
	const context = collect([user("user", "Review src/parser.ts"), ...pair("secrets", { file: "src/parser.ts" }, '{"password":"opaque secret with spaces","TYPESAFE_API_KEY":"json-opaque-key"}')]);
	const sent = state(context);
	expect(sent).not.toContain("opaque secret with spaces"); expect(sent).not.toContain("json-opaque-key");
});

test("latest visible custom result does not need an artifact reference", () => {
	const context = collect([user("u", "Work on src/parser.ts"), assistant("a", "Waiting for the worker"),
		{ id: "custom", type: "custom_message", display: true, customType: "unknown-worker", content: "The acceptance check failed; operator input is required." }]);
	expect(state(context)).toContain("The acceptance check failed");
});

test("public summaries are labelled; missing effective API and missing results are not success", () => {
	const context = collectContext([
		{ id: "summary", type: "compaction", summary: "Global acceptance requires rejection of malformed input" },
		user("goal", "Continue src/parser.ts"),
		assistant("call", [{ type: "toolCall", id: "unfinished", name: "unknown", arguments: { file: "src/parser.ts" } }]),
		{ id: "future-entry", type: "future_entry", unknownState: "PRIVATE" },
	], [], false);
	expect(context.records.find((r) => r.id === "summary")?.kind).toBe("summary");
	expect(context.globalComplete).toBe(false);
	expect(context.omissions.some((o) => o.reason === "tool result unavailable")).toBe(true);
	expect(context.omissions.some((o) => o.id === "future-entry")).toBe(true);
});

test("visible audit advice retains producer identity but is not a selectable source", () => {
	const advice = { id: "advice", type: "custom_message", display: true, customType: "jev-todo-audit", content: "Split src/parser.ts task" };
	const context = collect([user("goal", "Work on src/parser.ts"), advice,
		assistant("rebuttal", "The parser task is one coherent outcome; its checks are already tracked as #6.")]);
	const record = context.records.find((r) => r.id === "advice");
	expect(record?.advice).toBe(true); expect(record?.producer).toBe("jev-todo-audit");
	const req = buildAuditRequest(board, context, "jev-latest");
	expect(req.questions.task_evidence_5.criteria.advice).toBeUndefined();
	// The main agent's reply is new review input, and the question it answers stays identifiable.
	expect(req.state).toContain("already tracked as #6"); expect(req.state).toContain("Split src/parser.ts task");
	// Unanswered advice alone is not new work: it neither enters review nor changes the input.
	const unanswered = collect([user("goal", "Work on src/parser.ts"), advice]);
	expect(unanswered.records.some((r) => r.id === "advice")).toBe(false);
	expect(state(unanswered)).toBe(state(collect([user("goal", "Work on src/parser.ts")])));
});
