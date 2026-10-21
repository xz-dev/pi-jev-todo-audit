/** Active entrypoint regressions for the stateless judgment port. No provider inference. */
import { afterEach, beforeEach, expect, test } from "bun:test";
import { AgentSession, createExtensionRuntime, SessionManager, SettingsManager, type ExtensionAPI, type ModelRuntime, type ResourceLoader } from "@earendil-works/pi-coding-agent";
import { createAssistantMessageEventStream, type AssistantMessage } from "@earendil-works/pi-ai";
import makeExtension from "../index.js";
import { DEFAULT_CONFIG } from "../config.js";
import type { JudgeOptions, JudgeRequest, JudgeResult, JudgmentService } from "../judgment-client.js";
import { STATE_TYPE } from "../state.js";

const key = Symbol.for("pi-llm-as-jev:service");
const services = globalThis as Record<symbol, unknown>;
let saved: unknown, owner: string | undefined;
beforeEach(() => { saved = services[key]; owner = process.env.PI_JEV_TODO_AUDIT_OWNER_PID; process.env.PI_JEV_TODO_AUDIT_OWNER_PID = String(process.pid); });
afterEach(() => {
	if (saved === undefined) delete services[key]; else services[key] = saved;
	if (owner === undefined) delete process.env.PI_JEV_TODO_AUDIT_OWNER_PID; else process.env.PI_JEV_TODO_AUDIT_OWNER_PID = owner;
});
const message = (id: string, role: string, content: string) => ({ id, type: "message", message: { role, content } });
const task = { id: 5, subject: "Parser", status: "in_progress", description: "Reject malformed input. Do not deploy." };
const initial = (): any[] => [message("u", "user", "Implement Parser, but do not deploy."),
	{ id: "board", type: "message", message: { role: "toolResult", toolName: "todo", content: "Updated", details: { tasks: [task], nextId: 6 } } },
	message("report", "assistant", "Parser now rejects malformed input; all agreed checks passed. No deployment performed.")];

function reply(req: JudgeRequest, overrides: Record<string, string> = {}): JudgeResult {
	// Explicit choices for this fixture. No service inference or repair simulation.
	const choices: Record<string, string> = { task_status_5: "completion_reported", task_evidence_5: "report", task_board_5: "accurate", task_granularity_5: "unchanged",
		task_granularity_evidence_5: "none_in_segment",
		interaction: "unchanged", work_evidence: "none_in_segment", current_work_evidence: "none_in_segment", scope_evidence: "none_in_segment", current_work: "same_work", scope_update: "no_scope_change", drift: "on_track", ...overrides };
	return { answers: Object.fromEntries(Object.entries(req.questions).map(([id, q]) => {
		const choice = choices[id];
		if (q.type !== "choice" || !choice || !Object.hasOwn(q.criteria, choice)) throw new Error(`Unscripted choice ${id}: ${choice}`);
		return [id, { type: "choice", choice, confidence: 0.95, probabilities: { [choice]: 0.95 } }];
	})), backend: "classifier", model: "fixture/native", dropped: [], stopReason: "stop" };
}
function install(judge: JudgmentService["judge"]): void {
	const service: JudgmentService = { version: 2, judge, availability: async () => ({}), capacityVersion: 2,
		describeSelection: async () => ({ backend: "classifier", model: "fixture/native", limits: { request: 32000 }, limitSource: "model" }) };
	services[key] = service;
}
function host(branch = initial(), opts: { persist?: boolean; enabled?: boolean; interval?: number; cooldownLoops?: number; idleTimeoutMs?: number; modelTimeoutMs?: number; legacyTimeoutConfigured?: boolean } = {}) {
	const handlers = new Map<string, ((e: any, c: any) => Promise<void>)[]>(), commands = new Map<string, any>(), bus = new Map<string, (data: unknown) => void>();
	const sent: { message: any; options: any }[] = [], notices: [string, string?][] = [];
	const ctx = { sessionManager: { getSessionId: () => "s", getBranch: () => branch, buildContextEntries: () => branch }, ui: { notify: (m: string, l?: string) => notices.push([m, l]) } };
	const pi = { on: (name: string, fn: any) => handlers.set(name, [...(handlers.get(name) ?? []), fn]),
		registerCommand: (name: string, command: any) => commands.set(name, command), events: { on: (name: string, fn: any) => bus.set(name, fn) },
		sendMessage: (message: any, options: any) => { sent.push({ message, options }); branch.push({ id: `advice-${branch.length}`, type: "custom_message", ...message }); },
		...(opts.persist === false ? {} : { appendEntry: (customType: string, data: unknown) => branch.push({ id: `state-${branch.length}`, type: "custom", customType, data }) }) } as unknown as ExtensionAPI;
	makeExtension(pi, { ...DEFAULT_CONFIG, legacyFields: [], ...opts });
	return { branch, ctx, sent, notices,
		emit: async (event: string, data = {}) => { for (const fn of handlers.get(event) ?? []) await fn(data, ctx); },
		manual: (args = "") => commands.get("jev-audit").handler(args, ctx) as Promise<void>,
		stop: () => bus.get("pi:semantic-hook:v1")?.({ version: 1, name: "user-ready", values: { STOP_KIND: "AI_UNLOCK", REASON_TYPE: "JOB_DONE", REASON: "done" } }),
	};
}
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const parallelTasks = (active: number, pending = 0) => Array.from({ length: active + pending }, (_, i) => ({
	...task, id: i + 1, status: i < active ? "in_progress" : "pending",
}));
async function finishLoop(h: ReturnType<typeof host>, tasks?: ReturnType<typeof parallelTasks>) {
	const assistant = message(`loop-${h.branch.length}`, "assistant", "Continuing within the agreed scope.");
	await h.emit("message_end", { message: assistant.message }); h.branch.push(assistant);
	if (tasks) {
		const result = { id: `todo-${h.branch.length}`, type: "message", message: { role: "toolResult", toolName: "todo", content: "Updated", details: { tasks, nextId: tasks.length + 1 } } };
		// Pi emits message_end before persistence; turn_end sees all recorded tool results.
		await h.emit("message_end", { message: result.message }); h.branch.push(result);
	}
	await h.emit("turn_end");
}

