/** Request/delivery integration with real-shaped public entries. No live inference. */
import { afterAll, beforeEach, expect, mock, test } from "bun:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import makeExtension from "../index.js";
import { DEFAULT_CONFIG } from "../config.js";
import type { AuditRequest } from "../typesafe.js";

const originalFetch = globalThis.fetch;
const originalKey = process.env.JEV_AUDIT_TEST_KEY;
const a = (choice: string) => ({ choice, confidence: 0.95 });
let answers: Record<string, unknown>;
let requests: AuditRequest[];
let respond: () => Promise<Response>;
const response = () => new Response(JSON.stringify({ answers }), { status: 200 });
beforeEach(() => {
	process.env.JEV_AUDIT_TEST_KEY = "sk-test-key";
	requests = [];
	answers = { alignment: a("aligned"), current_match: a("5"), task_status_5: a("actually_completed"), task_evidence_5: a("user"), interaction: a("waiting_user"), work_evidence: a("user") };
	respond = async () => response();
	globalThis.fetch = mock(async (_url: unknown, init: any) => { requests.push(JSON.parse(init.body)); return respond(); }) as unknown as typeof fetch;
});
afterAll(() => { globalThis.fetch = originalFetch; if (originalKey === undefined) delete process.env.JEV_AUDIT_TEST_KEY; else process.env.JEV_AUDIT_TEST_KEY = originalKey; });

