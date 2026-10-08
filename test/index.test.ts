/** Active entrypoint regressions for the stateless judgment port. No provider inference. */
import { afterEach, beforeEach, expect, test } from "bun:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
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
	})), backend: "classifier", model: "fixture/native", dropped: [], stopReason: "stop", reuse: { hits: 0, joined: 0, sent: 1 } };
}
function install(judge: JudgmentService["judge"]): void {
	const service: JudgmentService = { version: 1, judge, availability: async () => ({}), capacityVersion: 1,
		describeSelection: async () => ({ backend: "classifier", model: "fixture/native", limits: { request: 32000 }, limitSource: "model", tokensPerByte: 0.5, prior: true, envelopeOverheadBytes: 0 }) };
	services[key] = service;
}
function host(branch = initial(), opts: { persist?: boolean; enabled?: boolean; interval?: number; cooldownLoops?: number; timeoutMs?: number } = {}) {
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

test("manual audit persists before delivering reported completion; reload does not rejudge or repeat", async () => {
	const requests: JudgeRequest[] = [], options: JudgeOptions[] = [];
	install(async (req, opts) => { requests.push(req); options.push(opts!); return reply(req); });
	const h = host(); await h.emit("session_start"); await h.manual();
	expect(requests).toHaveLength(1); expect(h.branch.some((e) => e.customType === STATE_TYPE)).toBe(true);
	expect(h.sent).toHaveLength(1); expect(h.sent[0].message.content).toContain("reported, not independently verified");
	expect(h.sent[0].message.content).toContain("not a user message"); expect(h.sent[0].options).toEqual({ deliverAs: "steer" });
	// No audit default: the service applies its backend default unless the user configures a value.
	expect(options[0].timeoutMs).toBeUndefined(); expect(options[0].minConfidence).toBe(DEFAULT_CONFIG.confidenceThreshold);
	expect(Object.keys(options[0]).sort()).toEqual(["minConfidence", "signal"]);
	await h.manual(); expect(requests).toHaveLength(1); expect(h.sent).toHaveLength(1);
	const reload = host(h.branch); await reload.emit("session_start"); await reload.manual();
	expect(requests).toHaveLength(1); expect(reload.sent).toHaveLength(0);
});

test("a configured timeoutMs reaches the service unchanged; the service interprets it per backend", async () => {
	const options: JudgeOptions[] = [];
	install(async (req, opts) => { options.push(opts!); return reply(req); });
	const h = host(initial(), { timeoutMs: 45_000 }); await h.emit("session_start"); await h.manual();
	expect(options[0].timeoutMs).toBe(45_000);
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
