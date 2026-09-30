import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG, agentConfigPath, loadConfig, projectConfigPath, resolveApiKey, resolveAuditKey } from "../config.js";
import { PI_PROVIDERS } from "../capacity.js";

describe("config", () => {
	test("missing file → defaults", () => {
		const cfg = loadConfig("/nonexistent/jev-todo-audit/config.json");
		expect(cfg).toEqual(DEFAULT_CONFIG);
	});

	test("malformed JSON → defaults", () => {
		const dir = mkdtempSync(join(tmpdir(), "jev-cfg-"));
		const p = join(dir, "config.json");
		writeFileSync(p, "{ not json");
		const cfg = loadConfig(p);
		expect(cfg).toEqual(DEFAULT_CONFIG);
		rmSync(dir, { recursive: true });
	});

	test("partial config merges over defaults", () => {
		const dir = mkdtempSync(join(tmpdir(), "jev-cfg-"));
		const p = join(dir, "config.json");
		writeFileSync(p, JSON.stringify({ interval: 20, enabled: false }));
		const cfg = loadConfig(p);
		expect(cfg.interval).toBe(20);
		expect(cfg.enabled).toBe(false);
		expect(cfg.cooldownLoops).toBe(10);
		rmSync(dir, { recursive: true });
	});

	test("bad values fall back per-field", () => {
		const dir = mkdtempSync(join(tmpdir(), "jev-cfg-"));
		const p = join(dir, "config.json");
		writeFileSync(p, JSON.stringify({ interval: -3, model: 42, confidenceThreshold: 0.9 }));
		const cfg = loadConfig(p);
		expect(cfg.interval).toBe(10);
		expect(cfg.model).toBe("jev-latest");
		expect(cfg.confidenceThreshold).toBe(0.9);
		rmSync(dir, { recursive: true });
	});

	test("resolveApiKey: env var wins over config, config is fallback", () => {
		const cfg = { ...DEFAULT_CONFIG, apiKeyEnvVar: "JEV_TEST_KEY", apiKey: "sk-file" };
		expect(resolveApiKey(cfg)).toBe("sk-file");
		process.env.JEV_TEST_KEY = "sk-env";
		expect(resolveApiKey(cfg)).toBe("sk-env");
		delete process.env.JEV_TEST_KEY;
	});

	test("blank apiKey in file counts as absent", () => {
		const dir = mkdtempSync(join(tmpdir(), "jev-cfg-"));
		const p = join(dir, "config.json");
		writeFileSync(p, JSON.stringify({ apiKey: "   " }));
		const cfg = loadConfig(p);
		expect(cfg.apiKey).toBeUndefined();
		expect(resolveApiKey({ ...cfg, apiKeyEnvVar: "JEV_MISSING_XYZ" })).toBeUndefined();
		rmSync(dir, { recursive: true });
	});

	test("blank env var counts as absent, falls back to file key", () => {
		process.env.JEV_TEST_BLANK = "  \n\t ";
		const cfg = { ...DEFAULT_CONFIG, apiKeyEnvVar: "JEV_TEST_BLANK", apiKey: "sk-file" };
		expect(resolveApiKey(cfg)).toBe("sk-file");
		delete process.env.JEV_TEST_BLANK;
	});

	test("project layer ignored when untrusted", () => {
		const dir = mkdtempSync(join(tmpdir(), "jev-cfg-"));
		const proj = join(dir, "project.json");
		writeFileSync(proj, JSON.stringify({ interval: 3 }));
		const cfg = loadConfig({ globalPath: join(dir, "nope.json"), projectPath: proj, projectTrusted: false });
		expect(cfg.interval).toBe(DEFAULT_CONFIG.interval);
		rmSync(dir, { recursive: true });
	});

	test("project layer merges when trusted", () => {
		const dir = mkdtempSync(join(tmpdir(), "jev-cfg-"));
		const proj = join(dir, "project.json");
		writeFileSync(proj, JSON.stringify({ interval: 3, notifyOnAligned: true }));
		const cfg = loadConfig({ globalPath: join(dir, "nope.json"), projectPath: proj, projectTrusted: true });
		expect(cfg.interval).toBe(3);
		expect(cfg.notifyOnAligned).toBe(true);
		rmSync(dir, { recursive: true });
	});

	test("project layer cannot set apiKey/apiKeyEnvVar", () => {
		const dir = mkdtempSync(join(tmpdir(), "jev-cfg-"));
		const proj = join(dir, "project.json");
		writeFileSync(proj, JSON.stringify({ apiKey: "sk-proj", apiKeyEnvVar: "PROJ_KEY", interval: 7 }));
		const cfg = loadConfig({ globalPath: join(dir, "nope.json"), projectPath: proj, projectTrusted: true });
		expect(cfg.interval).toBe(7); // allowed key still merges
		expect(cfg.apiKey).toBeUndefined(); // dropped
		expect(cfg.apiKeyEnvVar).toBe(DEFAULT_CONFIG.apiKeyEnvVar); // dropped
		rmSync(dir, { recursive: true });
	});

	test("agent path honors PI_CODING_AGENT_DIR", () => {
		process.env.PI_CODING_AGENT_DIR = "/tmp/jev-agent-test";
		expect(agentConfigPath()).toBe("/tmp/jev-agent-test/jev-todo-audit.json");
		delete process.env.PI_CODING_AGENT_DIR;
		expect(agentConfigPath()).toContain(".pi/agent/jev-todo-audit.json");
	});

	test("projectConfigPath sits under .pi", () => {
		expect(projectConfigPath("/repo")).toBe("/repo/.pi/jev-todo-audit.json");
	});

	test("staleAuditSpans default + project override", () => {
		expect(DEFAULT_CONFIG.staleAuditSpans).toBe(3);
		const dir = mkdtempSync(join(tmpdir(), "jev-cfg-"));
		const proj = join(dir, "project.json");
		writeFileSync(proj, JSON.stringify({ staleAuditSpans: 5 }));
		const cfg = loadConfig({ globalPath: join(dir, "nope.json"), projectPath: proj, projectTrusted: true });
		expect(cfg.staleAuditSpans).toBe(5);
		rmSync(dir, { recursive: true });
	});
});

