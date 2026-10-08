/** Provisioning safety and lifecycle; native Git/update/TUI coverage is separate. */
import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { DefaultPackageManager, SettingsManager } from "@earendil-works/pi-coding-agent";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import provision from "../judgment-service.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const SOURCE = "git:github.com/xz-dev/pi-llm-as-jev";
const OWNER = "PI_JEV_TODO_AUDIT_OWNER_PID";
const key = Symbol.for("pi-llm-as-jev:service");
const traceKey = Symbol.for("jev-delivery-test-state");
const globals = globalThis as Record<symbol, unknown>;
type Handler = (...args: never[]) => unknown;
const factory = `
const KEY=Symbol.for('pi-llm-as-jev:service');
export default function(pi) {
 const trace=globalThis[Symbol.for('jev-delivery-test-state')];
 const service={version:1,judge:async()=>{throw Error('Readiness must not infer');}};
 pi.registerCommand('llm-as-jev',{handler:async()=>{}});
 pi.registerCommand('llm-as-jev-classifier',{handler:async()=>{}});
 pi.registerProvider('fixture-provider',{});
 pi.on('session_start',()=>{trace.starts++;globalThis[KEY]=service;});
 pi.on('session_shutdown',()=>{trace.shutdowns++;if(globalThis[KEY]===service)delete globalThis[KEY];});
 /* extra */
}
`;
let dir: string, agent: string, cwd: string, settingsFile: string, projectFile: string;
let savedEnv: Map<string, string | undefined>, savedService: unknown, savedTrace: unknown;
let serviceFactory: string;
let afterInstall: (() => void | Promise<void>) | undefined;
let trace: { starts: number; shutdowns: number; events: number; unsubscribe?: () => void };
let install: ReturnType<typeof spyOn<DefaultPackageManager, "install">>;
let hosts: Array<{ emit: (name: string) => Promise<void> }>;
let restores: Array<() => void>;
const settings = (path = settingsFile) => JSON.parse(readFileSync(path, "utf8"));
const writeSettings = (value: unknown, path = settingsFile) => writeFileSync(path, JSON.stringify(value));

beforeEach(() => {
	dir = mkdtempSync(join(process.platform === "win32" ? tmpdir() : "/var/tmp", "jev-provisioning-unit-"));
	agent = join(dir, "agent"); cwd = join(dir, "project");
	mkdirSync(agent); mkdirSync(join(cwd, ".pi"), { recursive: true });
	settingsFile = join(agent, "settings.json"); projectFile = join(cwd, ".pi", "settings.json");
	writeSettings({ packages: [root], editorPaddingX: 2 });
	writeSettings({ packages: [], defaultThinkingLevel: "low" }, projectFile);
	savedEnv = new Map([OWNER, "PI_CODING_AGENT_DIR", "PI_OFFLINE", "HOME", "NPM_CONFIG_USERCONFIG", "NPM_CONFIG_PREFIX"].map((name) => [name, process.env[name]]));
	process.env.HOME = dir;
	process.env.NPM_CONFIG_USERCONFIG = join(dir, "npmrc");
	process.env.NPM_CONFIG_PREFIX = join(dir, "npm-global");
	writeFileSync(process.env.NPM_CONFIG_USERCONFIG, "");
	process.env[OWNER] = String(process.pid); process.env.PI_CODING_AGENT_DIR = agent; delete process.env.PI_OFFLINE;
	savedService = globals[key]; savedTrace = globals[traceKey]; delete globals[key];
	trace = { starts: 0, shutdowns: 0, events: 0 }; globals[traceKey] = trace;
	serviceFactory = factory; afterInstall = undefined; hosts = []; restores = [];
	// Only download is replaced. Scope, settings persistence, selection and
	// resource filtering execute through the public SDK package manager.
	install = spyOn(DefaultPackageManager.prototype, "install").mockImplementation(async (source, options) => {
		expect(source).toBe(SOURCE);
		const base = options?.local ? join(cwd, ".pi") : agent;
		const path = join(base, "git", "github.com", "xz-dev", "pi-llm-as-jev");
		mkdirSync(path, { recursive: true });
		writeFileSync(join(path, "package.json"), JSON.stringify({ name: "pi-llm-as-jev", type: "module", pi: { extensions: ["./service.ts"] } }));
		writeFileSync(join(path, "service.ts"), serviceFactory);
		await afterInstall?.();
	});
});
afterEach(async () => {
	for (const h of hosts) await h.emit("session_shutdown");
	for (const restore of restores.reverse()) restore();
	install.mockRestore();
	if (savedService === undefined) delete globals[key]; else globals[key] = savedService;
	if (savedTrace === undefined) delete globals[traceKey]; else globals[traceKey] = savedTrace;
	for (const [name, value] of savedEnv) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
	rmSync(dir, { recursive: true, force: true });
});