test("in-progress limit: three stay silent; fourth recorded result immediately reminds without JEV", async () => {
	delete services[key];
	const h = host([message("u", "user", "Work within the agreed scope.")], { interval: 1000, cooldownLoops: 1000 });
	await h.emit("session_start");
	await finishLoop(h, parallelTasks(3, 100)); expect(h.sent).toHaveLength(0);
	const tasks = parallelTasks(4, 100), before = structuredClone(tasks);
	await finishLoop(h, tasks);
	expect(h.sent).toHaveLength(1);
	const advice = h.sent[0];
	expect(advice.message.content).toContain("4 in_progress");
	for (const text of ["3", "split", "reorganize", "cancel", "pending", "not a user message", "new authorization"]) expect(advice.message.content).toContain(text);
	expect(advice.options).toEqual({ deliverAs: "steer", triggerTurn: false });
	expect(h.branch.at(-2).message.details.tasks).toEqual(before);
	expect(h.branch.at(-1).customType).toBe("jev-todo-audit");
	expect(tasks).toEqual(before);
});

test("in-progress limit: distances one through nine are silent; ten reminds; corrected board stays silent", async () => {
	delete services[key];
	const h = host([], { interval: 1000, cooldownLoops: 1000 }); await h.emit("session_start");
	await finishLoop(h, parallelTasks(4)); expect(h.sent).toHaveLength(1);
	for (let distance = 1; distance <= 9; distance++) {
		if (distance === 5) {
			const user = message("steer", "user", "Keep the existing scope.");
			await h.emit("message_end", { message: user.message }); h.branch.push(user);
		}
		await finishLoop(h); expect(h.sent).toHaveLength(1);
	}
	await finishLoop(h); expect(h.sent).toHaveLength(2);
	await finishLoop(h, parallelTasks(3, 100));
	for (let i = 0; i < 10; i++) await finishLoop(h);
	expect(h.sent).toHaveLength(2);
});