describe("resolveAuditKey", () => {
	const TS = "https://api.typesafe.ai/v1/systemone", OR = "https://openrouter.ai/api/v1/systemone";
	const base = { ...DEFAULT_CONFIG, apiKeyEnvVar: "JEV_MISSING_XYZ", apiKey: "sk-file" };
	const registry = (keys: Record<string, string | undefined>, providers = Object.keys(keys)) => {
		const calls: string[] = [];
		return { calls, getProvider: (p: string) => providers.includes(p) ? {} : undefined,
			getApiKeyForProvider: async (p: string) => { calls.push(p); return keys[p]; } };
	};

	test("PI_PROVIDERS maps both known endpoints only", () => {
		expect(PI_PROVIDERS[TS]).toBe("typesafe");
		expect(PI_PROVIDERS[OR]).toBe("openrouter");
		expect(PI_PROVIDERS["https://proxy.example/v1/systemone"]).toBeUndefined();
	});
	test("Pi key wins over config for TypeSafe and OpenRouter", async () => {
		expect(await resolveAuditKey({ ...base, apiUrl: TS }, registry({ typesafe: "sk-pi" }))).toEqual({ key: "sk-pi", source: "pi", provider: "typesafe" });
		expect(await resolveAuditKey({ ...base, apiUrl: OR }, registry({ openrouter: "sk-or" }))).toEqual({ key: "sk-or", source: "pi", provider: "openrouter" });
	});
	test("blank Pi key → fallback flagged for migration", async () => {
		expect(await resolveAuditKey({ ...base, apiUrl: TS }, registry({ typesafe: "  " }))).toEqual({ key: "sk-file", source: "fallback", provider: "typesafe" });
	});
	test("provider not registered → fallback without migration flag", async () => {
		const r = registry({}, []);
		expect(await resolveAuditKey({ ...base, apiUrl: TS }, r)).toEqual({ key: "sk-file", source: "fallback", provider: undefined });
		expect(r.calls).toEqual([]);
	});
	test("custom endpoint never consults Pi", async () => {
		const r = registry({ typesafe: "sk-pi", openrouter: "sk-or" });
		expect(await resolveAuditKey({ ...base, apiUrl: "https://proxy.example/v1/systemone" }, r)).toEqual({ key: "sk-file", source: "fallback", provider: undefined });
		expect(r.calls).toEqual([]);
	});
	test("registry throws or is absent → fallback", async () => {
		const bad = { getProvider: () => ({}), getApiKeyForProvider: async () => { throw new Error("boom"); } };
		expect((await resolveAuditKey({ ...base, apiUrl: TS }, bad)).key).toBe("sk-file");
		expect(await resolveAuditKey({ ...base, apiUrl: TS })).toEqual({ key: "sk-file", source: "fallback", provider: undefined });
	});
	test("nothing anywhere → none", async () => {
		expect(await resolveAuditKey({ ...base, apiKey: undefined, apiUrl: TS }, registry({ typesafe: undefined }))).toEqual({ source: "none", provider: "typesafe" });
	});
});