/** Snapshot event dispatch like Pi; unsubscribe actually detaches a handler. */
function host(commandNames: string[] = []) {
	const handlers = new Map<string, Handler[]>();
	const commands = new Map<string, unknown>();
	const providers: string[] = [], unsubscribed: string[] = [], notices: string[] = [];
	const provenance = { path: join(root, "judgment-service.ts"), source: root, scope: "user", origin: "package" };
	const ctx = { cwd, isProjectTrusted: () => true, ui: { notify: (message: string) => notices.push(message) } };
	const pi = {
		on(name: string, handler: Handler) {
			handlers.set(name, [...(handlers.get(name) ?? []), handler]);
			return () => { handlers.set(name, (handlers.get(name) ?? []).filter((h) => h !== handler)); unsubscribed.push(name); };
		},
		registerCommand: (name: string, command: unknown) => commands.set(name, command),
		registerProvider: (name: string) => providers.push(name),
		getCommands: () => [...commandNames, ...commands.keys()].map((name) => ({ name, source: "extension", sourceInfo: provenance })),
	};
	const emit = async (name: string, event: Record<string, unknown> = { type: name, reason: "startup" }) => {
		for (const handler of [...(handlers.get(name) ?? [])]) await handler(event as never, ctx as never);
	};
	const h = { pi, ctx, provenance, handlers, commands, providers, emit, notices, unsubscribed };
	hosts.push(h);
	return h;
}
function activate(h = host()) { provision(h.pi as never); return h; }

function expectUnchanged(before: string, h: ReturnType<typeof host>, expectedCommands = ["jev-audit-service"]) {
	expect(install).not.toHaveBeenCalled();
	expect(readFileSync(settingsFile, "utf8")).toBe(before);
	expect([...h.commands.keys()]).toEqual(expectedCommands);
	expect(globals[key]).toBeUndefined();
}

test("suppressed child touches neither host nor package settings", async () => {
	process.env[OWNER] = "999999999";
	const h = activate(); const before = readFileSync(settingsFile, "utf8");
	expect(h.handlers.size).toBe(0);
	await h.emit("session_start"); expectUnchanged(before, h, []);
});

for (const names of [["llm-as-jev", "llm-as-jev-classifier"], ["llm-as-jev:1", "llm-as-jev-classifier:2"]]) {
	test(`loaded service commands preserve selection before publication: ${names[0]}`, async () => {
		const h = activate(host(names)); const before = readFileSync(settingsFile, "utf8");
		await h.emit("session_start"); expectUnchanged(before, h);
	});
}
for (const standalone of [{ version: 1, reviewVersion: 1, reviewCacheVersion: 1, reviewStagesVersion: 1, review: async () => ({}) }, { version: 1, judge: async () => ({}) }]) {
	test(`pre-published service is preserved with reviewVersion ${standalone.reviewVersion}`, async () => {
		globals[key] = standalone; const h = activate();
		await h.emit("session_start"); expect(install).not.toHaveBeenCalled();
		expect(globals[key]).toBe(standalone); expect([...h.commands.keys()]).toEqual(["jev-audit-service"]);
	});
}

test("provisioning command is callable and read-only before startup", async () => {
	const before = readFileSync(settingsFile, "utf8");
	const h = activate();
	expect(h.commands.has("jev-audit-service")).toBe(true);
	const command = h.commands.get("jev-audit-service") as { handler: (args: string, ctx: unknown) => Promise<void> };
	await command.handler("", h.ctx);
	expect(h.notices.join("\n")).toContain("Judgment service is unavailable");
	expect(install).not.toHaveBeenCalled();
	expect(readFileSync(settingsFile, "utf8")).toBe(before);
	expect(trace.starts).toBe(0);
	for (const version of [undefined, 2]) {
		const incompatible = { ...(version === undefined ? {} : { version }), reviewVersion: 1, reviewCacheVersion: 1, reviewStagesVersion: 1, review: async () => { throw Error("Status must not infer"); } };
		globals[key] = incompatible;
		h.notices.length = 0;
		await command.handler("", h.ctx);
		expect(h.notices.join("\n")).toContain("Judgment service is unavailable or incompatible");
		expect(globals[key]).toBe(incompatible);
		expect(install).not.toHaveBeenCalled();
		expect(readFileSync(settingsFile, "utf8")).toBe(before);
		expect(trace.starts).toBe(0);
	}
	globals[key] = { version: 1, judge: async () => { throw Error("Status must not infer"); } };
	h.notices.length = 0;
	await command.handler("", h.ctx);
	expect(h.notices.join("\n")).toContain("Judgment service is available");
	expect(install).not.toHaveBeenCalled();
	expect(readFileSync(settingsFile, "utf8")).toBe(before);
});

