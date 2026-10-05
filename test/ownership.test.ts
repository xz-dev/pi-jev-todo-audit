/** Main-only process ownership is independent of any subagent framework. */
import { afterEach, beforeEach, expect, test } from "bun:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import makeExtension from "../index.js";
import { DEFAULT_CONFIG } from "../config.js";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const OWNER = "PI_JEV_TODO_AUDIT_OWNER_PID";

test("native Node independent parents and inherited descendants preserve ownership without a shell", () => {
	// Remove all spellings so Windows cannot select a duplicate case-insensitive key.
	const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => k.toUpperCase() !== OWNER));
	const run = () => {
		const result = spawnSync("node", [fileURLToPath(new URL("./fixtures/node ownership.mjs", import.meta.url))], {
			env, encoding: "utf8", shell: false, timeout: 15000,
		});
		expect(result.status).toBe(0);
		if (result.status !== 0) throw new Error(result.stderr || result.error?.message);
		const root = JSON.parse(result.stdout);
		expect(root.runtime).toBe("node"); expect(root.allowed).toBe(true); expect(root.reload).toBe(true);
		expect(root.owner).toBe(String(root.pid));
		for (const child of [root.child, root.child.child]) {
			expect(child.allowed).toBe(false); expect(child.reload).toBe(false); expect(child.owner).toBe(root.owner);
			expect(child.pid).not.toBe(root.pid);
		}
		return root;
	};
	const first = run(), second = run();
	expect(first.pid).not.toBe(second.pid);
	expect(first.owner).not.toBe(second.owner);
});

let saved: string | undefined;
const originalFetch = globalThis.fetch;
const serviceKey = Symbol.for("pi-llm-as-jev:service");
const services = globalThis as Record<symbol, unknown>;
const originalService = services[serviceKey];
beforeEach(() => { saved = process.env[OWNER]; delete process.env[OWNER]; });
afterEach(() => {
	if (saved === undefined) delete process.env[OWNER]; else process.env[OWNER] = saved;
	globalThis.fetch = originalFetch;
	if (originalService === undefined) delete services[serviceKey]; else services[serviceKey] = originalService;
});

function host() {
	const handlers = new Map<string, any[]>(), commands = new Map<string, any>(), bus = new Map<string, any[]>();
	let keys = 0, requests = 0, reviews = 0, injected = 0, written = 0, configReads = 0;
	services[serviceKey] = { version: 1, reviewVersion: 1, review: async () => {
		reviews++;
		// Ownership tests stop at the service port; no transport or inference is simulated.
		return { answers: {}, dropped: [], backend: "llm", model: "fixture/offline", stopReason: "error", errorMessage: "scripted no-provider result",
			reuse: { hits: 0, joined: 0, sent: 0 }, progress: { stages: [] }, unresolved: [],
			diagnostics: { attempts: [], attemptCount: 0, observationCoverage: "complete", usage: { inputTokens: { knownSum: 0, missing: 0 }, outputTokens: { knownSum: 0, missing: 0 }, costUsd: { knownSum: 0, missing: 0 } } } };
	} };
	const branch: any[] = [
		{ id: "u", type: "message", message: { role: "user", content: "Analyse only; do not deploy." } },
		{ id: "b", type: "message", message: { role: "toolResult", toolName: "todo", content: "ok", details: {
			tasks: [{ id: 1, subject: "Analysis", status: "in_progress" }], nextId: 2 } } },
	];
	const add = (map: Map<string, any[]>, name: string, handler: any) => map.set(name, [...(map.get(name) ?? []), handler]);
	const pi = { on: (n: string, h: any) => add(handlers, n, h), events: { on: (n: string, h: any) => add(bus, n, h) },
		registerCommand: (n: string, c: any) => commands.set(n, c), sendMessage: () => injected++,
		appendEntry: (customType: string, data: unknown) => { written++; branch.push({ id: `ledger-${written}`, type: "custom", customType, data }); },
	} as unknown as ExtensionAPI;
	const cfg = { ...DEFAULT_CONFIG, get enabled() { configReads++; return true; } };
	const ctx = { hasUI: false, sessionManager: { getSessionId: () => "main-fork", getBranch: () => branch, buildContextEntries: () => branch },
		modelRegistry: { getProvider: () => true, getApiKeyForProvider: async () => { keys++; return "offline"; } } };
	globalThis.fetch = (async (_u: unknown, init: any) => {
		requests++;
		const req = JSON.parse(init.body);
		return new Response(JSON.stringify({ answers: Object.fromEntries(Object.entries(req.questions).map(([k, raw]) => {
			const q = raw as { criteria: Record<string, string> };
			return [k, { choice: "unclear" in q.criteria ? "unclear" : Object.keys(q.criteria)[0], confidence: 0.9 }];
		})) }));
	}) as typeof fetch;
	const emit = async (name: string, event: unknown = {}) => { for (const h of handlers.get(name) ?? []) await h(event, ctx); };
	return { pi, cfg, ctx, commands, handlers, bus, emit,
		counts: () => ({ keys, requests, reviews, injected, written, configReads }) };
}

for (const marker of [undefined, "", String(process.pid)]) test(`main claims/reuses ownership with marker ${String(marker)}`, async () => {
	if (marker !== undefined) process.env[OWNER] = marker;
	const h = host(); makeExtension(h.pi, h.cfg);
	expect(process.env[OWNER]).toBe(String(process.pid));
	await h.emit("session_start");
	await h.commands.get("jev-audit").handler("", h.ctx);
	expect(h.counts().reviews).toBe(1);
	expect(h.counts().requests).toBe(0); expect(h.counts().keys).toBe(0);
	await h.emit("session_shutdown");
	expect(process.env[OWNER]).toBe(String(process.pid));
	const reload = host(); makeExtension(reload.pi, reload.cfg);
	expect(reload.commands.has("jev-audit")).toBe(true);
	await reload.emit("session_start");
	await reload.commands.get("jev-audit").handler("full", reload.ctx);
	expect(reload.counts().reviews).toBe(1);
	expect(reload.counts().requests).toBe(0); expect(reload.counts().keys).toBe(0);
});

for (const marker of [String(process.pid + 1), "not-a-pid", "0", ` ${process.pid}`, `${process.pid}.0`]) {
	test(`inherited or invalid owner ${marker} suppresses every JEV path before config`, async () => {
		process.env[OWNER] = marker;
		const h = host(); makeExtension(h.pi, h.cfg);
		await h.emit("session_start");
		for (let i = 0; i < 20; i++) await h.emit("turn_end");
		for (const handler of h.bus.get("pi:semantic-hook:v1") ?? []) handler({ version: 1, name: "user-ready", values: { STOP_KIND: "AI_UNLOCK" } });
		for (const mode of ["", "full"]) await h.commands.get("jev-audit")?.handler(mode, h.ctx);
		expect(h.counts()).toEqual({ keys: 0, requests: 0, reviews: 0, injected: 0, written: 0, configReads: 0 });
		expect(h.handlers.size).toBe(0); expect(h.commands.size).toBe(0); expect(h.bus.size).toBe(0);
		expect(process.env[OWNER]).toBe(marker);
	});
}
