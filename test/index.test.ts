/**
 * Integration test: fake ExtensionAPI + fake ctx driving a synthetic agent
 * loop. Verifies wiring: count → %10 → cooldown → jev call → inject.
 */

import { describe, expect, mock, test } from "bun:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Mock fetch before importing index.ts (runAudit captures global fetch at call
// time via opts.fetchFn ?? fetch — index passes no fetchFn, so stub global).
const auditCalls: unknown[] = [];
const auditAnswers = {
	alignment: { choice: "not_aligned", confidence: 0.95 },
	lifecycle: { task_status_5: { choice: "actually_completed", confidence: 0.9 } },
	current_match: { choice: "not_on_board", confidence: 0.9 },
	drift: { choice: "on_track", confidence: 0.9 },
};
(globalThis as any).fetch = mock(async (url: string) => {
	auditCalls.push(url);
	return new Response(JSON.stringify({ answers: auditAnswers }), { status: 200 });
});

process.env.JEV_AUDIT_TEST_KEY = "sk-x";

const { default: makeExtension } = await import("../index.js");
const cfgMod = await import("../config.js");

type Handler = (event: any, ctx: any) => Promise<any>;

function makePi() {
	const handlers = new Map<string, Handler[]>();
	const commands = new Map<string, { handler: (args: string, ctx: any) => Promise<void> }>();
	const busHandlers = new Map<string, ((data: unknown) => void)[]>();
	const sent: { message: any; options: any }[] = [];
	const pi = {
		on: (event: string, h: Handler) => { handlers.set(event, [...(handlers.get(event) ?? []), h]); },
		registerCommand: (name: string, opts: any) => { commands.set(name, opts); },
		sendMessage: (message: any, options: any) => { sent.push({ message, options }); },
		events: {
			on: (channel: string, h: (data: unknown) => void) => {
				busHandlers.set(channel, [...(busHandlers.get(channel) ?? []), h]);
				return () => {};
			},
			emit: (channel: string, data: unknown) => {
				for (const h of busHandlers.get(channel) ?? []) h(data);
			},
		},
	} as unknown as ExtensionAPI;
	return { pi, handlers, commands, sent, bus: pi.events as { emit: (c: string, d: unknown) => void } };
}

const todoResult = (tasks: unknown[]) => ({
	type: "message",
	message: { role: "toolResult", toolName: "todo", details: { tasks, nextId: 9 } },
});

function makeCtx(branch: unknown[]) {
	return {
		sessionManager: {
			getSessionId: () => "s1",
			getBranch: () => branch,
		},
		ui: { notify: mock(() => {}) },
	};
}

async function emit(handlers: Map<string, Handler[]>, name: string, event: any, ctx: any) {
	for (const h of handlers.get(name) ?? []) await h(event, ctx);
}

