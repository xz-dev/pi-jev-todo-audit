/** Consumer contract only. Script service replies; no provider/cache/recovery reimplementation. */
import { afterEach, beforeEach, expect, test } from "bun:test";
import makeExtension from "../index.js";
import { DEFAULT_CONFIG, loadConfig } from "../config.js";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { ClassifierChoiceAnswer, JudgeRequest, ReviewOptions, ReviewResult } from "../judgment-client.js";

const key = Symbol.for("pi-llm-as-jev:service");
const globals = globalThis as Record<symbol, unknown>;
let previous: unknown, owner: string | undefined, fetch: typeof globalThis.fetch;
beforeEach(() => {
	previous = globals[key]; delete globals[key]; owner = process.env.PI_JEV_TODO_AUDIT_OWNER_PID;
	process.env.PI_JEV_TODO_AUDIT_OWNER_PID = String(process.pid); fetch = globalThis.fetch;
	globalThis.fetch = (() => { throw new Error("Consumer must not use HTTP"); }) as unknown as typeof fetch;
});
afterEach(() => {
	if (previous === undefined) delete globals[key]; else globals[key] = previous;
	if (owner === undefined) delete process.env.PI_JEV_TODO_AUDIT_OWNER_PID; else process.env.PI_JEV_TODO_AUDIT_OWNER_PID = owner;
	globalThis.fetch = fetch;
});
function host(overrides = {}) {
	const branch: any[] = [
		{ id: "user", type: "message", message: { role: "user", content: "All parser acceptance checks for #5 passed. Reconcile only. No deployment or new work authorized." } },
		{ id: "board", type: "message", message: { role: "toolResult", toolName: "todo", content: "board", details: { tasks: [{ id: 5, subject: "Parser", status: "in_progress", description: "Check malformed input" }], nextId: 6 } } },
	];
	const handlers = new Map<string, any[]>(), commands = new Map<string, any>(), bus = new Map<string, any[]>();
	const sent: any[] = [], notices: string[] = [], noticeEvents: { text: string; level: string }[] = [];
	let authCalls = 0;
	const ctx = { sessionManager: { getSessionId: () => "consumer-contract", getBranch: () => branch, buildContextEntries: () => branch },
		ui: { notify: (text: string, level: string) => { notices.push(text); noticeEvents.push({ text, level }); } }, modelRegistry: { getApiKeyForProvider: () => { authCalls++; throw new Error("audit cannot resolve auth"); } } };
	makeExtension({ on: (name: string, fn: any) => handlers.set(name, [...(handlers.get(name) ?? []), fn]),
		registerCommand: (name: string, command: any) => commands.set(name, command),
		appendEntry: (customType: string, data: unknown) => branch.push({ id: `ledger-${branch.length}`, type: "custom", customType, data }),
		sendMessage: (message: unknown, options: unknown) => sent.push({ message, options }),
		events: { on: (name: string, fn: any) => { bus.set(name, [...(bus.get(name) ?? []), fn]); return () => {}; } },
	} as never, { ...DEFAULT_CONFIG, interval: 1, cooldownLoops: 0, ...overrides });
	return { branch, ctx, sent, notices, noticeEvents, authCalls: () => authCalls,
		emit: async (name: string, event = {}) => { for (const fn of handlers.get(name) ?? []) await fn(event, ctx); },
		manual: (mode = "") => commands.get("jev-audit").handler(mode, ctx),
	};
}
const empty = (backend: "llm" | "classifier" = "llm"): ReviewResult => ({ answers: {}, dropped: [], backend, model: "fixture/discrete", stopReason: "stop",
	reuse: { hits: 0, joined: 0, sent: 0 }, progress: { stages: [] }, unresolved: [], diagnostics: { attempts: [], attemptCount: 0, observationCoverage: "complete", usage: { inputTokens: { knownSum: 0, missing: 0 }, outputTokens: { knownSum: 0, missing: 0 }, costUsd: { knownSum: 0, missing: 0 } } } });

test("missing/old service notices are bounded; later discovery needs no re-enable and manual dependency errors stay clear", async () => {
	const h = host(); await h.emit("session_start");
	await h.emit("turn_end"); await h.emit("turn_end");
	expect(h.notices.filter((m) => m.includes("requires pi-llm-as-jev"))).toHaveLength(1);
	await h.manual(); expect(h.notices.filter((m) => m.includes("requires pi-llm-as-jev"))).toHaveLength(2);
	globals[key] = { version: 1, judge: () => { throw new Error("legacy judge forbidden"); } };
	await h.emit("turn_end"); await h.emit("turn_end");
	expect(h.notices.filter((m) => m.includes("requires pi-llm-as-jev"))).toHaveLength(3);
	let calls = 0;
	globals[key] = { version: 1, reviewVersion: 1, review: async () => { calls++; return empty(); } };
	await h.emit("turn_end"); expect(calls).toBe(1); expect(h.authCalls()).toBe(0);
	expect(h.sent).toHaveLength(0); await h.emit("session_shutdown");
});