test("in-progress limit: cooldown follows the active branch through reload, compaction and tree navigation", async () => {
	delete services[key];
	const opts = { interval: 1000, cooldownLoops: 1000 };
	const first = host([], opts); await first.emit("session_start");
	await finishLoop(first, parallelTasks(4));
	for (let i = 0; i < 4; i++) await finishLoop(first);
	const original = structuredClone(first.branch), reload = host(structuredClone(original), opts);
	await reload.emit("session_start");
	await finishLoop(reload); expect(reload.sent).toHaveLength(0); // distance 5
	reload.ctx.sessionManager.buildContextEntries = () => [message("summary", "assistant", "Derived summary only.")];
	await reload.emit("session_compact");
	for (let distance = 6; distance <= 9; distance++) { await finishLoop(reload); expect(reload.sent).toHaveLength(0); }
	await finishLoop(reload); expect(reload.sent).toHaveLength(1);
	// An alternative branch cannot inherit the other branch's reminder.
	reload.branch.splice(0, reload.branch.length, message("other", "user", "Different authorized work."));
	await reload.emit("session_tree"); await finishLoop(reload, parallelTasks(4)); expect(reload.sent).toHaveLength(2);
	// Returning to the original branch restores its own distance-four checkpoint.
	reload.branch.splice(0, reload.branch.length, ...original); await reload.emit("session_tree");
	for (let distance = 5; distance <= 9; distance++) { await finishLoop(reload); expect(reload.sent).toHaveLength(2); }
	await finishLoop(reload); expect(reload.sent).toHaveLength(3);
});

for (const serviceState of ["busy", "error"]) test(`in-progress limit: JEV ${serviceState} does not block the reminder`, async () => {
	let entered!: () => void, release!: () => void;
	const started = new Promise<void>((r) => { entered = r; }), waiting = new Promise<void>((r) => { release = r; });
	install(async () => { entered(); if (serviceState === "busy") await waiting; throw new Error("fixture service unavailable"); });
	const h = host(initial(), { interval: 1000, cooldownLoops: 1000 }); await h.emit("session_start");
	const audit = h.manual(); await started;
	if (serviceState === "error") await audit;
	await finishLoop(h, parallelTasks(4)); expect(h.sent).toHaveLength(1);
	expect(h.sent[0].message.content).toContain("4 in_progress");
	release(); await audit; expect(h.sent).toHaveLength(1);
});

test("in-progress limit: corrected final tool result and disabled configuration produce no queued notice or wake", async () => {
	delete services[key];
	for (const enabled of [true, false]) {
		const h = host([], { enabled, interval: 1000 }); await h.emit("session_start");
		const assistant = message("loop", "assistant", "Reorganizing within the existing scope.");
		await h.emit("message_end", { message: assistant.message }); h.branch.push(assistant);
		for (const active of enabled ? [4, 3] : [4]) {
			const result = { id: `todo-${active}`, type: "message", message: { role: "toolResult", toolName: "todo", details: { tasks: parallelTasks(active), nextId: 5 } } };
			await h.emit("message_end", { message: result.message }); h.branch.push(result);
			expect(h.sent).toHaveLength(0);
		}
		await h.emit("turn_end"); h.stop(); await tick(); expect(h.sent).toHaveLength(0);
	}
});

