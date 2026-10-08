/** First-load provisioning of the independently updated judgment-service package. */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getJudgmentService } from "./judgment-client.js";
import { claimAuditProcess } from "./ownership.js";

const SERVICE_SOURCE = "git:github.com/xz-dev/pi-llm-as-jev";
const SERVICE_COMMANDS = new Set(["llm-as-jev", "llm-as-jev-classifier"]);
const PROVISIONING_ENTRY = fileURLToPath(import.meta.url);
type Handler = (event: never, ctx: never) => unknown;
interface PiOn {
	(event: string, handler: Handler, options?: { uninterruptible?: boolean }): () => void;
}

function canonicalPath(path: string): string {
	try { return realpathSync(path); } catch { return resolve(path); }
}

/** Recognize the documented repository spellings without changing user refs. */
function isServiceSource(source: string): boolean {
	if (/^npm:pi-llm-as-jev(?:@|$)/.test(source)) return true;
	let url = source.replace(/^git:/, "");
	url = url.replace(/^git@([^:]+):/, "ssh://git@$1/");
	if (!url.includes("://")) url = `https://${url}`;
	try {
		const parsed = new URL(url);
		return parsed.hostname.toLowerCase() === "github.com" &&
			parsed.pathname.replace(/@.*$/, "").replace(/\.git\/?$/, "").replace(/\/$/, "").toLowerCase() === "/xz-dev/pi-llm-as-jev";
	} catch { return false; }
}

/** Native local sources can name either the package directory or src/index.ts. */
function isServiceInstallation(path: string | undefined): boolean {
	if (!path) return false;
	try {
		const real = canonicalPath(path);
		const dir = statSync(real).isDirectory() ? real : dirname(real);
		for (const candidate of [dir, dirname(dir)]) {
			try {
				if (JSON.parse(readFileSync(join(candidate, "package.json"), "utf8")).name === "pi-llm-as-jev") return true;
			} catch { /* A configured source need not have a package manifest. */ }
		}
	} catch { /* Missing canonical sources are recognized by their source string. */ }
	return false;
}