for (const dependency of ["missing", "old"] as const) for (const mode of ["", "full"]) for (const autoFirst of [false, true])
test(`${dependency}: manual ${mode || "ordinary"} always reports dependency error (${autoFirst ? "after" : "before"} automatic notice)`, async () => {
	let legacyCalls = 0, calls = 0;
	if (dependency === "old") globals[key] = { version: 1, judge: () => { legacyCalls++; throw new Error("legacy fallback forbidden"); } };
	const h = host(); await h.emit("session_start");
	const dependencies = () => h.noticeEvents.filter(n => n.text.includes("requires pi-llm-as-jev"));
	if (autoFirst) {
		await h.emit("turn_end"); await h.emit("turn_end");
		expect(dependencies()).toHaveLength(1); expect(dependencies()[0].level).toBe("warning");
	}
	for (let i = 0; i < 2; i++) {
		const count = dependencies().length;
		await h.manual(mode);
		expect(dependencies()).toHaveLength(count + 1); expect(dependencies().at(-1)!.level).toBe("error");
	}
	const count = dependencies().length;
	await h.emit("turn_end"); await h.emit("turn_end"); expect(dependencies()).toHaveLength(count);
	expect(legacyCalls).toBe(0); expect(h.authCalls()).toBe(0); expect(h.sent).toHaveLength(0); expect(h.branch).toHaveLength(2);
	globals[key] = { version: 1, reviewVersion: 1, review: async () => { calls++; return empty(); } };
	await h.emit("turn_end"); expect(calls).toBe(1); expect(dependencies()).toHaveLength(count);
	await h.manual(mode); expect(calls).toBe(2); expect(h.authCalls()).toBe(0); expect(h.sent).toHaveLength(0);
	await h.emit("session_shutdown");
});

test("service-accepted LLM choices with zero compatibility numbers still reconcile, never authorize execution", async () => {
	const h = host({ confidenceThreshold: 0.99 });
	let calls = 0;
	globals[key] = { version: 1, reviewVersion: 1, review: async (request: JudgeRequest, options: ReviewOptions) => {
		calls++; expect(options.minConfidence).toBe(0.99);
		const projected = options.projectStage!({ evidence: request.evidence!.map((record) => ({ record })), completed: [], previousAnswers: {}, final: true });
		const choices: Record<string, string> = { alignment: "aligned", current_match: "5", interaction: "waiting_user", drift: "on_track", task_status_5: "actually_completed", task_evidence_5: "user", work_evidence: "user", task_board_5: "accurate", task_granularity_5: "appropriate" };
		const answers: Record<string, ClassifierChoiceAnswer> = {};
		for (const [id, q] of Object.entries(projected.questions)) {
			if (q.type !== "choice" || !choices[id] || !Object.hasOwn(q.criteria, choices[id])) throw new Error(`Unscripted question ${id}`);
			answers[id] = { type: "choice", choice: choices[id], confidence: 0, probabilities: Object.fromEntries(Object.keys(q.criteria).map((label) => [label, label === choices[id] ? 1 : 0])) };
		}
		return { ...empty(), answers };
	} };
	await h.emit("session_start"); await h.manual();
	expect(calls).toBe(1); expect(h.sent).toHaveLength(1);
	expect(h.sent[0].message.content).toContain("#5"); expect(h.sent[0].message.content).toContain("Evidence [user]");
	expect(h.sent[0].options.triggerTurn).not.toBe(true);
	expect(h.branch.filter((e) => e.type === "message" && e.message.role === "toolResult")).toHaveLength(1);
	expect(h.authCalls()).toBe(0); await h.emit("session_shutdown");
});

test("old audit credentials remain redacted data, never auth or service configuration", async () => {
	const secret = "obsoleteopaquecredentialforfixture", projectSecret = "ignoredprojectcredentialforfixture";
	const dir = mkdtempSync("/var/tmp/jev-legacy-config-");
	const globalPath = join(dir, "global.json"), projectPath = join(dir, "project.json");
	const globalText = JSON.stringify({ apiKey: secret, model: "old/model", apiUrl: "https://legacy.invalid" });
	const projectText = JSON.stringify({ apiKey: projectSecret, apiKeyEnvVar: "IGNORED_PROJECT_ENV" });
	writeFileSync(globalPath, globalText); writeFileSync(projectPath, projectText);
	try {
		const untrusted = loadConfig({ globalPath, projectPath, projectTrusted: false });
		expect(untrusted.legacySecrets).not.toContain(projectSecret);
		const cfg = loadConfig({ globalPath, projectPath, projectTrusted: true });
		expect(cfg.apiKey).toBe(secret); expect(cfg.apiKeyEnvVar).toBe(DEFAULT_CONFIG.apiKeyEnvVar);
		const h = host(cfg);
		h.branch[0].message.content += ` ${secret} ${projectSecret}`;
		h.branch[1].message.details.tasks[0].subject += ` ${projectSecret}`;
		const calls: { request: JudgeRequest; options: ReviewOptions }[] = [];
		globals[key] = { version: 1, reviewVersion: 1, review: async (request: JudgeRequest, options: ReviewOptions) => {
			calls.push({ request, options });
			return { ...empty(), stopReason: "error", errorMessage: `Scripted failure ${secret} ${projectSecret}` };
		} };
		await h.emit("session_start"); await h.manual(); await h.manual();
		// Assert outside the isolated audit callback: a swallowed fixture error cannot pass.
		expect(calls).toHaveLength(2); expect(h.authCalls()).toBe(0); expect(h.sent).toHaveLength(0);
		for (const { request, options } of calls) {
			for (const value of [secret, projectSecret, "legacy.invalid"]) expect(JSON.stringify(request)).not.toContain(value);
			expect(options).not.toHaveProperty("apiKey"); expect(options).not.toHaveProperty("model");
		}
		const migration = h.notices.filter(m => m.includes("ignored legacy fields"));
		expect(migration).toHaveLength(1); expect(migration[0]).toContain("apiKeyEnvVar");
		for (const value of [secret, projectSecret, "IGNORED_PROJECT_ENV"]) expect(h.notices.join(" ")).not.toContain(value);
		expect(readFileSync(globalPath, "utf8")).toBe(globalText); expect(readFileSync(projectPath, "utf8")).toBe(projectText);
		await h.emit("session_shutdown");
	} finally { rmSync(dir, { recursive: true, force: true }); }
});
