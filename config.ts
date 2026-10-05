/**
 * Configuration for jev-todo-audit.
 *
 * Layered load order (later wins):
 *   1. defaults
 *   2. `<agentDir>/jev-todo-audit.json`   — global, agentDir = PI_CODING_AGENT_DIR or ~/.pi/agent
 *   3. `<cwd>/.pi/jev-todo-audit.json`    — project, only when ctx.isProjectTrusted()
 *
 * Legacy transport/auth fields load only for migration notices and redaction.
 * They never select credentials or dispatch. Pi and the shared service own auth.
 *
 * Missing or malformed files → all defaults, never throws.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_DIR_NAME, getAgentDir } from "@earendil-works/pi-coding-agent";
import type { ContextLimits } from "./capacity.js";

export interface AuditConfig {
	/** Explicit legacy keys, for field-name-only migration notices (not dispatch). */
	legacyFields?: string[];
	/** Keys already read from allowed config layers, retained solely for redaction. */
	legacySecrets?: string[];
	/** Trigger an audit every Nth completed loop. */
	interval: number;
	/** Skip an audit when this many or fewer loops have run since the last user message. */
	cooldownLoops: number;
	/** Minimum jev confidence required to inject a corrective message. */
	confidenceThreshold: number;
	/** Deprecated selection fields; loaded but ignored for dispatch. */
	model: string;
	/** Deprecated credential location; used for redaction only. */
	apiKeyEnvVar: string;
	/** Deprecated credential value; used for redaction only. */
	apiKey?: string;
	/** Master switch. */
	enabled: boolean;
	/** Notify the user on aligned audits too. */
	notifyOnAligned: boolean;
	/** Deprecated endpoint; loaded but never used for dispatch. */
	apiUrl: string;
	/** Request timeout in ms. */
	timeoutMs: number;
	/** Deprecated: parsed for compatibility, never used as an evidence budget. */
	activityBudgetChars?: number;
	/** Audits an in_progress task may span before being flagged stale. */
	staleAuditSpans: number;
	/** Deprecated limits; service-owned configuration replaces them. */
	contextLimits?: ContextLimits;
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
	activityBudgetChars: undefined,
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
	"contextLimits",
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

function limits(v: unknown): ContextLimits | undefined {
	if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
	const o = v as Record<string, unknown>, pos = (x: unknown) => typeof x === "number" && Number.isFinite(x) && x > 0 ? x : undefined;
	const out: ContextLimits = { request: pos(o.request), stateAndLongestQuestion: pos(o.stateAndLongestQuestion) };
	return out.request || out.stateAndLongestQuestion ? out : undefined;
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

function applyLayer(cfg: AuditConfig, o: Record<string, unknown>, readLayer = o): AuditConfig {
	const legacyFields = [...new Set([...(cfg.legacyFields ?? []), ...["model", "apiUrl", "apiKey", "apiKeyEnvVar", "contextLimits"].filter((key) => Object.hasOwn(readLayer, key))])];
	const key = str(readLayer.apiKey);
	const legacySecrets = [...new Set([...(cfg.legacySecrets ?? []), ...(key ? [key] : [])])];
	return {
		...(legacyFields.length ? { legacyFields } : {}),
		...(legacySecrets.length ? { legacySecrets } : {}),
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
		activityBudgetChars: typeof o.activityBudgetChars === "number" ? o.activityBudgetChars : cfg.activityBudgetChars,
		staleAuditSpans: num(o.staleAuditSpans, cfg.staleAuditSpans, 1),
		contextLimits: limits(o.contextLimits) ?? cfg.contextLimits,
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
		const readLayer = readJsonFile(opts.projectPath);
		cfg = applyLayer(cfg, projectFilter(readLayer), readLayer);
	}
	return cfg;
}