for (const scope of ["user", "project"]) {
	test(`own resource provenance provisions with audit disabled and no audit command in ${scope} scope`, async () => {
		const configPath = join(agent, "jev-todo-audit.json");
		const config = JSON.stringify({ enabled: false });
		writeFileSync(configPath, config);
		if (scope === "project") {
			writeSettings({ packages: [], editorPaddingX: 2 });
			writeSettings({ packages: [root] }, projectFile);
		}
		const h = host(); h.provenance.path = join(root, "judgment-service.ts"); h.provenance.scope = scope;
		h.pi.getCommands = () => [...h.commands.keys()].map((name) => ({ name, source: "extension", sourceInfo: h.provenance }));
		activate(h); await h.emit("session_start");
		expect(trace.starts).toBe(1);
		expect(h.commands.has("jev-audit-service")).toBe(true);
		expect(h.commands.has("jev-audit")).toBe(false);
		expect(install).toHaveBeenCalledWith(SOURCE, { local: scope === "project" });
		expect(settings(scope === "project" ? projectFile : settingsFile).packages).toEqual([root, SOURCE]);
		expect(readFileSync(configPath, "utf8")).toBe(config);
	});
}

test("first startup persists once and replays once, without duplicate commands/providers", async () => {
	const h = activate(); const projectBefore = readFileSync(projectFile, "utf8");
	await h.emit("session_start", { reason: "startup" });
	expect(trace.starts).toBe(1); // Exactly one replay of the snapshotted first start.
	const service = globals[key];
	for (const reason of ["reload", "resume"]) await h.emit("session_start", { reason });
	expect(globals[key]).toBe(service);
	expect(settings()).toEqual({ packages: [root, SOURCE], editorPaddingX: 2 });
	expect(readFileSync(projectFile, "utf8")).toBe(projectBefore);
	expect(install).toHaveBeenCalledTimes(1);
	expect(trace.starts).toBe(3); // Later host events are forwarded, not new activations.
	expect(h.commands.size).toBe(3); expect(h.providers).toEqual(["fixture-provider"]);
	expect(typeof (globals[key] as { judge: unknown }).judge).toBe("function");
	await h.emit("session_shutdown"); expect(globals[key]).toBeUndefined();
	expect(trace.shutdowns).toBe(1);
});

test("trusted project registers only in project scope", async () => {
	writeSettings({ packages: [], editorPaddingX: 2 }); writeSettings({ packages: [root], defaultThinkingLevel: "low" }, projectFile);
	const before = readFileSync(settingsFile, "utf8"); const h = host(); h.provenance.scope = "project";
	activate(h); await h.emit("session_start");
	expect(install).toHaveBeenCalledWith(SOURCE, { local: true });
	expect(readFileSync(settingsFile, "utf8")).toBe(before);
	expect(settings(projectFile)).toEqual({ packages: [root, SOURCE], defaultThinkingLevel: "low" });
	expect(trace.starts).toBe(1);
});

for (const scope of ["temporary", "unknown", "project"]) {
	test(`no guessed registration for ${scope} with untrusted project`, async () => {
		const h = host(); h.provenance.scope = scope; h.ctx.isProjectTrusted = () => false;
		activate(h); const before = readFileSync(settingsFile, "utf8");
		await h.emit("session_start"); expectUnchanged(before, h);
	});
}
test("wrong installation provenance does not default to user scope", async () => {
	const h = host(); h.provenance.path = join(dir, "unrelated-index.ts"); activate(h);
	const before = readFileSync(settingsFile, "utf8"); await h.emit("session_start"); expectUnchanged(before, h);
	expect(h.notices.join("\n")).toContain("Cannot determine a persistent audit installation scope");
});
test("offline first startup reports unavailability and performs no installation", async () => {
	process.env.PI_OFFLINE = "true"; const h = activate(); const before = readFileSync(settingsFile, "utf8");
	await h.emit("session_start"); expectUnchanged(before, h);
	expect(h.notices.join("\n")).toContain("unavailable in offline mode");
});