export default function (pi: ExtensionAPI): void {
	// Suppressed children do not import the service or access package settings.
	if (!claimAuditProcess()) return;
	pi.registerCommand("jev-audit-service", {
		description: "Show judgment-service availability (read-only; no installation or inference).",
		handler: async (_args, ctx) => {
			const service = getJudgmentService();
			const ready = service?.version === 1 && typeof service.judge === "function";
			ctx.ui.notify(ready
				? "Judgment service is available (judge version 1)."
				: "Judgment service is unavailable or incompatible; judge version 1 is required. Check startup diagnostics and package resource settings.", ready ? "info" : "warning");
		},
	});
	let started = false;
	let retired = false;
	const shutdowns: Handler[] = [];
	const subscriptions: Array<() => void> = [];

	const cleanup = async (event: never, ctx: never) => {
		// Service-owned shutdown retains its identity check: never delete another
		// generation's handle ourselves. One live list also covers late handlers.
		for (const handler of shutdowns.splice(0)) {
			try { await handler(event, ctx); } catch { /* Continue retiring this activation. */ }
		}
		retired = true;
		for (const unsubscribe of subscriptions.splice(0)) unsubscribe();
	};

	pi.on("session_shutdown", (event, ctx) => cleanup(event as never, ctx as never));
	pi.on("session_start", async (event, ctx) => {
		if (started || retired) return;
		started = true;
		const commands = pi.getCommands();
		if (getJudgmentService() !== undefined || commands.some((command) =>
			command.source === "extension" && SERVICE_COMMANDS.has(command.name.split(":")[0]))) return;

		const warn = (message: string) => ctx.ui.notify(`[jev-audit] ${message}`, "warning");
		if (/^(1|true|yes)$/i.test(process.env.PI_OFFLINE ?? "")) {
			warn("Judgment service unavailable in offline mode; no package was installed or registered.");
			return;
		}
		// This entry owns its provenance even when the audit entry is disabled or filtered.
		const audit = commands.find((command) => command.source === "extension" &&
			command.name.split(":")[0] === "jev-audit-service" &&
			command.sourceInfo?.origin === "package" &&
			canonicalPath(command.sourceInfo.path) === canonicalPath(PROVISIONING_ENTRY));
		const scope = audit?.sourceInfo.scope;
		if ((scope !== "user" && scope !== "project") || typeof ctx.isProjectTrusted !== "function") {
			warn("Cannot determine a persistent audit installation scope; automatic service registration skipped.");
			return;
		}
		const trusted = ctx.isProjectTrusted();
		if (scope === "project" && !trusted) return;

		let stage = "registration";
		try {
			const { DefaultPackageManager, SettingsManager, getAgentDir } = await import("@earendil-works/pi-coding-agent");
			const settings = SettingsManager.create(ctx.cwd, getAgentDir(), { projectTrusted: trusted });
			const manager = new DefaultPackageManager({ cwd: ctx.cwd, agentDir: getAgentDir(), settingsManager: settings });
			const assertSettings = () => {
				if (settings.drainErrors().length) throw new Error("Package settings could not be read or persisted");
			};
			const selected = () => manager.listConfiguredPackages().some((pkg) =>
				isServiceSource(pkg.source) || isServiceInstallation(pkg.installedPath));
			assertSettings();
			if (selected()) return; // Includes disabled, pinned, incompatible and broken selections.

			const local = scope === "project";
			stage = "installation";
			ctx.ui.notify("[jev-audit] Installing the independent judgment-service package…", "info");
			// These are the public operations used by installAndPersist. Keeping the
			// registration boundary separate permits a fresh selection check after
			// a slow download, and distinguishes clone success from persistence.
			await manager.install(SERVICE_SOURCE, { local });
			stage = "registration";
			await settings.reload();
			assertSettings();
			if (selected()) {
				warn("A judgment service was selected during installation; preserving that selection. Reload to use it.");
				return;
			}
			manager.addSourceToSettings(SERVICE_SOURCE, { local });
			await settings.flush();
			assertSettings();

			stage = "activation";
			const installedPath = manager.getInstalledPath(SERVICE_SOURCE, scope);
			if (!installedPath) throw new Error("Native installation path unavailable");
			// Raw resolveExtensionSources loses configured filters. Resolve the
			// effective settings, skip unrelated missing packages, then select ours.
			const resources = await manager.resolve(async () => "skip");
			const entries = resources.extensions.filter((resource) => resource.enabled &&
				resource.metadata.origin === "package" && resource.metadata.source === SERVICE_SOURCE &&
				resource.metadata.scope === scope && resource.metadata.baseDir !== undefined &&
				canonicalPath(resource.metadata.baseDir) === canonicalPath(installedPath));
			if (!entries.length) throw new Error("No enabled service extension resources");

			const pendingStart: Handler[] = [];
			const adapter = Object.create(pi, {
				on: { value: ((name: string, handler: Handler, options?: { uninterruptible?: boolean }) => {
					if (name === "session_shutdown") {
						shutdowns.push(handler);
						return () => {
							const index = shutdowns.indexOf(handler);
							if (index >= 0) shutdowns.splice(index, 1);
						};
					}
					const wrapped: Handler = (e, c) => retired ? undefined : handler(e, c);
					const unsubscribe = (pi.on as PiOn)(name, wrapped, options);
					if (name === "session_start") pendingStart.push(wrapped);
					subscriptions.push(unsubscribe);
					return () => {
						const index = pendingStart.indexOf(wrapped);
						if (index >= 0) pendingStart.splice(index, 1);
						const subscription = subscriptions.indexOf(unsubscribe);
						if (subscription >= 0) subscriptions.splice(subscription, 1);
						unsubscribe();
					};
				}) as ExtensionAPI["on"] },
			});
			for (const entry of entries) {
				const module = await import(entry.path) as { default?: (api: ExtensionAPI) => unknown };
				if (typeof module.default !== "function") throw new Error("Service extension factory unavailable");
				await module.default(adapter);
			}
			// The host took its startup-handler snapshot before installing us.
			for (const handler of pendingStart.splice(0)) await handler(event as never, ctx as never);
			const service = getJudgmentService();
			if (service?.version !== 1 || typeof service.judge !== "function") {
				warn("Installed judgment service is incompatible with judge version 1; no older version will be installed.");
			}
		} catch {
			await cleanup(event as never, ctx as never);
			// Do not echo transport errors: they can contain credential-bearing URLs.
			warn(`Judgment-service ${stage} failed. Check Pi package/network/auth settings and repair with native package tools, then reload. No automatic retry will run in this activation.`);
		}
	});
}
