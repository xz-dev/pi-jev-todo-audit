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
function setup(branch: unknown[] = initial(), config = {}, opts: { persist?: boolean; modelRegistry?: unknown } = {}) {
	const handlers = new Map<string, ((e: any, c: any) => Promise<void>)[]>();
	const commands = new Map<string, any>();
	const sent: { message: any; options: any }[] = [];
	const listeners = new Map<string, ((d: unknown) => void)[]>();
	const pi = {
		on: (name: string, h: any) => handlers.set(name, [...(handlers.get(name) ?? []), h]),
		registerCommand: (name: string, c: any) => commands.set(name, c),
		sendMessage: (message: any, options: any) => sent.push({ message, options }),
		// `persist` adds a real appendEntry so receipts/answers become durable on the branch.
		...(opts.persist ? { appendEntry: (customType: string, data: unknown) => { branch.push({ id: `c${branch.length}`, type: "custom", customType, data }); } } : {}),
		events: { on: (name: string, h: any) => { listeners.set(name, [...(listeners.get(name) ?? []), h]); return () => {}; } },
	} as unknown as ExtensionAPI;
	const ctx = { sessionManager: { getSessionId: () => "s1", getBranch: () => branch, buildContextEntries: () => branch }, ui: { notify: mock((_text: string, _level?: string) => {}) },
		...(opts.modelRegistry ? { modelRegistry: opts.modelRegistry } : {}) };
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
	answers = { ...answers, task_status_5: a("actionable_now"), task_granularity_5: a("appropriate"), interaction: a("working") };
	await h.emit("session_start"); h.hook(); await tick();
	expect(h.sent).toHaveLength(1); expect(h.sent[0].message.content).toContain("CONTINUE"); expect(h.sent[0].options.triggerTurn).toBe(true);
});

test("an incomplete terminal review cannot wake the agent for an active task", async () => {
	// A missing task_granularity_5 answer (incomplete final piece) must not send CONTINUE + triggerTurn.
	const h = setup([user("user", "Implement #5 now; permission is granted."), snapshot([task])]);
	const all = { ...answers, task_status_5: a("actionable_now"), interaction: a("working") };
	respond = async () => {
		const asked = requests.at(-1)!;
		const body = Object.fromEntries(Object.keys(asked.questions).filter((k) => k !== "task_granularity_5").map((k) => [k, all[k as keyof typeof all] ?? a("unclear")]));
		return new Response(JSON.stringify({ answers: body }), { status: 200 });
	};
	await h.emit("session_start"); h.hook(); await tick();
	expect(h.sent).toHaveLength(0);
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
	const h = setup(); await h.emit("session_start"); const pending = h.manual(); await tick(); // request in flight
	if (change === "user") { h.branch.push(user("new-user", "Stop. The acceptance criteria have changed.")); await h.emit("message_end", { message: { role: "user" } }); }
	if (change === "board") h.branch.push(snapshot([{ ...task, subject: "Different acceptance scope" }], "new-board"));
	if (change === "branch") await h.emit("session_tree");
	if (change === "shutdown") await h.emit("session_shutdown");
	release(response()); await pending; expect(h.sent).toHaveLength(0);
});