for (const selected of [SOURCE, `${SOURCE}@v1`, "git:https://github.com/xz-dev/pi-llm-as-jev.git@v1", "git:git@github.com:xz-dev/pi-llm-as-jev.git@v1", "git:ssh://git@github.com/xz-dev/pi-llm-as-jev.git@v1", "npm:pi-llm-as-jev@1.0.0"]) {
	test(`missing or filtered configured service is preserved: ${selected}`, async () => {
		writeSettings({ packages: [root, { source: selected, extensions: [], skills: ["keep"] }], editorPaddingX: 2 });
		const before = readFileSync(settingsFile, "utf8"); const h = activate();
		await h.emit("session_start"); expectUnchanged(before, h);
	});
}
test("installed local service identity preserves its disabled resource selection", async () => {
	const local = join(dir, "custom-service"); mkdirSync(local);
	writeFileSync(join(local, "package.json"), JSON.stringify({ name: "pi-llm-as-jev" }));
	writeSettings({ packages: [root, { source: local, extensions: [] }] });
	const before = readFileSync(settingsFile, "utf8"); const h = activate();
	await h.emit("session_start"); expectUnchanged(before, h);
});
test("trusted project service selection takes precedence over a global audit", async () => {
	writeSettings({ packages: [{ source: `${SOURCE}@chosen`, extensions: [] }] }, projectFile);
	const before = readFileSync(settingsFile, "utf8"); const projectBefore = readFileSync(projectFile, "utf8");
	const h = activate(); await h.emit("session_start"); expectUnchanged(before, h);
	expect(readFileSync(projectFile, "utf8")).toBe(projectBefore);
});
test("untrusted project settings are not read while a global audit provisions", async () => {
	writeFileSync(projectFile, "{invalid untrusted settings");
	const h = host(); h.ctx.isProjectTrusted = () => false; activate(h); await h.emit("session_start");
	expect(trace.starts).toBe(1); expect(settings().packages).toEqual([root, SOURCE]);
	expect(readFileSync(projectFile, "utf8")).toBe("{invalid untrusted settings");
});
test("selection changed during download is preserved without activation", async () => {
	const chosen = { packages: [root, { source: `${SOURCE}@chosen`, extensions: [] }], editorPaddingX: 9 };
	afterInstall = () => writeSettings(chosen);
	const h = activate(); await h.emit("session_start");
	expect(settings()).toEqual(chosen); expect([...h.commands.keys()]).toEqual(["jev-audit-service"]);
	expect(h.notices.join("\n")).toContain("preserving that selection"); expect(trace.starts).toBe(0);
});
test("only matching enabled service resources activate, without installing unrelated packages", async () => {
	const other = join(dir, "other"); mkdirSync(other);
	writeFileSync(join(other, "package.json"), JSON.stringify({ name: "unrelated", pi: { extensions: ["./other.ts"] } }));
	writeFileSync(join(other, "other.ts"), "throw Error('Unrelated resource was activated')");
	writeSettings({ packages: [root, other, "git:github.com/fixture/unrelated-missing"] });
	const h = activate(); await h.emit("session_start");
	expect(trace.starts).toBe(1); expect(install).toHaveBeenCalledTimes(1);
	expect(h.notices.some((message) => message.includes("failed"))).toBe(false);
});

