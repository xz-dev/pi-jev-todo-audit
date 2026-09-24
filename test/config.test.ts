import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG, loadConfig, resolveApiKey } from "../config.js";

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
});
