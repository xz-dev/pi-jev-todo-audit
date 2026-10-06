/** Delivery contract: no nested service pin; first startup registers a native package. */
import { expect, spyOn, test } from "bun:test";
import { DefaultPackageManager } from "@earendil-works/pi-coding-agent";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = "git:github.com/xz-dev/pi-llm-as-jev";
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

test("audit does not constrain the independently managed service in its dependencies or lockfile", () => {
	for (const field of ["dependencies", "devDependencies", "optionalDependencies"]) {
		expect(pkg[field]?.["pi-llm-as-jev"]).toBeUndefined();
	}
	const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
	expect(Object.keys(lock.packages ?? {}).filter((path) => /(?:^|\/)node_modules\/pi-llm-as-jev$/.test(path))).toEqual([]);
});

test("pi manifest exposes a separately filterable provisioning entry", () => {
	expect(pkg.pi?.extensions).toContain("./judgment-service.ts");
	expect(pkg.pi?.extensions).toContain("./index.ts");
	expect(existsSync(join(root, "judgment-service.ts"))).toBe(true);
});

test("first managed startup registers one unqualified service package without changing other settings", async () => {
	const dir = mkdtempSync(join(process.platform === "win32" ? tmpdir() : "/var/tmp", "jev-service-registration-"));
	const agentDir = join(dir, "agent");
	const cwd = join(dir, "project");
	mkdirSync(agentDir, { recursive: true });
	mkdirSync(cwd);
	const settingsFile = join(agentDir, "settings.json");
	const original = { packages: [root], editorPaddingX: 2, defaultThinkingLevel: "low" };
	writeFileSync(settingsFile, JSON.stringify(original));
	const savedEnv = new Map(["PI_CODING_AGENT_DIR", "PI_JEV_TODO_AUDIT_OWNER_PID", "PI_OFFLINE"].map((key) => [key, process.env[key]]));
	process.env.PI_CODING_AGENT_DIR = agentDir;
	process.env.PI_JEV_TODO_AUDIT_OWNER_PID = String(process.pid);
	delete process.env.PI_OFFLINE;
	const key = Symbol.for("pi-llm-as-jev:service");
	const globals = globalThis as Record<symbol, unknown>;
	const previousService = globals[key];
	delete globals[key];

	// Replace only network installation. Native settings persistence and resource
	// resolution remain real; full native Git-update coverage uses the CLI fixture.
	const install = spyOn(DefaultPackageManager.prototype, "install").mockImplementation(async function (this: DefaultPackageManager, selected, options) {
		expect(selected).toBe(source);
		expect(options?.local ?? false).toBe(false);
		const serviceDir = join(agentDir, "git", "github.com", "xz-dev", "pi-llm-as-jev");
		mkdirSync(serviceDir, { recursive: true });
		writeFileSync(join(serviceDir, "package.json"), JSON.stringify({
			name: "pi-llm-as-jev", type: "module", pi: { extensions: ["./service.ts"] },
		}));
		writeFileSync(join(serviceDir, "service.ts"), `
			const key = Symbol.for("pi-llm-as-jev:service");
			export default function(pi) {
				const service = { version: 1, reviewVersion: 1, review: async () => ({}) };
				pi.registerCommand("llm-as-jev", { description: "Fixture configuration", handler: async () => {} });
				pi.on("session_start", () => { globalThis[key] = service; });
				pi.on("session_shutdown", () => { if (globalThis[key] === service) delete globalThis[key]; });
			}
		`);
	});
	const handlers = new Map<string, Array<(...args: never[]) => unknown>>();
	const commands = new Map<string, unknown>();
	const sourceInfo = { path: join(root, "judgment-service.ts"), source: root, scope: "user", origin: "package" };
	const pi = {
		on(name: string, handler: (...args: never[]) => unknown) {
			handlers.set(name, [...(handlers.get(name) ?? []), handler]);
			return () => {
				const active = handlers.get(name) ?? [];
				const index = active.indexOf(handler);
				if (index >= 0) active.splice(index, 1);
			};
		},
		registerCommand: (name: string, command: unknown) => commands.set(name, command),
		registerProvider: () => {},
		unregisterProvider: () => {},
		appendEntry: () => {},
		getCommands: () => [...commands.keys()].map((name) => ({ name, source: "extension", sourceInfo })),
	};
	const ctx = {
		cwd, isProjectTrusted: () => true,
		ui: { notify: () => {} },
		modelRegistry: {
			getAll: () => [], getAvailable: () => [], find: () => undefined,
			getAvailableOfType: async () => [], getProviderAuth: async () => undefined,
			getRegisteredProviderIds: () => [], classify: async () => ({}),
			streamSimple: () => ({ result: async () => ({}) }),
		},
		sessionManager: { getBranch: () => [] },
	};
	const emit = async (name: string) => {
		for (const handler of [...(handlers.get(name) ?? [])]) {
			await handler({ type: name, reason: "startup" } as never, ctx as never);
		}
	};
	try {
		const { default: provision } = await import("../judgment-service.js");
		provision(pi as never);
		await emit("session_start");
		expect(JSON.parse(readFileSync(settingsFile, "utf8"))).toEqual({ ...original, packages: [root, source] });
		expect(install).toHaveBeenCalledTimes(1);
		expect(commands.has("llm-as-jev")).toBe(true);
		expect(typeof (globals[key] as { review?: unknown } | undefined)?.review).toBe("function");
		await emit("session_start");
		expect(install).toHaveBeenCalledTimes(1);
	} finally {
		await emit("session_shutdown");
		install.mockRestore();
		if (previousService === undefined) delete globals[key];
		else globals[key] = previousService;
		for (const [name, value] of savedEnv) {
			if (value === undefined) delete process.env[name];
			else process.env[name] = value;
		}
		rmSync(dir, { recursive: true, force: true });
	}
});

/** The service working candidate supplies real source, never a production pin. */
const realServiceTest = process.env.JEV_NATIVE_REAL_SERVICE === "1" ? test : test.skip;
realServiceTest("native real service: first-start status diagnostic and native reload ownership", async () => {
	const { nativeDelivery } = await import("./service-delivery-native.js");
	const serviceRepo = process.env.PI_JUDGMENT_SOURCE;
	expect(typeof serviceRepo).toBe("string");
	expect(serviceRepo?.length).toBeGreaterThan(0);
	expect(process.env.PI_TODO_SOURCE?.length ?? 0).toBeGreaterThan(0);
	await nativeDelivery(root, process.env.JEV_PI_BIN ?? "", "bun", serviceRepo, process.env.PI_TODO_SOURCE);
}, 240_000);

/** Opt-in native checks are self-contained; only the executable is supplied. */
const nativeTest = process.env.JEV_NATIVE_DELIVERY === "1" ? test : test.skip;
for (const route of ["bun", "npm", "safety"] as const) {
	const behavior = route === "safety" ? "scope, selections, failures and recovery" : "first-start dispatch, independent update, and real reload";
	nativeTest(`native ${route}: ${behavior}`, async () => {
		const { nativeDelivery } = await import("./service-delivery-native.js");
		if (route === "safety") expect(process.env.PI_TODO_SOURCE?.length ?? 0).toBeGreaterThan(0);
		await nativeDelivery(root, process.env.JEV_PI_BIN ?? "", route, undefined, route === "safety" ? process.env.PI_TODO_SOURCE : undefined);
	}, 240_000);
}