// Resolve Pi's own Agent dependency; exercise its real loop and AgentSession delivery/flush ordering.
const { Agent } = await import(import.meta.resolve("@earendil-works/pi-agent-core", import.meta.resolve("@earendil-works/pi-coding-agent")));
async function deliverySession(interval: number) {
	const sessionManager = SessionManager.inMemory(), settingsManager = SettingsManager.inMemory();
	settingsManager.setCompactionEnabled(false); settingsManager.setRetryEnabled(false);
	const model = { api: "openai-responses", provider: "openai", id: "local-fixture", name: "Local fixture", reasoning: false,
		input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 32000, maxTokens: 1000 };
	const answer = { role: "assistant", api: model.api, provider: model.provider, model: model.id,
		content: [{ type: "text", text: "Finished. Waiting for input." }], stopReason: "stop", timestamp: 0,
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } } satisfies AssistantMessage;
	sessionManager.appendMessage({ role: "user", content: "Keep the agreed scope; wait when finished.", timestamp: 0 });
	sessionManager.appendMessage({ ...answer, stopReason: "toolUse", content: [{ type: "toolCall", id: "board", name: "todo", arguments: { action: "list" } }] });
	sessionManager.appendMessage({ role: "toolResult", toolCallId: "board", toolName: "todo", content: [{ type: "text", text: "Board" }],
		details: { tasks: parallelTasks(4), nextId: 5 }, isError: false, timestamp: 0 });
	let calls = 0;
	const agent = new Agent({ initialState: { model, messages: sessionManager.buildSessionContext().messages },
		streamFn: () => { calls++; const stream = createAssistantMessageEventStream(); stream.push({ type: "done", reason: "stop", message: answer }); return stream; } });
	const extension = { path: import.meta.filename, resolvedPath: import.meta.filename, sourceInfo: { source: "sdk" },
		handlers: new Map(), tools: new Map(), commands: new Map(), flags: new Map(), shortcuts: new Map(), messageRenderers: new Map() };
	const pi = { on: (name: string, fn: any) => extension.handlers.set(name, [...(extension.handlers.get(name) ?? []), fn]),
		registerCommand: () => {}, events: { on: () => {} },
		sendMessage: (message: any, options: any) => { void session.sendCustomMessage(message, options); },
		appendEntry: (customType: string, data: unknown) => sessionManager.appendCustomEntry(customType, data) } as unknown as ExtensionAPI;
	makeExtension(pi, { ...DEFAULT_CONFIG, legacyFields: [], interval, cooldownLoops: 0 });
	const resourceLoader = { getExtensions: () => ({ extensions: [extension], runtime: createExtensionRuntime(), errors: [] }),
		getSystemPrompt: () => "Local delivery test", getAppendSystemPrompt: () => [], getSkills: () => ({ skills: [] }),
		getAgentsFiles: () => ({ agentsFiles: [] }) } as unknown as ResourceLoader;
	const session = new AgentSession({ agent, sessionManager, settingsManager, cwd: process.cwd(), resourceLoader,
		modelRuntime: { hasConfiguredAuth: () => true } as unknown as ModelRuntime, baseToolsOverride: {} });
	const errors: unknown[] = [];
	await session.bindExtensions({ onError: (error) => errors.push(error) });
	return { session, agent, errors, calls: () => calls,
		reminder: () => sessionManager.getBranch().some((e) => e.type === "custom_message" && (e.details as any)?.inProgressLimitLoop !== undefined) };
}

test("in-progress delivery: terminal reminder records without another assistant iteration", async () => {
	delete services[key];
	const h = await deliverySession(1000);
	try {
		await h.session.prompt("Finish within the agreed scope, then wait.", { expandPromptTemplates: false });
		expect(h.errors).toEqual([]); expect(h.calls()).toBe(1);
		expect(h.agent.hasQueuedMessages()).toBe(false); expect(h.reminder()).toBe(true);
	} finally { h.session.dispose(); }
});

test("in-progress delivery: reminder reaches branch and context while same-boundary JEV remains unresolved", async () => {
	let entered!: () => void, release!: () => void;
	const started = new Promise<void>((r) => { entered = r; }), waiting = new Promise<void>((r) => { release = r; });
	install(async () => { entered(); await waiting; throw new Error("held local judgment released"); });
	const h = await deliverySession(1);
	const running = h.session.prompt("Finish within the agreed scope, then wait.", { expandPromptTemplates: false });
	try {
		await started; await tick();
		expect(h.errors).toEqual([]); expect(h.reminder()).toBe(true);
		expect(h.agent.state.messages.some((m: any) => m.role === "custom" && m.details?.inProgressLimitLoop !== undefined)).toBe(true);
		expect(h.calls()).toBe(1); expect(h.agent.hasQueuedMessages()).toBe(false);
	} finally { release(); await running; await tick(); h.session.dispose(); }
	expect(h.calls()).toBe(1);
});

test("manual audit persists before delivering reported completion; reload does not rejudge or repeat", async () => {
	const requests: JudgeRequest[] = [], options: JudgeOptions[] = [];
	install(async (req, opts) => { requests.push(req); options.push(opts!); return reply(req); });
	const h = host(); await h.emit("session_start"); await h.manual();
	expect(requests).toHaveLength(1); expect(h.branch.some((e) => e.customType === STATE_TYPE)).toBe(true);
	expect(h.sent).toHaveLength(1); expect(h.sent[0].message.content).toContain("reported, not independently verified");
	expect(h.sent[0].message.content).toContain("not a user message"); expect(h.sent[0].options).toEqual({ deliverAs: "steer" });
	// No audit default: the service applies its own defaults unless the user configures a value.
	expect(options[0].idleTimeoutMs).toBeUndefined(); expect(options[0].modelTimeoutMs).toBeUndefined();
	expect(options[0].minConfidence).toBe(DEFAULT_CONFIG.confidenceThreshold);
	expect(Object.keys(options[0]).sort()).toEqual(["minConfidence", "signal"]);
	await h.manual(); expect(requests).toHaveLength(1); expect(h.sent).toHaveLength(1);
	const reload = host(h.branch); await reload.emit("session_start"); await reload.manual();
	expect(requests).toHaveLength(1); expect(reload.sent).toHaveLength(0);
});

