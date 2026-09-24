import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG, agentConfigPath, loadConfig, projectConfigPath, resolveApiKey } from "../config.js";

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
		expect(cfg.cooldownLoops).toBe(5);
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
