/**
 * Configuration for jev-todo-audit.
 *
 * Layered load order (later wins):
 *   1. defaults
 *   2. `<agentDir>/jev-todo-audit.json`   — global, agentDir = PI_CODING_AGENT_DIR or ~/.pi/agent
 *   3. `<cwd>/.pi/jev-todo-audit.json`    — project, only when ctx.isProjectTrusted()
 *
 * `apiKey` / `apiKeyEnvVar` are global-layer only — project files can never
 * inject secrets into a repo. API key resolution: env var (named by
 * `apiKeyEnvVar`) wins over file `apiKey`. Empty/whitespace = absent.
 *
 * Missing or malformed files → all defaults, never throws.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_DIR_NAME, getAgentDir } from "@earendil-works/pi-coding-agent";

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
	/** Audits an in_progress task may span before being flagged stale. */
	staleAuditSpans: number;
}

export const DEFAULT_CONFIG: AuditConfig = {
	interval: 10,
	cooldownLoops: 10,
	confidenceThreshold: 0.5,
	model: "jev-latest",
	apiKeyEnvVar: "TYPESAFE_API_KEY",
	enabled: true,
	notifyOnAligned: false,
	apiUrl: "https://api.typesafe.ai/v1/systemone",
	timeoutMs: 30_000,
	activityBudgetChars: 4_000,
	staleAuditSpans: 3,
};

/** Keys a project-level file may set. apiKey/apiKeyEnvVar stay global-only. */
const PROJECT_ALLOWED_KEYS: ReadonlySet<keyof AuditConfig> = new Set([
	"interval",
	"cooldownLoops",
	"confidenceThreshold",
	"model",
	"enabled",
	"notifyOnAligned",
	"apiUrl",
	"timeoutMs",
	"activityBudgetChars",
	"staleAuditSpans",
]);

/** Global config path — ~/.pi/agent/jev-todo-audit.json (or PI_CODING_AGENT_DIR). */
export function agentConfigPath(): string {
	return join(getAgentDir(), "jev-todo-audit.json");
}

/** Project config path — <cwd>/.pi/jev-todo-audit.json. */
export function projectConfigPath(cwd: string): string {
	return join(cwd, CONFIG_DIR_NAME, "jev-todo-audit.json");
}

/** Legacy XDG path, kept only to warn about the move. */
export function legacyConfigPath(): string {
	const xdg = process.env.XDG_CONFIG_HOME;
	const base = xdg && xdg.startsWith("/") ? xdg : join(process.env.HOME ?? "", ".config");
	return join(base, "jev-todo-audit", "config.json");
}

function num(v: unknown, fallback: number, min: number): number {
	return typeof v === "number" && Number.isFinite(v) && v >= min ? v : fallback;
}

/** Non-blank string or undefined. */
function str(v: unknown): string | undefined {
	return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function readJsonFile(path: string): Record<string, unknown> {
	if (!existsSync(path)) return {};
	try {
		const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
		return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
	} catch {
		console.warn(`jev-todo-audit: invalid JSON at ${path}, skipping`);
		return {};
	}
}

/** Strip keys the project layer is not allowed to set. */
function projectFilter(raw: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(raw)) {
		if (PROJECT_ALLOWED_KEYS.has(k as keyof AuditConfig)) out[k] = v;
	}
	return out;
}

function applyLayer(cfg: AuditConfig, o: Record<string, unknown>): AuditConfig {
	return {
		interval: num(o.interval, cfg.interval, 1),
		cooldownLoops: num(o.cooldownLoops, cfg.cooldownLoops, 0),
		confidenceThreshold: num(o.confidenceThreshold, cfg.confidenceThreshold, 0),
		model: str(o.model) ?? cfg.model,
		apiKeyEnvVar: str(o.apiKeyEnvVar) ?? cfg.apiKeyEnvVar,
		apiKey: str(o.apiKey) ?? cfg.apiKey,
		enabled: typeof o.enabled === "boolean" ? o.enabled : cfg.enabled,
		notifyOnAligned: typeof o.notifyOnAligned === "boolean" ? o.notifyOnAligned : cfg.notifyOnAligned,
		apiUrl: str(o.apiUrl) ?? cfg.apiUrl,
		timeoutMs: num(o.timeoutMs, cfg.timeoutMs, 1_000),
		activityBudgetChars: num(o.activityBudgetChars, cfg.activityBudgetChars, 500),
		staleAuditSpans: num(o.staleAuditSpans, cfg.staleAuditSpans, 1),
	};
}

export interface LoadConfigInput {
	/** Global layer path; defaults to agentConfigPath(). */
	globalPath?: string;
	/** Project layer path; only read when projectTrusted is true. */
	projectPath?: string;
	/** ctx.isProjectTrusted(). When false, projectPath is ignored. */
	projectTrusted?: boolean;
}

export function loadConfig(input: LoadConfigInput | string = {}): AuditConfig {
	// Legacy positional form kept for tests: loadConfig(path) → global-only.
	const opts: LoadConfigInput = typeof input === "string" ? { globalPath: input } : input;
	let cfg = applyLayer(DEFAULT_CONFIG, readJsonFile(opts.globalPath ?? agentConfigPath()));
	if (opts.projectPath && opts.projectTrusted) {
		cfg = applyLayer(cfg, projectFilter(readJsonFile(opts.projectPath)));
	}
	return cfg;
}

/** Resolve the key: env var first, config `apiKey` fallback. Blank = absent. */
export function resolveApiKey(cfg: AuditConfig): string | undefined {
	const env = process.env[cfg.apiKeyEnvVar];
	if (env && env.trim()) return env.trim();
	return cfg.apiKey;
}
