/**
 * Configuration for jev-todo-audit.
 *
 * Read from `$XDG_CONFIG_HOME/jev-todo-audit/config.json` or
 * `~/.config/jev-todo-audit/config.json`. Missing or malformed file →
 * all defaults. Key resolution: env var (named by `apiKeyEnvVar`) first,
 * then literal `apiKey` in the file. A value that is empty or all
 * whitespace counts as absent.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface AuditConfig {
	/** Trigger an audit every Nth completed loop. */
	interval: number;
	/** Skip an audit when this many or fewer loops have run since the last user message. */
	cooldownLoops: number;
	/** Minimum jev confidence required to inject a corrective message. */
	confidenceThreshold: number;
	/** TypeSafe model id. */
	model: string;
	/** Name of the env var checked first for the API key. */
	apiKeyEnvVar: string;
	/** API key written straight into the config file (pi-style). Env var wins when both set. */
	apiKey?: string;
	/** Master switch. */
	enabled: boolean;
	/** Notify the user on aligned audits too. */
	notifyOnAligned: boolean;
	/** TypeSafe endpoint. */
	apiUrl: string;
	/** Request timeout in ms. */
	timeoutMs: number;
	/** Max chars of recent activity fed to jev as state. */
	activityBudgetChars: number;
}

export const DEFAULT_CONFIG: AuditConfig = {
	interval: 10,
	cooldownLoops: 5,
	confidenceThreshold: 0.5,
	model: "jev-latest",
	apiKeyEnvVar: "TYPESAFE_API_KEY",
	enabled: true,
	notifyOnAligned: false,
	apiUrl: "https://api.typesafe.ai/v1/systemone",
	timeoutMs: 30_000,
	activityBudgetChars: 4_000,
};

function configPath(): string {
	const xdg = process.env.XDG_CONFIG_HOME;
	const base = xdg && xdg.startsWith("/") ? xdg : join(homedir(), ".config");
	return join(base, "jev-todo-audit", "config.json");
}

function num(v: unknown, fallback: number, min: number): number {
	return typeof v === "number" && Number.isFinite(v) && v >= min ? v : fallback;
}

/** Non-blank string or undefined. */
function str(v: unknown): string | undefined {
	return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

export function loadConfig(path = configPath()): AuditConfig {
	let raw: unknown = {};
	if (existsSync(path)) {
		try {
			raw = JSON.parse(readFileSync(path, "utf8"));
		} catch {
			console.warn(`jev-todo-audit: invalid JSON at ${path}, using defaults`);
			raw = {};
		}
	}
	const o = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
	return {
		interval: num(o.interval, DEFAULT_CONFIG.interval, 1),
		cooldownLoops: num(o.cooldownLoops, DEFAULT_CONFIG.cooldownLoops, 0),
		confidenceThreshold: num(o.confidenceThreshold, DEFAULT_CONFIG.confidenceThreshold, 0),
		model: str(o.model) ?? DEFAULT_CONFIG.model,
		apiKeyEnvVar: str(o.apiKeyEnvVar) ?? DEFAULT_CONFIG.apiKeyEnvVar,
		apiKey: str(o.apiKey),
		enabled: typeof o.enabled === "boolean" ? o.enabled : DEFAULT_CONFIG.enabled,
		notifyOnAligned: typeof o.notifyOnAligned === "boolean" ? o.notifyOnAligned : DEFAULT_CONFIG.notifyOnAligned,
		apiUrl: str(o.apiUrl) ?? DEFAULT_CONFIG.apiUrl,
		timeoutMs: num(o.timeoutMs, DEFAULT_CONFIG.timeoutMs, 1_000),
		activityBudgetChars: num(o.activityBudgetChars, DEFAULT_CONFIG.activityBudgetChars, 500),
	};
}

/** Resolve the key: env var first, config `apiKey` fallback. Blank = absent. */
export function resolveApiKey(cfg: AuditConfig): string | undefined {
	const env = process.env[cfg.apiKeyEnvVar];
	if (env && env.trim()) return env.trim();
	return cfg.apiKey;
}