describe("index wiring", () => {
	test("first eligible periodic audit fires after cooldown window; cooldown skips", async () => {
		const { pi, handlers, sent } = makePi();
		makeExtension(pi, { ...cfgMod.DEFAULT_CONFIG, apiKeyEnvVar: "JEV_AUDIT_TEST_KEY" });

		const branch: unknown[] = [
			{ type: "message", message: { role: "user", content: "build stuff" } },
			todoResult([{ id: 5, subject: "Board task", status: "in_progress" }]),
		];
		const ctx = makeCtx(branch);

		await emit(handlers, "session_start", {}, ctx);

		// loops 1..19: loop 10 skipped (cooldown 10, lastUserMsgAt=0 → 10 ≤ 10)
		for (let i = 0; i < 19; i++) {
			branch.push({ type: "message", message: { role: "assistant", content: `work ${i}` } });
			await emit(handlers, "turn_end", { turnIndex: i }, ctx);
		}
		expect(auditCalls.length).toBe(0);

		// loop 20: 20 > 10 → audit fires, misaligned → inject
		branch.push({ type: "message", message: { role: "assistant", content: "writing parser" } });
		await emit(handlers, "turn_end", { turnIndex: 19 }, ctx);
		expect(auditCalls.length).toBe(1);
		expect(sent.length).toBe(1);
		expect(sent[0].options).toEqual({ deliverAs: "steer" });
		expect(sent[0].message.customType).toBe("jev-todo-audit");
		expect(sent[0].message.content).toContain("#5");

		// user steers at loop 20 → cooldown resets; loop 30 is 10 after → skip
		branch.push({ type: "message", message: { role: "user", content: "wait, do X first" } });
		await emit(handlers, "message_end", { message: { role: "user" } }, ctx);
		for (let i = 0; i < 10; i++) {
			branch.push({ type: "message", message: { role: "assistant", content: "x" } });
			await emit(handlers, "turn_end", { turnIndex: 20 + i }, ctx);
		}
		expect(auditCalls.length).toBe(1);
		// loops 31..40 → loop 40 audits (40-20=20 > 10)
		for (let i = 0; i < 10; i++) {
			branch.push({ type: "message", message: { role: "assistant", content: "y" } });
			await emit(handlers, "turn_end", { turnIndex: 30 + i }, ctx);
		}
		expect(auditCalls.length).toBe(2);
	});

	test("/jev-audit command fires audit immediately, bypassing interval+cooldown", async () => {
		const { pi, handlers, commands, sent } = makePi();
		makeExtension(pi, { ...cfgMod.DEFAULT_CONFIG, apiKeyEnvVar: "JEV_AUDIT_TEST_KEY" });
		const branch: unknown[] = [
			{ type: "message", message: { role: "user", content: "go" } },
			todoResult([{ id: 5, subject: "Board task", status: "in_progress" }]),
		];
		const ctx = makeCtx(branch);
		await emit(handlers, "session_start", {}, ctx);
		// manual trigger at loop 0 — no turn_end ever fired, still audits
		const cmd = commands.get("jev-audit");
		expect(cmd).toBeDefined();
		await cmd!.handler("", ctx);
		expect(auditCalls.length).toBeGreaterThan(0);
		expect(sent.some((s) => s.message.customType === "jev-todo-audit")).toBe(true);
	});

	test("user-ready semantic hook triggers terminal-stop audit, bypassing cooldown", async () => {
		const { pi, handlers, sent, bus } = makePi();
		makeExtension(pi, { ...cfgMod.DEFAULT_CONFIG, apiKeyEnvVar: "JEV_AUDIT_TEST_KEY" });
		const branch: unknown[] = [
			{ type: "message", message: { role: "user", content: "do work" } },
			todoResult([{ id: 5, subject: "Board task", status: "in_progress" }]),
		];
		const ctx = makeCtx(branch);
		await emit(handlers, "session_start", {}, ctx);
		const before = auditCalls.length;
		const env = { version: 1, name: "user-ready", values: { STOP_KIND: "AI_UNLOCK", REASON_TYPE: "JOB_DONE", REASON: "work done" } };
		bus.emit("pi:semantic-hook:v1", env);
		await new Promise((r) => setTimeout(r, 0));
		expect(auditCalls.length).toBe(before + 1);
		bus.emit("pi:semantic-hook:v1", env);
		bus.emit("pi:semantic-hook:v1", { version: 1, name: "user-ready", values: { STOP_KIND: "AI_UNLOCK", REASON_TYPE: "JOB_DONE", REASON: "work done" } });
		await new Promise((r) => setTimeout(r, 0));
		expect(auditCalls.length).toBe(before + 1);
		expect(sent.length).toBeGreaterThan(0);
	});

	test("user-ready with all-done board → silent no-op", async () => {
		const { pi, handlers, bus } = makePi();
		makeExtension(pi, { ...cfgMod.DEFAULT_CONFIG, apiKeyEnvVar: "JEV_AUDIT_TEST_KEY" });
		const branch: unknown[] = [
			{ type: "message", message: { role: "user", content: "x" } },
			todoResult([{ id: 1, subject: "done", status: "completed" }]),
		];
		const ctx = makeCtx(branch);
		await emit(handlers, "session_start", {}, ctx);
		const before = auditCalls.length;
		bus.emit("pi:semantic-hook:v1", { version: 1, name: "user-ready", values: { STOP_KIND: "AI_UNLOCK" } });
		await new Promise((r) => setTimeout(r, 0));
		expect(auditCalls.length).toBe(before);
	});

	test("distinct terminal-stop epoch after first completes → second audit", async () => {
		const { pi, handlers, bus } = makePi();
		makeExtension(pi, { ...cfgMod.DEFAULT_CONFIG, apiKeyEnvVar: "JEV_AUDIT_TEST_KEY" });
		const branch: unknown[] = [
			{ type: "message", message: { role: "user", content: "x" } },
			todoResult([{ id: 5, subject: "t", status: "in_progress" }]),
		];
		const ctx = makeCtx(branch);
		await emit(handlers, "session_start", {}, ctx);
		const before = auditCalls.length;
		bus.emit("pi:semantic-hook:v1", { version: 1, name: "user-ready", values: { STOP_KIND: "AI_UNLOCK", REASON_TYPE: "JOB_DONE", REASON: "done" } });
		await new Promise((r) => setTimeout(r, 0));
		expect(auditCalls.length).toBe(before + 1);
		// A DIFFERENT epoch (different stop kind) → new audit allowed
		bus.emit("pi:semantic-hook:v1", { version: 1, name: "user-ready", values: { STOP_KIND: "EXHAUSTED" } });
		await new Promise((r) => setTimeout(r, 0));
		expect(auditCalls.length).toBe(before + 2);
	});

	test("distinct epoch during in-flight audit is queued, runs after", async () => {
		const { pi, handlers, bus } = makePi();
		makeExtension(pi, { ...cfgMod.DEFAULT_CONFIG, apiKeyEnvVar: "JEV_AUDIT_TEST_KEY" });
		const branch: unknown[] = [
			{ type: "message", message: { role: "user", content: "x" } },
			todoResult([{ id: 5, subject: "t", status: "in_progress" }]),
		];
		const ctx = makeCtx(branch);
		await emit(handlers, "session_start", {}, ctx);
		const before = auditCalls.length;
		// Fire two different epochs back-to-back: the second lands mid-flight
		// (audit #1 is in the mocked fetch → real async boundary).
		bus.emit("pi:semantic-hook:v1", { version: 1, name: "user-ready", values: { STOP_KIND: "AI_UNLOCK", REASON_TYPE: "A", REASON: "r1" } });
		bus.emit("pi:semantic-hook:v1", { version: 1, name: "user-ready", values: { STOP_KIND: "EXHAUSTED" } });
		await new Promise((r) => setTimeout(r, 0));
		await new Promise((r) => setTimeout(r, 0));
		expect(auditCalls.length).toBe(before + 2);
	});

	test("user-ready terminal-stop inject uses triggerTurn to wake the agent", async () => {
		const { pi, handlers, sent, bus } = makePi();
		makeExtension(pi, { ...cfgMod.DEFAULT_CONFIG, apiKeyEnvVar: "JEV_AUDIT_TEST_KEY" });
		const branch: unknown[] = [
			{ type: "message", message: { role: "user", content: "do work" } },
			todoResult([{ id: 5, subject: "Board task", status: "in_progress" }]),
		];
		const ctx = makeCtx(branch);
		await emit(handlers, "session_start", {}, ctx);
		bus.emit("pi:semantic-hook:v1", { version: 1, name: "user-ready", values: { STOP_KIND: "AI_UNLOCK", REASON_TYPE: "JOB_DONE", REASON: "done" } });
		await new Promise((r) => setTimeout(r, 0));
		expect(sent.length).toBeGreaterThan(0);
		// Stopped agent: steer alone would queue silently — must triggerTurn.
		expect(sent[sent.length - 1].options).toEqual({ deliverAs: "steer", triggerTurn: true });
	});

	test("malformed / foreign hook payloads are ignored safely", async () => {
		const { pi, handlers, bus } = makePi();
		makeExtension(pi, { ...cfgMod.DEFAULT_CONFIG, apiKeyEnvVar: "JEV_AUDIT_TEST_KEY" });
		const branch: unknown[] = [todoResult([{ id: 5, subject: "t", status: "in_progress" }])];
		const ctx = makeCtx(branch);
		await emit(handlers, "session_start", {}, ctx);
		const before = auditCalls.length;
		bus.emit("pi:semantic-hook:v1", null);
		bus.emit("pi:semantic-hook:v1", { version: 1, name: "watchdog-waiting", values: {} });
		bus.emit("pi:semantic-hook:v1", { version: 1, name: "user-ready", values: { STOP_KIND: "BOGUS" } });
		bus.emit("pi:semantic-hook:v1", "user-ready");
		await new Promise((r) => setTimeout(r, 0));
		expect(auditCalls.length).toBe(before);
	});

	test("long-lived in_progress task triggers split nudge in injected message", async () => {
		// task #5 enters in_progress at loop 0; 40 assistant msgs → age 40 > 30
		// (staleAuditSpans 3 × interval 10). alignment aligned → still injects
		// because the task is stale.
		const saved = { ...auditAnswers };
		auditAnswers.alignment = { choice: "aligned", confidence: 0.95 };
		(auditAnswers as any).lifecycle = undefined;
		auditAnswers.current_match = undefined as unknown as typeof auditAnswers.current_match;
		auditCalls.length = 0;
		try {
			const { pi, handlers, sent } = makePi();
			makeExtension(pi, { ...cfgMod.DEFAULT_CONFIG, apiKeyEnvVar: "JEV_AUDIT_TEST_KEY" });
			const branch: unknown[] = [
				{ type: "message", message: { role: "user", content: "work on task 5" } },
				todoResult([{ id: 5, subject: "Big coarse task", status: "in_progress" }]),
			];
			const ctx = makeCtx(branch);
			await emit(handlers, "session_start", {}, ctx);

			for (let i = 0; i < 40; i++) {
				branch.push({ type: "message", message: { role: "assistant", content: `working ${i}` } });
				await emit(handlers, "turn_end", { turnIndex: i }, ctx);
			}

			// Audits fired at loops 10, 20, 30, 40 → cooldown 10 skips loop 10
			// (user msg at 0); only loop-40 audit has task age > 30 → split inject.
			expect(auditCalls.length).toBe(3);
			expect(sent.length).toBe(1);
			expect(sent[0].message.customType).toBe("jev-todo-audit");
			expect(sent[0].message.content).toContain("split");
			expect(sent[0].message.content).toContain("#5");
		} finally {
			for (const k of Object.keys(auditAnswers) as (keyof typeof auditAnswers)[]) delete auditAnswers[k];
			Object.assign(auditAnswers, saved);
		}
	});
});