test("new stop after an in-flight user change is queued once and not lost with the aborted request", async () => {
	let release!: (r: Response) => void; let first = true;
	respond = () => first ? (first = false, new Promise<Response>((resolve) => { release = resolve; })) : Promise.resolve(response());
	const h = setup(); await h.emit("session_start"); h.hook(); await tick(); // request in flight
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
	for (const evidence of ["Global acceptance", "unfamiliar_probe", '\\"status\\":\\"error\\"', "approval missing", "worker"]) expect(state).toContain(evidence);
	// Macro projection: the failure is visible as a status, not as its raw body.
	expect(state).not.toContain("malformed input accepted");
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

const piRegistry = (keys: Record<string, string | undefined>) => ({ getProvider: (p: string) => p in keys ? {} : undefined, getApiKeyForProvider: async (p: string) => keys[p] });
const warnings = (h: ReturnType<typeof setup>) => h.ctx.ui.notify.mock.calls.filter((c) => c[1] === "warning").map((c) => String(c[0]));

test("Pi-resolved key authenticates the request and is redacted from evidence, without migration warning", async () => {
	const auth: string[] = [];
	globalThis.fetch = mock(async (_url: unknown, init: any) => { auth.push(init.headers.authorization); requests.push(JSON.parse(init.body)); return respond(); }) as unknown as typeof fetch;
	const h = setup([user("user", "pi-opaque-key-123 leaked in chat"), snapshot([task])], {}, { modelRegistry: piRegistry({ typesafe: "pi-opaque-key-123" }) });
	await h.emit("session_start"); await h.manual();
	expect(auth).toEqual(["Bearer pi-opaque-key-123"]);
	expect(JSON.stringify(requests)).not.toContain("pi-opaque-key-123");
	expect(warnings(h)).toEqual([]);
});

test("fallback key on a Pi-mapped endpoint warns once per session start to move it into Pi", async () => {
	const h = setup(initial(), { apiUrl: "https://openrouter.ai/api/v1/systemone" }, { modelRegistry: piRegistry({ openrouter: undefined }) });
	await h.emit("session_start"); await h.manual(); await h.manual();
	expect(requests.length).toBeGreaterThan(0);
	const w = warnings(h); expect(w).toHaveLength(1); expect(w[0]).toContain("prefer Pi auth for openrouter"); expect(w[0]).toContain("/login openrouter");
});

test("no migration warning for a custom endpoint or an unregistered provider", async () => {
	for (const [config, registry] of [[{ apiUrl: "https://proxy.example/v1/systemone" }, piRegistry({ typesafe: "x" })], [{}, piRegistry({})]] as const) {
		const h = setup(initial(), config, { modelRegistry: registry }); await h.emit("session_start");
		expect(warnings(h)).toEqual([]);
	}
});

test("no key anywhere names Pi auth first and skips the audit", async () => {
	delete process.env.JEV_AUDIT_TEST_KEY;
	const h = setup(initial(), {}, { modelRegistry: piRegistry({ typesafe: undefined }) });
	await h.emit("session_start"); await h.manual();
	expect(requests).toHaveLength(0);
	const w = warnings(h); expect(w).toHaveLength(2);
	for (const text of w) expect(text.indexOf("Pi auth for typesafe")).toBeLessThan(text.indexOf("JEV_AUDIT_TEST_KEY"));
});

test("API failure remains isolated and a later manual check can run", async () => {
	respond = async () => new Response("invalid question", { status: 422 });
	const h = setup(); await h.emit("session_start"); await h.manual(); expect(h.sent).toHaveLength(0);
	respond = async () => response(); await h.manual(); expect(h.sent).toHaveLength(1);
});

test("task trajectory is bounded, stable across an unchanged repeat, and keeps its first-active origin", async () => {
	// Each revision stays an ordered `todo` tool event; the supplement carries origin, count and the latest five.
	const snap = (tasks: unknown[], id: string) => ({ id, type: "message", message: { role: "toolResult", toolName: "todo", content: "ok", details: { tasks, nextId: 8 } } });
	const say = (n: number) => ({ id: `a${n}`, type: "message", message: { role: "assistant", content: `x${n}` } });
	const branch: unknown[] = [user("user", "Implement #5 parser rewrite."), snap([{ ...task, status: "pending" }], "e0")];
	for (let i = 1; i <= 8; i++) branch.push(say(i), snap([{ ...task, description: `v${i}` }], `e${i}`));
	// All required questions answered so the receipt actually commits (persist is on, so it is durable).
	answers = { ...answers, drift: a("on_track"), task_board_5: a("accurate"), task_granularity_5: a("appropriate") };
	const h = setup(branch, {}, { persist: true }); await h.emit("session_start"); await h.manual();
	// The pending snapshot is the task's first board state, not a revision of it; e1–e8 are the revisions.
	const trajOf = (state: string) => { const start = state.indexOf('{"records"'); const packet = JSON.parse(state.slice(start, state.indexOf("\nInterpret evidence", start))); const text = packet.records.find((r: any) => r.id === "task:5").text; return JSON.parse(text.slice(0, text.indexOf("\nAge review"))).trajectory; };
	const first = trajOf(requests[0].state);
	expect(first.segments.map((s: any) => s.source)).toEqual(["e4", "e5", "e6", "e7", "e8"]);
	expect(first.revisionCount).toBe(8);
	expect(first.firstActive).toEqual({ turn: 1, source: "e1" }); // the origin is kept even when its segment is bounded away
	const events = JSON.parse(requests[0].state.slice(requests[0].state.indexOf('{"records"'), requests[0].state.indexOf("\nInterpret evidence"))).records
		.filter((r: any) => r.toolName === "todo").map((r: any) => r.id);
	expect(events).toEqual(["e0", "e1", "e2", "e3", "e4", "e5", "e6", "e7", "e8"]); // every revision remains an ordered tool event
	// The durable receipt must not change the supplement: an unchanged repeat re-buys nothing.
	await h.manual();
	expect(requests).toHaveLength(1);
	// A very long history stays bounded in the fixed task state.
	for (let i = 9; i <= 1000; i++) branch.push(snap([{ ...task, description: `w${i}` }], `f${i}`));
	await h.manual();
	const later = trajOf(requests.at(-1)!.state);
	expect(later.revisionCount).toBe(1000);
	expect(later.segments.map((s: any) => s.source)).toEqual(["f996", "f997", "f998", "f999", "f1000"]);
	expect(later.firstActive).toEqual({ turn: 1, source: "e1" });
});

test("TODO revisions start segments without paid calls; granularity keeps the first-active origin through resume", async () => {
	const turn = (i: number) => ({ id: `t${i}`, type: "message", message: { role: "assistant", content: `Visible analysis step ${i}` } });
	const branch: unknown[] = [user("user", "Implement #5 parser rewrite."), snapshot([{ ...task, status: "pending" }], "s0")];
	const h = setup(branch, { interval: 1000 }); await h.emit("session_start");
	const advance = async (to: number) => { while (branch.filter((e: any) => e.message?.role === "assistant").length < to) { branch.push(turn(branch.length)); await h.emit("turn_end"); } };
	await advance(12); branch.push(snapshot([task], "start"));
	await advance(20); branch.push(snapshot([{ ...task, description: "refined scope" }], "rev20"));
	await advance(27); branch.push(snapshot([{ ...task, status: "pending", description: "waiting approval" }], "rev27"));
	branch.push(user("approve", "Approved, resume #5.")); await h.emit("message_end", { message: { role: "user" } });
	branch.push(snapshot([{ ...task, description: "resumed" }], "resume"));
	await advance(35);
	expect(requests).toHaveLength(0); // board edits alone never paid for a review
	await h.manual();
	expect(requests).toHaveLength(1);
	const state = requests[0].state, start = state.indexOf('{"records"');
	const packet = JSON.parse(state.slice(start, state.indexOf("\nInterpret evidence", start)));
	const supplement = JSON.parse(packet.records.find((r: any) => r.id === "task:5").text.split("\nAge review")[0]);
	expect(supplement.trajectory.firstActive).toEqual({ turn: 12, source: "start" });
	expect(supplement.trajectory.segments.map((s: any) => s.source)).toEqual(["start", "rev20", "rev27", "resume"]);
	expect(requests[0].questions.task_granularity_5.instructions).toContain("whole trajectory (see rubric)");
	expect(state).toContain("from its first in_progress turn (trajectory.firstActive)");
});

test("manual modes: repeat sends none, full re-evaluates without tool bodies, unknown arguments send none", async () => {
	const branch = [...initial(),
		{ id: "call", type: "message", message: { role: "assistant", content: [{ type: "toolCall", id: "c1", name: "bash", arguments: { command: "SECRET_COMMAND" } }] } },
		{ id: "ret", type: "message", message: { role: "toolResult", toolCallId: "c1", toolName: "bash", content: "SECRET_OUTPUT" } }];
	// Every requested question is answered, so an unchanged repeat has nothing left to ask.
	answers = { ...answers, drift: a("on_track"), task_board_5: a("accurate"), task_granularity_5: a("appropriate") };
	const h = setup(branch); await h.emit("session_start");
	const cmd = (args: string) => h.commands.get("jev-audit").handler(args, h.ctx) as Promise<void>;
	await cmd(""); expect(requests).toHaveLength(1);
	await cmd(""); expect(requests).toHaveLength(1); expect(h.sent).toHaveLength(1); // no duplicate correction either
	await cmd("bogus"); expect(requests).toHaveLength(1);
	expect(h.ctx.ui.notify.mock.calls.some((c) => String(c[0]).startsWith("Usage: /jev-audit"))).toBe(true);
	await cmd("full"); expect(requests).toHaveLength(2);
	const full = JSON.stringify(requests[1]);
	expect(full).not.toContain("SECRET_COMMAND"); expect(full).not.toContain("SECRET_OUTPUT");
	expect(requests[1].state).toContain("Confirmed #5 passed"); // whole projected history, not only new input
	expect(h.sent).toHaveLength(1); // unchanged demand is still suppressed
	await cmd(""); expect(requests).toHaveLength(2); // the completed forced review is the new baseline
});

test("the processed frontier is scoped to its endpoint: a different apiUrl re-evaluates", async () => {
	// Same branch, same rules: only the endpoint changed — the stored receipt must not apply.
	const branch = [...initial()];
	answers = { ...answers, drift: a("on_track"), task_board_5: a("accurate"), task_granularity_5: a("appropriate") };
	const h = setup(branch, {}, { persist: true }); await h.emit("session_start"); await h.manual();
	expect(requests).toHaveLength(1);
	const other = setup(branch, { apiUrl: "https://other-endpoint.example/v1/systemone" }, { persist: true });
	await other.emit("session_start"); await other.manual();
	expect(requests).toHaveLength(2); // not an unchanged repeat
});

test("a late response after a branch switch appends no ledger entries to the active branch", async () => {
	// appendEntry writes to the live session file: after a branch switch, entries land on the ACTIVE branch.
	let active: unknown[] = [...initial()];
	const handlers = new Map<string, ((e: any, c: any) => Promise<void>)[]>();
	const commands = new Map<string, any>();
	const sent: { message: any; options: any }[] = [];
	const pi = {
		on: (n: string, h: any) => handlers.set(n, [...(handlers.get(n) ?? []), h]),
		registerCommand: (n: string, c: any) => commands.set(n, c),
		sendMessage: (m: any, o: any) => sent.push({ message: m, options: o }),
		appendEntry: (t: string, d: unknown) => { active.push({ id: `c${active.length}`, type: "custom", customType: t, data: d }); },
		events: { on: () => () => {} },
	} as unknown as ExtensionAPI;
	const ctxFor = () => ({ sessionManager: { getSessionId: () => "s1", getBranch: () => active, buildContextEntries: () => active }, ui: { notify: mock(() => {}) } });
	makeExtension(pi, { ...DEFAULT_CONFIG, apiKeyEnvVar: "JEV_AUDIT_TEST_KEY" });
	const emit = async (name: string) => { const ctx = ctxFor(); for (const h of handlers.get(name) ?? []) await h({}, ctx); };
	await emit("session_start");
	let release: (v: Response) => void = () => {};
	respond = () => new Promise<Response>((resolve) => { release = resolve; });
	const pending = commands.get("jev-audit").handler("", ctxFor()) as Promise<void>;
	await new Promise((r) => setTimeout(r, 10)); // the request is in flight
	active = [...initial(), user("other", "Different branch content entirely.")]; // branch switch (tip id changes)
	await emit("session_tree");
	release(response()); await pending;
	expect(active.filter((e: any) => e.type === "custom" && e.customType === "jev-todo-audit-ledger")).toHaveLength(0);
});