const user = (id: string, text: string) => ({ id, type: "message", message: { role: "user", content: text } });
const task = { id: 5, subject: "Parser", status: "in_progress" as const, description: "Malformed input rejected; no deployment without approval" };
const snapshot = (tasks: unknown[], id = "board") => ({ id, type: "message", message: { role: "toolResult", toolName: "todo", content: [{ type: "text", text: "Board snapshot updated" }], details: { tasks, nextId: 8 } } });
const initial = () => [user("user", "Confirmed #5 passed all agreed acceptance checks. Reconcile completion only; do not start other work."), snapshot([task])];
function setup(branch: unknown[] = initial(), config = {}) {
	const handlers = new Map<string, ((e: any, c: any) => Promise<void>)[]>();
	const commands = new Map<string, any>();
	const sent: { message: any; options: any }[] = [];
	const listeners = new Map<string, ((d: unknown) => void)[]>();
	const pi = {
		on: (name: string, h: any) => handlers.set(name, [...(handlers.get(name) ?? []), h]),
		registerCommand: (name: string, c: any) => commands.set(name, c),
		sendMessage: (message: any, options: any) => sent.push({ message, options }),
		events: { on: (name: string, h: any) => { listeners.set(name, [...(listeners.get(name) ?? []), h]); return () => {}; } },
	} as unknown as ExtensionAPI;
	const ctx = { sessionManager: { getSessionId: () => "s1", getBranch: () => branch, buildContextEntries: () => branch }, ui: { notify: mock((_text: string, _level?: string) => {}) } };
	makeExtension(pi, { ...DEFAULT_CONFIG, apiKeyEnvVar: "JEV_AUDIT_TEST_KEY", ...config });
	const emit = async (name: string, event = {}) => { for (const h of handlers.get(name) ?? []) await h(event, ctx); };
	const hook = (values = { STOP_KIND: "AI_UNLOCK", REASON_TYPE: "JOB_DONE", REASON: "done" }) => { for (const h of listeners.get("pi:semantic-hook:v1") ?? []) h({ version: 1, name: "user-ready", values }); };
	return { branch, ctx, sent, emit, hook, handlers, commands, listeners, manual: () => commands.get("jev-audit").handler("", ctx) as Promise<void> };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

test("periodic cadence and user cooldown work without a watchdog", async () => {
	const h = setup(); await h.emit("session_start");
	for (let i = 0; i < 19; i++) { h.branch.push({ type: "message", message: { role: "assistant", content: `Visible progress ${i}` } }); await h.emit("turn_end"); }
	expect(requests).toHaveLength(0); await h.emit("turn_end"); expect(requests).toHaveLength(1);
	expect(h.sent).toHaveLength(1); expect(h.sent[0].options).toEqual({ deliverAs: "steer" }); expect(h.sent[0].message.content).toContain("Evidence [user]");
	h.branch.push(user("new-user", "Do not start anything else")); await h.emit("message_end", { message: { role: "user" } });
	for (let i = 0; i < 10; i++) await h.emit("turn_end"); expect(requests).toHaveLength(1);
	for (let i = 0; i < 10; i++) await h.emit("turn_end"); expect(requests).toHaveLength(2);
});

test("manual bypasses cadence, terminal reconciliation wakes for board work only", async () => {
	const h = setup(); await h.emit("session_start"); await h.manual();
	expect(h.sent).toHaveLength(1); expect(h.sent[0].options).toEqual({ deliverAs: "steer" });
	const second = setup(); await second.emit("session_start"); second.hook(); await tick();
	expect(second.sent).toHaveLength(1); expect(second.sent[0].options.triggerTurn).toBe(true);
	expect(second.sent[0].message.content).toContain("BOARD ONLY"); expect(second.sent[0].message.content).toContain("return control");
});

test("explicit actionable-now with current authorization can wake for execution", async () => {
	const h = setup([user("user", "Implement #5 now; the next action is to fix the parser rejection case and permission is granted."), snapshot([task])]);
	answers = { ...answers, task_status_5: a("actionable_now"), interaction: a("working") };
	await h.emit("session_start"); h.hook(); await tick();
	expect(h.sent).toHaveLength(1); expect(h.sent[0].message.content).toContain("CONTINUE"); expect(h.sent[0].options.triggerTurn).toBe(true);
});

test("blocked match and coarse-task judgment cannot override waiting; missing annotation is board-only", async () => {
	const h = setup([user("user", "Wait for approval before doing anything on #5."), snapshot([task])]);
	answers = { ...answers, alignment: a("not_aligned"), task_status_5: a("blocked"), task_granularity_5: a("split_independent_outcomes"), task_board_5: a("needs_reconciliation") };
	await h.emit("session_start"); h.hook(); await tick();
	expect(h.sent).toHaveLength(1);
	const text = h.sent[0].message.content;
	expect(text).toContain("BOARD ONLY"); expect(text).not.toContain("split #5"); expect(text).not.toContain("CONTINUE"); expect(text).not.toContain('set #5 "Parser" in_progress');
	h.branch.push(snapshot([{ ...task, status: "pending", description: "Awaiting user approval" }], "updated-board"));
	await h.manual(); expect(h.sent).toHaveLength(1);
	expect(requests.at(-1)!.state).toContain("Awaiting user approval");
});

test("already recorded wait or ongoing-only work does not wake", async () => {
	for (const lifecycle of ["blocked", "future", "deliberately_deferred", "still_ongoing"]) {
		const h = setup([user("user", "Wait for approval"), snapshot([{ ...task, description: "Awaiting user approval" }])]);
		answers = { ...answers, task_status_5: a(lifecycle), task_board_5: a("accurate") };
		await h.emit("session_start"); h.hook(); await tick(); expect(h.sent).toHaveLength(0);
	}
});

test("reworded stops and assistant acknowledgments do not repeat demands, even after reload", async () => {
	const h = setup(); await h.emit("session_start"); h.hook(); await tick(); expect(h.sent).toHaveLength(1);
	h.branch.push({ id: "audit", type: "custom_message", ...h.sent[0].message });
	h.branch.push({ id: "ack", type: "message", message: { role: "assistant", content: "Acknowledged; will reconcile the board." } });
	h.hook({ STOP_KIND: "EXHAUSTED", REASON_TYPE: "CHANGED_WORDING", REASON: "a different stop phrase" }); await tick();
	await h.manual(); expect(h.sent).toHaveLength(1);
	const reloaded = setup(h.branch); await reloaded.emit("session_start"); await reloaded.manual(); expect(reloaded.sent).toHaveLength(0);
});

test("board bookkeeping cannot re-arm a blocker when unrelated latest output becomes historical", async () => {
	const h = setup([user("user", "Work on src/parser.ts, but wait for approval."), snapshot([task]),
		{ id: "docs-call", type: "message", message: { role: "assistant", content: [{ type: "toolCall", id: "docs", name: "unfamiliar", arguments: { url: "https://unrelated.example/guide.html" } }] } },
		{ id: "docs", type: "message", message: { role: "toolResult", toolCallId: "docs", toolName: "unfamiliar", content: "Unrelated latest visible output" } },
	]);
	answers = { ...answers, task_status_5: a("blocked"), task_board_5: a("needs_reconciliation") };
	await h.emit("session_start"); await h.manual(); expect(h.sent).toHaveLength(1);
	h.branch.push({ id: "ack-call", type: "message", message: { role: "assistant", content: [{ type: "toolCall", id: "record-wait", name: "todo", arguments: { action: "update", id: 5, status: "pending", description: "Awaiting user approval" } }] } });
	h.branch.push(snapshot([{ ...task, status: "pending", description: "Awaiting user approval" }], "bookkeeping"));
	await h.manual(); expect(h.sent).toHaveLength(1);
});

test("new user evidence permits a fresh audit under identical stop metadata", async () => {
	const h = setup(); await h.emit("session_start"); h.hook(); await tick();
	h.branch.push(user("new-user", "Confirmed the updated #5 also passes its new acceptance check.")); await h.emit("message_end", { message: { role: "user" } });
	answers.task_evidence_5 = a("new-user"); h.hook(); await tick();
	expect(requests).toHaveLength(2); expect(h.sent).toHaveLength(2);
});

for (const change of ["user", "board", "branch", "shutdown"]) test(`in-flight result invalidated by ${change} is discarded`, async () => {
	let release!: (r: Response) => void;
	respond = () => new Promise<Response>((resolve) => { release = resolve; });
	const h = setup(); await h.emit("session_start"); const pending = h.manual();
	if (change === "user") { h.branch.push(user("new-user", "Stop. The acceptance criteria have changed.")); await h.emit("message_end", { message: { role: "user" } }); }
	if (change === "board") h.branch.push(snapshot([{ ...task, subject: "Different acceptance scope" }], "new-board"));
	if (change === "branch") await h.emit("session_tree");
	if (change === "shutdown") await h.emit("session_shutdown");
	release(response()); await pending; expect(h.sent).toHaveLength(0);
});

test("new stop after an in-flight user change is queued once and not lost with the aborted request", async () => {
	let release!: (r: Response) => void; let first = true;
	respond = () => first ? (first = false, new Promise<Response>((resolve) => { release = resolve; })) : Promise.resolve(response());
	const h = setup(); await h.emit("session_start"); h.hook();
	h.branch.push(user("new-user", "Confirmed the revised #5 is now accepted; reconcile the new board state."));
	await h.emit("message_end", { message: { role: "user" } }); answers.task_evidence_5 = a("new-user"); h.hook();
	release(response()); await tick(); await tick();
	expect(requests).toHaveLength(2); expect(h.sent).toHaveLength(1); expect(h.sent[0].message.content).toContain("Evidence [new-user]");
});

test("request retains effective global context, visible failure and task requirements; excludes abandoned/compacted raw payload", async () => {
	const branch = [user("abandoned", "ABANDONED_PAYLOAD"), { id: "summary", type: "compaction", summary: "Global acceptance requires rejecting malformed input" },
		user("user", "Investigate src/parser.ts; wait for approval before changing behavior."), snapshot([{ ...task, owner: "worker", metadata: { nonstandard: "approval missing" } }]),
		{ id: "call", type: "message", message: { role: "assistant", content: [{ type: "toolCall", id: "probe", name: "unfamiliar_probe", arguments: { file: "src/parser.ts" } }] } },
		{ id: "result", type: "message", message: { role: "toolResult", toolName: "unfamiliar_probe", toolCallId: "probe", isError: true, content: "Acceptance failed: malformed input accepted" } },
	];
	const h = setup(branch); h.ctx.sessionManager.buildContextEntries = () => branch.filter((entry) => entry.id !== "abandoned");
	answers = { task_status_5: a("blocked"), task_evidence_5: a("user"), task_board_5: a("accurate"), interaction: a("waiting_user") };
	await h.emit("session_start"); await h.manual();
	const state = requests[0].state;
	for (const evidence of ["Global acceptance", "unfamiliar_probe", "malformed input accepted", "approval missing", "worker"]) expect(state).toContain(evidence);
	expect(state).not.toContain("ABANDONED_PAYLOAD"); expect(h.sent).toHaveLength(0);
});

test("age and legacy budget do not force splitting or crop context; notice once", async () => {
	const long = "Relevant acceptance condition for src/parser.ts. ".repeat(200);
	const h = setup([user("user", long), snapshot([task])], { activityBudgetChars: 1 });
	answers = { ...answers, task_status_5: a("still_ongoing"), task_granularity_5: a("appropriate"), interaction: a("working") };
	await h.emit("session_start"); await h.emit("session_start");
	for (let i = 0; i < 40; i++) await h.emit("turn_end");
	expect(requests).toHaveLength(3); expect(requests.at(-1)!.state).toContain(long); expect(h.sent).toHaveLength(0);
	expect(h.ctx.ui.notify.mock.calls.filter(([m]) => m.includes("deprecated"))).toHaveLength(1);
});

test("terminal empty/all-done boards, disabled extension and malformed hooks are inert", async () => {
	for (const tasks of [[], [{ ...task, status: "completed" }]]) { const h = setup([snapshot(tasks)]); await h.emit("session_start"); h.hook(); await tick(); expect(h.sent).toHaveLength(0); }
	expect(requests).toHaveLength(0);
	const disabled = setup(undefined, { enabled: false }); expect(disabled.handlers.size).toBe(0); expect(disabled.commands.size).toBe(0);
	const h = setup(); await h.emit("session_start");
	for (const payload of [null, "bad", { version: 1, name: "user-ready", values: { STOP_KIND: "HUMAN_ABORT" } }]) for (const listener of h.listeners.get("pi:semantic-hook:v1") ?? []) listener(payload);
	await tick(); expect(requests).toHaveLength(0);
});

test("known opaque API key is absent from evidence, task labels and failure diagnostics", async () => {
	process.env.JEV_AUDIT_TEST_KEY = "opaque-credential-no-prefix";
	const h = setup([user("user", "Opaque credential opaque-credential-no-prefix appeared in visible text"), snapshot([{ ...task, subject: "opaque-credential-no-prefix" }])]);
	respond = async () => new Response("invalid opaque-credential-no-prefix", { status: 422 });
	await h.emit("session_start"); await h.manual();
	expect(JSON.stringify(requests)).not.toContain("opaque-credential-no-prefix");
	expect(JSON.stringify(h.ctx.ui.notify.mock.calls)).not.toContain("opaque-credential-no-prefix");
	expect(h.sent).toHaveLength(0);
});

test("API failure remains isolated and a later manual check can run", async () => {
	respond = async () => new Response("invalid question", { status: 422 });
	const h = setup(); await h.emit("session_start"); await h.manual(); expect(h.sent).toHaveLength(0);
	respond = async () => response(); await h.manual(); expect(h.sent).toHaveLength(1);
});