test("configured idle/model timeouts reach the service unchanged as independent per-attempt options", async () => {
	const options: JudgeOptions[] = [];
	install(async (req, opts) => { options.push(opts!); return reply(req); });
	const h = host(initial(), { idleTimeoutMs: 45_000, modelTimeoutMs: 120_000 }); await h.emit("session_start"); await h.manual();
	expect(options[0].idleTimeoutMs).toBe(45_000); expect(options[0].modelTimeoutMs).toBe(120_000);
});

test("legacy configured timeoutMs blocks audit inference with a migration diagnostic, not TODO work", async () => {
	let calls = 0;
	install(async (req) => { calls++; return reply(req); });
	const h = host(initial(), { legacyTimeoutConfigured: true }); await h.emit("session_start"); await h.manual();
	expect(calls).toBe(0); expect(h.sent).toHaveLength(0);
	expect(h.notices.some(([m, l]) => m.includes('"timeoutMs"') && m.includes("idleTimeoutMs") && m.includes("modelTimeoutMs") && l === "error")).toBe(true);
	await h.manual("full"); expect(calls).toBe(0);
	// A cleared configuration resumes ordinary inference.
	const migrated = host(h.branch); await migrated.emit("session_start"); await migrated.manual();
	expect(calls).toBeGreaterThan(0);
});

test("a second audit sends only the suffix and old protocol ledger entries are not evidence", async () => {
	const requests: JudgeRequest[] = [];
	install(async (req) => { requests.push(req); return reply(req, requests.length === 1 ? {} : { task_status_5: "no_change", task_evidence_5: "keep_prior" }); });
	const h = host(); h.branch.push({ id: "old", type: "custom", customType: "jev-todo-audit-ledger", data: { kind: "receipt", secret: "OLD_BOOKKEEPING" } });
	await h.emit("session_start"); await h.manual();
	h.branch.push(message("new", "assistant", "Waiting for the next instruction."));
	await h.manual(); expect(requests).toHaveLength(2);
	const serialized = String(requests[1].state.audit);
	expect(serialized).toContain("Waiting for the next instruction."); expect(serialized).not.toContain("Implement Parser, but do not deploy.");
	expect(serialized).not.toContain("OLD_BOOKKEEPING"); expect(h.sent).toHaveLength(1);
});

for (const mutation of ["board", "same-id-text", "branch", "effective-context"]) test(`late result is fenced by ${mutation} even without a lifecycle callback`, async () => {
	let finish!: () => void, entered!: () => void;
	const started = new Promise<void>((r) => { entered = r; });
	install((req) => new Promise((resolve) => { finish = () => resolve(reply(req)); entered(); }));
	const h = host(); await h.emit("session_start"); const pending = h.manual(); await started;
	if (mutation === "board") h.branch[1].message.details.tasks = [{ ...task, description: "NEW requirement not met" }];
	if (mutation === "same-id-text") h.branch[0].message.content = "Stop; all prior scope withdrawn.";
	if (mutation === "branch") h.branch.splice(0, h.branch.length, message("other", "user", "Different branch"));
	if (mutation === "effective-context") h.ctx.sessionManager.buildContextEntries = () => [message("summary", "user", "Changed effective input")];
	finish(); await pending;
	expect(h.sent).toHaveLength(0); expect(h.branch.some((e) => e.customType === STATE_TYPE)).toBe(false);
});

test("user abort releases the single-active slot; late first result cannot publish", async () => {
	let finish!: () => void, entered!: () => void, calls = 0;
	const started = new Promise<void>((r) => { entered = r; });
	install((req) => { calls++; if (calls > 1) return Promise.resolve(reply(req)); return new Promise((r) => { finish = () => r(reply(req)); entered(); }); });
	const h = host(); await h.emit("session_start"); const pending = h.manual(); await started;
	await h.emit("message_end", { message: { role: "user" } }); await pending;
	expect(h.sent).toHaveLength(0); await h.manual(); expect(calls).toBe(2); expect(h.sent).toHaveLength(1);
	finish(); await tick(); expect(h.sent).toHaveLength(1);
});