test("retired activation shutdown cannot delete a replacement handle", async () => {
	const h = activate(); await h.emit("session_start"); expect(globals[key]).toBeDefined();
	const replacement = { version: 1, reviewVersion: 1, reviewCacheVersion: 1, reviewStagesVersion: 1, marker: "gen2", review: async () => ({}) };
	globals[key] = replacement; await h.emit("session_shutdown", { reason: "reload" });
	expect(globals[key]).toBe(replacement); await h.emit("session_start"); expect(trace.starts).toBe(1);
});
test("delegated shutdown unsubscribe works for handlers added after startup adoption", async () => {
	serviceFactory = factory.replace("/* extra */", `pi.on('session_start',()=>{trace.unsubscribe=pi.on('session_shutdown',()=>{trace.events++;});});`);
	const h = activate(); await h.emit("session_start");
	expect(typeof trace.unsubscribe).toBe("function"); trace.unsubscribe!();
	await h.emit("session_shutdown"); expect(trace.events).toBe(0); expect(trace.shutdowns).toBe(1);
});
test("cancelled first-start callbacks are not replayed and ordinary events unsubscribe", async () => {
	serviceFactory = factory.replace("/* extra */", `pi.on('session_start',()=>{trace.events+=100;})(); trace.unsubscribe=pi.on('agent_end',()=>{trace.events++;});`);
	const h = activate(); await h.emit("session_start"); expect(trace.events).toBe(0);
	await h.emit("agent_end"); expect(trace.events).toBe(1);
	trace.unsubscribe!(); await h.emit("agent_end"); expect(trace.events).toBe(1);
});
test("partial publication is cleaned immediately and its retired handlers never run", async () => {
	serviceFactory = factory.replace("/* extra */", `pi.on('agent_end',()=>{trace.events++;});pi.on('session_start',()=>{throw Error('secret post-publication failure');});`);
	const h = activate(); let mainWork = 0; h.pi.on("session_start", () => { mainWork++; });
	await h.emit("session_start"); expect(globals[key]).toBeUndefined(); expect(trace.shutdowns).toBe(1);
	expect(mainWork).toBe(1); expect(h.notices.join("\n")).toContain("activation failed");
	expect(h.notices.join("\n")).not.toContain("secret");
	await h.emit("session_start"); await h.emit("agent_end"); expect(trace.starts).toBe(1); expect(trace.events).toBe(0);
	expect(settings().packages).toEqual([root, SOURCE]); expect(install).toHaveBeenCalledTimes(1);
});
test("failed startup cleanup preserves a concurrently published replacement", async () => {
	serviceFactory = factory.replace("/* extra */", `pi.on('session_start',()=>{globalThis[KEY]={marker:'replacement'};throw Error('failed old owner');});`);
	const h = activate(); await h.emit("session_start");
	expect(globals[key]).toEqual({ marker: "replacement" });
	expect(trace.shutdowns).toBe(1);
	expect(h.notices.join("\n")).toContain("activation failed");
});
test("factory failure leaves no handle and does not retry from audit events", async () => {
	serviceFactory = "export default function() { throw Error('private failure details'); }";
	const h = activate(); await h.emit("session_start"); await h.emit("agent_end"); await h.emit("session_start");
	expect(globals[key]).toBeUndefined(); expect(install).toHaveBeenCalledTimes(1);
	expect(h.notices.filter((message) => message.includes("activation failed"))).toHaveLength(1);
	expect(h.notices.join("\n")).not.toContain("private failure details");
});
test("incompatible newly installed service is diagnosed without downgrade", async () => {
	serviceFactory = factory.replace("version:1", "version:99");
	const h = activate(); await h.emit("session_start");
	expect(h.notices.join("\n")).toContain("incompatible with judge version 1");
	expect(install).toHaveBeenCalledTimes(1); expect(settings().packages).toEqual([root, SOURCE]);
});

for (const reason of ["download unavailable", "Authentication failed https://secret-token@private.invalid"]) {
	test(`installation failure is bounded and does not switch transport: ${reason.split(" ")[0]}`, async () => {
		install.mockImplementation(async () => { throw new Error(reason); });
		const before = readFileSync(settingsFile, "utf8"); const h = activate();
		await h.emit("session_start"); await h.emit("session_start");
		expect(install).toHaveBeenCalledTimes(1); expect(install).toHaveBeenCalledWith(SOURCE, { local: false });
		expect(readFileSync(settingsFile, "utf8")).toBe(before); expect(globals[key]).toBeUndefined();
		expect(h.notices.filter((message) => message.includes("installation failed"))).toHaveLength(1);
		expect(h.notices.join("\n")).not.toContain(reason);
	});
}
test("native persistence errors after clone prevent activation and update-success claims", async () => {
	const drain = spyOn(SettingsManager.prototype, "drainErrors");
	let calls = 0;
	drain.mockImplementation(() => ++calls === 3 ? [{ scope: "global", error: new Error("disk failure") }] : []);
	restores.push(() => drain.mockRestore());
	const h = activate(); await h.emit("session_start");
	expect(install).toHaveBeenCalledTimes(1); expect(trace.starts).toBe(0); expect(globals[key]).toBeUndefined();
	expect(h.notices.join("\n")).toContain("registration failed");
});
test("settings changed to unreadable after clone are not overwritten", async () => {
	afterInstall = () => writeFileSync(settingsFile, "{broken settings");
	const h = activate(); await h.emit("session_start");
	expect(readFileSync(settingsFile, "utf8")).toBe("{broken settings");
	expect(h.notices.join("\n")).toContain("registration failed"); expect(trace.starts).toBe(0);
});
test("a later normal activation retries an unregistered failure without changing the audit switch", async () => {
	writeSettings({ packages: [root], editorPaddingX: 2, jevAuditEnabled: false });
	afterInstall = () => { throw Error("temporary download failure"); };
	const failed = activate(); await failed.emit("session_start"); expect(globals[key]).toBeUndefined();
	afterInstall = undefined; const repaired = activate(); await repaired.emit("session_start");
	expect(trace.starts).toBe(1); expect(install).toHaveBeenCalledTimes(2);
	expect(settings()).toEqual({ packages: [root, SOURCE], editorPaddingX: 2, jevAuditEnabled: false });
});
