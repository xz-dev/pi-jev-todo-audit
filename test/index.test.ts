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
	stale_status: { choice: "actually_completed", confidence: 0.9 },
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
	const sent: { message: any; options: any }[] = [];
	const pi = {
		on: (event: string, h: Handler) => { handlers.set(event, [...(handlers.get(event) ?? []), h]); },
		registerCommand: (name: string, opts: any) => { commands.set(name, opts); },
		sendMessage: (message: any, options: any) => { sent.push({ message, options }); },
	} as unknown as ExtensionAPI;
	return { pi, handlers, commands, sent };
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
	test("loop 10 fires audit + injects steer correction; cooldown skips", async () => {
		const { pi, handlers, sent } = makePi();
		makeExtension(pi, { ...cfgMod.DEFAULT_CONFIG, apiKeyEnvVar: "JEV_AUDIT_TEST_KEY" });

		const branch: unknown[] = [
			{ type: "message", message: { role: "user", content: "build stuff" } },
			todoResult([{ id: 5, subject: "Board task", status: "in_progress" }]),
		];
		const ctx = makeCtx(branch);

		await emit(handlers, "session_start", {}, ctx);

		// loops 1..9: no audit
		for (let i = 0; i < 9; i++) {
			branch.push({ type: "message", message: { role: "assistant", content: `work ${i}` } });
			await emit(handlers, "turn_end", { turnIndex: i }, ctx);
		}
		expect(auditCalls.length).toBe(0);

		// loop 10: audit fires, misaligned → inject
		branch.push({ type: "message", message: { role: "assistant", content: "writing parser" } });
		await emit(handlers, "turn_end", { turnIndex: 9 }, ctx);
		expect(auditCalls.length).toBe(1);
		expect(sent.length).toBe(1);
		expect(sent[0].options).toEqual({ deliverAs: "steer" });
		expect(sent[0].message.customType).toBe("jev-todo-audit");
		expect(sent[0].message.content).toContain("#5");
		expect(sent[0].message.content).toContain("create todo task");

		// user steers at loop 10 → cooldown resets; loops 11..15 inside window
		branch.push({ type: "message", message: { role: "user", content: "wait, do X first" } });
		await emit(handlers, "message_end", { message: { role: "user" } }, ctx);
		for (let i = 0; i < 5; i++) {
			branch.push({ type: "message", message: { role: "assistant", content: "x" } });
			await emit(handlers, "turn_end", { turnIndex: 10 + i }, ctx);
		}
		// loop 15 == 5 loops after user msg → cooldown (<=5), skip. loop 20 next trigger.
		expect(auditCalls.length).toBe(1);
		for (let i = 0; i < 5; i++) {
			branch.push({ type: "message", message: { role: "assistant", content: "y" } });
			await emit(handlers, "turn_end", { turnIndex: 15 + i }, ctx);
		}
		// loop 20 → audit #2
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
});