test("missing persistence cannot produce completion advice", async () => {
	install(async (req) => reply(req)); const h = host(initial(), { persist: false }); await h.emit("session_start"); await h.manual();
	expect(h.sent).toHaveLength(0); expect(h.notices.some(([m]) => m.includes("state persistence failed"))).toBe(true);
});

test("missing dependency stays visible on each manual request; disabled mode does no work", async () => {
	delete services[key]; const h = host(); await h.emit("session_start"); await h.manual(); await h.manual("full");
	expect(h.notices.filter(([m, l]) => m.includes("requires pi-llm-as-jev") && l === "error")).toHaveLength(2);
	const disabled = host(initial(), { enabled: false }); await disabled.manual(); expect(disabled.notices[0][0]).toContain("disabled");
});

test("incompatible v1 dependency skips advice and rechecks v2 on the next trigger without reload", async () => {
	let calls = 0;
	services[key] = { version: 1, judge: async () => { calls++; throw new Error("Incompatible service must not run"); } };
	const h = host(); const before = structuredClone(h.branch);
	await h.emit("session_start"); await h.manual();
	expect(calls).toBe(0); expect(h.sent).toHaveLength(0); expect(h.branch).toEqual(before);
	expect(h.notices.some(([m]) => m.includes("judgment service version 2") && m.includes("TODO remains available"))).toBe(true);
	install(async (req) => { calls++; return reply(req); });
	await h.manual();
	expect(calls).toBe(1); expect(h.sent).toHaveLength(1);
});

test("terminal completion remains board-only and ordinary cadence keeps user cooldown", async () => {
	let calls = 0; install(async (req) => { calls++; return reply(req); });
	const h = host(initial(), { interval: 1, cooldownLoops: 2 }); await h.emit("session_start");
	await h.emit("message_end", { message: { role: "user" } }); await h.emit("turn_end"); expect(calls).toBe(0);
	h.stop(); await tick(); expect(calls).toBe(1); expect(h.sent).toHaveLength(1);
	expect(h.sent[0].options.triggerTurn).toBe(true); expect(h.sent[0].message.content).toContain("BOARD ONLY");
});

test("a changed task contract invalidates its old completion even without a new history record", async () => {
	let calls = 0;
	install(async (req) => { calls++; return reply(req, calls === 1 ? {} : { task_status_5: "no_change", task_evidence_5: "none_in_segment" }); });
	const h = host(); await h.emit("session_start"); await h.manual();
	expect(h.sent).toHaveLength(1);
	h.branch[1].message.details.tasks = [{ ...task, description: "An additional unmet acceptance requirement now applies." }];
	await h.manual();
	expect(calls).toBeGreaterThan(1); expect(h.sent).toHaveLength(1);
});

for (const keepOriginal of [true, false]) test(`cold effective-context loss uses originals, not summary authority (original=${keepOriginal})`, async () => {
	let calls = 0;
	install(async (req) => {
		calls++;
		return reply(req, calls === 1 ? {
			task_status_5: "actionable_now", task_granularity_5: "resolved", task_granularity_evidence_5: "report",
			interaction: "permission_granted", work_evidence: "u", current_work: "switched_to_5", current_work_evidence: "report",
		} : {
			task_status_5: "no_change", task_evidence_5: "keep_prior", task_granularity_evidence_5: "keep_prior",
			interaction: "work_resumed", work_evidence: "next", current_work: "switched_to_5", current_work_evidence: "next",
		});
	});
	const first = host(); await first.emit("session_start"); await first.manual();
	const branch = structuredClone(first.branch).filter((e: any) => keepOriginal || e.id !== "u");
	const next = message("next", "assistant", "Ready for the next step in the original scope."); branch.push(next);
	const reload = host(branch);
	reload.ctx.sessionManager.buildContextEntries = () => [message("summary", "assistant", "Summary claims the user authorized continuing."), next];
	await reload.emit("session_start"); reload.stop(); await tick();
	expect(calls).toBeGreaterThan(1);
	if (keepOriginal) {
		expect(reload.sent).toHaveLength(1);
		expect(reload.sent[0].message.content).toContain("CONTINUE");
	} else expect(reload.sent).toHaveLength(0);
});
