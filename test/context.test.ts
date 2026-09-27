import { expect, test } from "bun:test";
import { collectContext, reduceContext, safeJson, type AuditContext } from "../context.js";
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

test("a relevant earlier result without artifact/task names survives later user refusal and unrelated docs", () => {
	const context = collect([
		user("goal", "Implement src/parser.ts; do not deploy without permission."),
		...pair("check", { command: "run the agreed acceptance check" }, "FAIL: malformed input was accepted", true),
		...pair("docs", { url: "https://unrelated.example/guide.html" }, "UNRELATED_HISTORICAL_DUMP".repeat(1000)),
		assistant("claim", "Everything passed. Shall this be deployed?"),
		user("refusal", "No. Do not deploy; the earlier check failed."),
		...pair("latest", { command: "report status" }, "Waiting for the requested decision."),
	]);
	const sent = state(context);
	expect(sent).toContain("FAIL: malformed input was accepted");
	expect(sent).toContain("Everything passed");
	expect(sent).toContain("No. Do not deploy");
	expect(sent).not.toContain("UNRELATED_HISTORICAL_DUMP");
	expect(context.records.findIndex((r) => r.id === "check")).toBeLessThan(context.records.findIndex((r) => r.id === "refusal"));
	expect(context.omissions.some((o) => o.id === "docs")).toBe(true);
});

test("repeated logs are deduplicated as whole call/result groups", () => {
	const context = collect([user("goal", "Work on src/parser.ts"),
		...pair("old", { file: "src/parser.ts" }, "src/parser.ts check passed"),
		...pair("new", { file: "src/parser.ts" }, "src/parser.ts check passed"),
	]);
	expect(context.records.some((r) => r.id === "old")).toBe(false);
	expect(context.records.some((r) => r.id === "new")).toBe(true);
	expect(context.omissions.find((o) => o.id === "old")?.reason).toContain("duplicate");
	expect(context.records.filter((r) => r.callId === "new").map((r) => r.kind)).toEqual(["tool_call", "tool_result"]);
});

test("more than twenty relevant fragments and 4000 characters remain intact", () => {
	const entries: unknown[] = [user("goal", "Work on src/parser.ts")];
	for (let i = 0; i < 35; i++) entries.push(...pair(`check-${i}`, { file: "src/parser.ts", case: i }, `Unique acceptance ${i}: ` + "可见结果".repeat(150)));
	const context = collect(entries);
	const sent = state(context);
	expect(sent.length).toBeGreaterThan(16000);
	for (let i = 0; i < 35; i++) expect(sent).toContain(`Unique acceptance ${i}:`);
});

test("supplements retain prose, arbitrary metadata, owner and dependencies without private result details", () => {
	const context = collect([user("goal", "Work on src/parser.ts"),
		{ id: "tool", type: "message", message: { role: "toolResult", toolName: "unrecognized", content: "src/parser.ts approval denied", details: { privateCache: "DO_NOT_EXPORT" } } },
	]);
	const sent = state(context);
	for (const value of ["Malformed input rejected", "Approval not granted", "parser-worker", "blockedBy", "approval denied"]) expect(sent).toContain(value);
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
	const context = collect([user("goal", "Work on src/parser.ts"), { id: "advice", type: "custom_message", display: true, customType: "jev-todo-audit", content: "Split src/parser.ts task" }]);
	const record = context.records.find((r) => r.id === "advice");
	expect(record?.advice).toBe(true); expect(record?.producer).toBe("jev-todo-audit");
	expect(buildAuditRequest(board, context, "jev-latest").questions.task_evidence_5.criteria.advice).toBeUndefined();
});

test("recovery removes optional complete groups once, preserves decisions, summaries and supplements", () => {
	const original = collect([{ id: "summary", type: "compaction", summary: "Retained goal" }, user("goal", "Work on src/parser.ts"),
		...pair("old", { file: "src/parser.ts" }, "Old src/parser.ts observation"),
		...pair("latest", { file: "src/parser.ts" }, "Latest src/parser.ts observation"), user("decision", "Wait for approval"),
	]);
	const reduced = reduceContext(original)!;
	expect(reduced).toBeDefined(); expect(reduced.globalComplete).toBe(false);
	for (const id of ["summary", "goal", "latest", "decision", "task:5"]) expect(reduced.records.some((r) => r.id === id)).toBe(true);
	expect(reduced.records.some((r) => r.id === "old")).toBe(false);
	expect(reduced.records.filter((r) => r.callId === "latest")).toHaveLength(2);
	expect(reduceContext(reduced)).toBeUndefined();
	expect(reduceContext(collect([user("u", "Required only")]))).toBeUndefined();
});
