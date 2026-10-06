import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { stripVTControlCharacters } from "node:util";

const SERVICE = "git:github.com/xz-dev/pi-llm-as-jev";
const AUDIT = "git:github.com/xz-dev/pi-jev-todo-audit";
const flags = ["--no-session", "--no-skills", "--no-prompt-templates", "--no-context-files", "--no-themes"];
const hash = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
interface Command { name: string; description?: string; sourceInfo: { source: string; path: string; scope: string } }
interface Packet { type: string; id?: string; success?: boolean; data?: { commands?: Command[]; disposition?: string; output?: string; exitCode?: number }; method?: string; message?: string; event?: string; error?: string }
interface Observation { snapshots?: Array<{ action: string; error?: string; tasks: Array<{ id: number; status: string; subject: string }> }>; kind: string; token?: string; generation: number; reason?: string; marker?: string; version?: number; reviewVersion?: number; review?: string; sameAsOld?: boolean; ledgerEntries?: number; calls?: number; commands?: Command[]; auditPath?: string; servicePath?: string; scope?: string; trusted?: boolean; tools?: string[]; pid?: number }

async function until<T>(read: () => T | undefined | false, label: string): Promise<T> {
	const deadline = Date.now() + 60_000;
	while (Date.now() < deadline) {
		const value = read();
		if (value) return value;
		await new Promise((done) => setTimeout(done, 25));
	}
	throw new Error(`Timed out waiting for ${label}`);
}

/** Real native operations, but every path/config/credential boundary is test-owned. */
export async function nativeDelivery(repo: string, binary: string, route: "bun" | "npm" | "safety", realServiceRepo?: string, realTodoRepo?: string): Promise<void> {
	assert.ok(binary, "JEV_PI_BIN must explicitly select the native Pi executable");
	const dir = mkdtempSync(`/var/tmp/jev-native-${route}-`);
	console.log(`Native ${route} evidence: ${dir}`);
	const gitConfig = join(dir, "gitconfig");
	writeFileSync(gitConfig, "");
	const children: ChildProcess[] = [];
	const results: string[] = [];
	const save = (path: string, value: unknown) => writeFileSync(join(dir, path), JSON.stringify(value, null, 2));
	const check = (name: string, condition: unknown) => { assert.ok(condition, name); results.push(name); };
	function environment(caseDir: string): NodeJS.ProcessEnv {
		const env: NodeJS.ProcessEnv = {
			PATH: `${dir}/bin:/usr/bin:/bin`, LANG: "C.UTF-8", TERM: "xterm-256color",
			HOME: join(caseDir, "home"), PI_CODING_AGENT_DIR: join(caseDir, "agent"), TMPDIR: join(caseDir, "tmp"),
			XDG_CONFIG_HOME: join(caseDir, "xdg-config"), XDG_CACHE_HOME: join(caseDir, "xdg-cache"), XDG_DATA_HOME: join(caseDir, "xdg-data"),
			GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: gitConfig, GIT_TERMINAL_PROMPT: "0",
			GIT_TRACE2_EVENT: join(caseDir, "git-trace.jsonl"),
			NPM_CONFIG_USERCONFIG: join(caseDir, "npmrc"), NPM_CONFIG_CACHE: join(caseDir, "npm-cache"),
			JEV_NPM_TRACE: join(caseDir, "npm-trace.txt"), DELIVERY_OBSERVER: join(caseDir, "observer.jsonl"), DELIVERY_GIT_CALLS: join(caseDir, "git-calls.txt"),
			// Target Pi suppresses model-network refresh on definedness; package
			// offline parsing treats "0" as false, permitting only our local Git.
			PI_OFFLINE: "0",
		};
		for (const key of ["HOME", "PI_CODING_AGENT_DIR", "TMPDIR", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_DATA_HOME"]) mkdirSync(env[key]!, { recursive: true });
		mkdirSync(join(caseDir, "project"), { recursive: true });
		writeFileSync(env.NPM_CONFIG_USERCONFIG!, "");
		return env; // Deliberately no process.env spread or inherited auth/socket.
	}
	const buildEnv = environment(join(dir, "build"));
	function run(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, label: string): string {
		const result = spawnSync(command, args, { cwd, env, encoding: "utf8", timeout: 90_000, maxBuffer: 8 * 1024 * 1024 });
		appendFileSync(join(dir, "commands.jsonl"), JSON.stringify({ label, command, args, code: result.status, error: result.error?.message }) + "\n");
		appendFileSync(join(dir, "commands.log"), `\n=== ${label} ===\n${result.stdout ?? ""}${result.stderr ?? ""}`);
		assert.equal(result.status, 0, `${label} failed; see ${dir}/commands.log`);
		return result.stdout.trim();
	}
	const git = (args: string[]) => run("git", args, dir, buildEnv, `git ${args[0]}`);
	async function stop(child: ChildProcess) {
		if (child.exitCode !== null || child.signalCode) return;
		const exited = new Promise((done) => child.once("exit", done));
		if (child.spawnfile === "/usr/bin/script" && child.pid) {
			try { process.kill(-child.pid, "SIGTERM"); } catch { child.kill("SIGTERM"); }
		} else child.kill("SIGTERM");
		await Promise.race([exited, new Promise((done) => setTimeout(done, 1_000))]);
		if (child.exitCode === null && !child.signalCode) child.kill("SIGKILL");
		await exited;
	}
	function observations(caseDir: string): Observation[] {
		const file = join(caseDir, "observer.jsonl");
		return existsSync(file) ? readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)) : [];
	}
	function startRpc(caseDir: string, env: NodeJS.ProcessEnv, label: string, extraFlags: string[] = []) {
		const child = spawn(binary, ["--mode", "rpc", ...flags, ...extraFlags], { cwd: join(caseDir, "project"), env, stdio: ["pipe", "pipe", "pipe"] });
		children.push(child);
		const responses = new Map<string, Packet>();
		const events: Packet[] = [];
		let buffer = "", sequence = 0;
		child.stdout.on("data", (data) => {
			appendFileSync(join(caseDir, `${label}.stdout`), data);
			buffer += data;
			let end: number;
			while ((end = buffer.indexOf("\n")) >= 0) {
				const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
				try {
					const packet: Packet = JSON.parse(line);
					if (packet.type === "response" && packet.id) responses.set(packet.id, packet);
					else events.push(packet); // UI requests also carry IDs, but aren't responses.
				} catch { /* Native installation progress can be non-JSON. Raw bytes retained. */ }
			}
		});
		child.stderr.on("data", (data) => appendFileSync(join(caseDir, `${label}.stderr`), data));
		return {
			child, events,
			async request(type: string, message?: string, command = true) {
				const id = `${label}-${++sequence}`;
				child.stdin.write(JSON.stringify({ id, type, ...(message ? { [type === "bash" ? "command" : "message"]: message } : {}) }) + "\n");
				const response = await until(() => responses.get(id), id);
				assert.equal(response.success, true, JSON.stringify(response));
				assert.deepEqual(events.filter((e) => e.type === "extension_error" && e.event === "command"), [], "handled response must not conceal command failure");
				if (type === "prompt" && command) assert.equal(response.data?.disposition, "handled", "registered command, not model input");
				return response;
			},
		};
	}
	try {
		const version = run(binary, ["--version"], dir, buildEnv, "host identity");
		const files = readdirSync(repo).filter((name) => name.endsWith(".ts") || ["package.json", "package-lock.json", "README.md", "LICENSE"].includes(name));
		const candidate = Object.fromEntries(files.map((name) => [name, hash(join(repo, name))]));
		save("identity.json", { binary, version, binaryHash: hash(binary), candidate, route, envNames: Object.keys(buildEnv).sort() });
		const auditRepo = join(dir, "audit-remote"), serviceRepo = join(dir, "service-remote");
		for (const path of [auditRepo, serviceRepo]) {
			mkdirSync(path); git(["init", "--initial-branch=main", path]);
			git(["-C", path, "config", "user.name", "Delivery fixture"]);
			git(["-C", path, "config", "user.email", "fixture@example.invalid"]);
			git(["-C", path, "config", "commit.gpgsign", "false"]);
		}
		for (const file of files) copyFileSync(join(repo, file), join(auditRepo, file));
		git(["-C", auditRepo, "add", "."]); git(["-C", auditRepo, "commit", "-qm", "Actual audit candidate A"]);
		const auditA = git(["-C", auditRepo, "rev-parse", "HEAD"]);
		writeFileSync(join(serviceRepo, "package.json"), JSON.stringify({ name: "pi-llm-as-jev", type: "module", pi: { extensions: ["./service.ts"] } }));
		function serviceRevision(revision: string): string {
			writeFileSync(join(serviceRepo, "service.ts"), `
				import fs from 'node:fs';
				const KEY=Symbol.for('pi-llm-as-jev:service');
				export default function(pi) {
					const service={version:1,reviewVersion:1,marker:${JSON.stringify(revision)},review:async()=>{globalThis.__deliveryInference=(globalThis.__deliveryInference??0)+1;throw Error('Unexpected inference');}};
					pi.registerCommand('llm-as-jev',{description:'Judge backend ${revision}',handler:async(_a,ctx)=>ctx.ui.notify('Fixture ${revision} status','info')});
					pi.registerCommand('llm-as-jev-classifier',{description:'Classifier ${revision}',handler:async()=>{}});
					pi.on('session_start',()=>{globalThis[KEY]=service;fs.appendFileSync(process.env.DELIVERY_OBSERVER,JSON.stringify({kind:'service-start',marker:${JSON.stringify(revision)},pid:process.pid})+'\\n');});
					pi.on('session_shutdown',()=>{if(globalThis[KEY]===service)delete globalThis[KEY];});
				}
			`);
			git(["-C", serviceRepo, "add", "."]); git(["-C", serviceRepo, "commit", "-qm", revision]);
			return git(["-C", serviceRepo, "rev-parse", "HEAD"]);
		}
		let s1: string;
		if (realServiceRepo) {
			const revision = git(["-C", realServiceRepo, "rev-parse", "HEAD"]);
			const archive = join(dir, "real-service.tar");
			git(["-C", realServiceRepo, "archive", "--output", archive, revision]);
			run("tar", ["-xf", archive, "-C", serviceRepo], dir, buildEnv, "extract real service baseline");
			// Overlay the actual working candidate; HEAD alone predates config refresh.
			const workingSources: Record<string, string> = {};
			for (const folder of ["src", "client"]) {
				cpSync(join(realServiceRepo, folder), join(serviceRepo, folder), { recursive: true });
				for (const name of readdirSync(join(realServiceRepo, folder), { recursive: true })) {
					if (typeof name === "string" && name.endsWith(".ts")) workingSources[`${folder}/${name}`] = hash(join(realServiceRepo, folder, name));
				}
			}
			for (const name of ["package.json", "package-lock.json", "README.md"]) {
				copyFileSync(join(realServiceRepo, name), join(serviceRepo, name));
				workingSources[name] = hash(join(realServiceRepo, name));
			}
			git(["-C", serviceRepo, "add", "."]); git(["-C", serviceRepo, "commit", "-qm", "Real service working candidate"]);
			s1 = git(["-C", serviceRepo, "rev-parse", "HEAD"]);
			save("real-service-source.json", { repository: realServiceRepo, baselineRevision: revision, mirrorRevision: s1, archiveHash: hash(archive), workingSources, entryHash: hash(join(serviceRepo, "src/index.ts")) });
		} else s1 = serviceRevision("S1");
		for (const [remote, url] of [[auditRepo, "github.com/xz-dev/pi-jev-todo-audit"], [serviceRepo, "github.com/xz-dev/pi-llm-as-jev"]]) {
			for (const spelling of [`https://${url}`, `https://${url}.git`, `git@${url.replace("/", ":")}`, `git@${url.replace("/", ":")}.git`]) {
				git(["config", "--file", gitConfig, "--add", `url.${pathToFileURL(remote).href}.insteadOf`, spelling]);
			}
		}
		mkdirSync(join(dir, "bin"));
		writeFileSync(join(dir, "bin", "npm"), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$JEV_NPM_TRACE"\nexec /usr/bin/npm "$@"\n', { mode: 0o755 });

		function setup(label: string, local = false) {
			const caseDir = join(dir, label), env = environment(caseDir);
			const initial = { editorPaddingX: 2, lastChangelogVersion: version, ...(route === "npm" ? { npmCommand: ["npm"] } : {}) };
			writeFileSync(join(env.PI_CODING_AGENT_DIR!, "settings.json"), JSON.stringify(initial));
			if (local) {
				mkdirSync(join(caseDir, "project", ".pi"), { recursive: true });
				writeFileSync(join(caseDir, "project", ".pi", "settings.json"), JSON.stringify(initial));
			}
			const extensions = join(env.PI_CODING_AGENT_DIR!, "extensions"); mkdirSync(extensions);
			writeFileSync(join(extensions, "observer.ts"), `
				import fs from 'node:fs';
				${route === "safety" ? "import { Type } from 'typebox';" : ""}
				const KEY=Symbol.for('pi-llm-as-jev:service'),GEN=Symbol.for('delivery-generation'),OLD=Symbol.for('delivery-old-service');
				const mark=x=>fs.appendFileSync(process.env.DELIVERY_OBSERVER,JSON.stringify({...x,pid:process.pid})+'\\n');
				export default function(pi) {
					${route === "safety" && !realTodoRepo ? "pi.registerTool({name:'todo',label:'TODO fixture',description:'Task-owned tool availability sentinel',parameters:Type.Object({}),execute:async()=>({content:[{type:'text',text:'Fixture task remains pending'}],details:{}})});" : ""}
					const generation=globalThis[GEN]=(globalThis[GEN]??0)+1;
					pi.on('session_start',e=>mark({kind:'start',reason:e.reason,generation}));
					pi.on('session_shutdown',e=>mark({kind:'shutdown',reason:e.reason,generation}));
					pi.registerCommand('delivery-state',{handler:async(token,ctx)=>{
						const {DefaultPackageManager,SettingsManager,getAgentDir}=await import('@earendil-works/pi-coding-agent');
						const pm=new DefaultPackageManager({cwd:ctx.cwd,agentDir:getAgentDir(),settingsManager:SettingsManager.create(ctx.cwd,getAgentDir(),{projectTrusted:ctx.isProjectTrusted()})});
						const installed=(source)=>${local ? "ctx.isProjectTrusted()" : "true"}?pm.getInstalledPath(source,${JSON.stringify(local ? "project" : "user")}):undefined;
						const s=globalThis[KEY];mark({kind:'state',token,generation,scope:pi.getCommands().find(c=>c.name==='jev-audit-service')?.sourceInfo?.scope,trusted:ctx.isProjectTrusted(),tools:pi.getAllTools().map(t=>t.name),marker:s?.marker,version:s?.version,reviewVersion:s?.reviewVersion,review:typeof s?.review,sameAsOld:globalThis[OLD]===s,ledgerEntries:ctx.sessionManager.getBranch().filter(e=>e.type==='custom'&&/jev.*(?:ledger|audit)/.test(e.customType)).length,calls:globalThis.__deliveryInference??0,
						commands:pi.getCommands().filter(c=>c.name.startsWith('llm-as-jev')),auditPath:installed(${JSON.stringify(AUDIT)}),servicePath:installed(${JSON.stringify(SERVICE)})});if(!globalThis[OLD])globalThis[OLD]=s;
					}});
					pi.registerCommand('delivery-reload',{handler:async(_a,ctx)=>{mark({kind:'reload-invoked',generation});await ctx.reload();mark({kind:'reload-returned',generation});}});
					pi.registerCommand('delivery-exit',{handler:async(_a,ctx)=>ctx.shutdown()});
				}
			`);
			if (realTodoRepo) {
				env.DELIVERY_TODO_ENTRY = join(realTodoRepo, "index.ts");
				assert.ok(existsSync(env.DELIVERY_TODO_ENTRY), "PI_TODO_SOURCE must select the actual rpiv-todo package");
				copyFileSync(join(repo, "test/fixtures/real-todo-native.mjs"), join(extensions, "real-todo.ts"));
			}
			run(binary, ["install", AUDIT, ...(local ? ["--local", "--approve"] : [])], join(caseDir, "project"), env, `${label} install audit only`);
			const settingsFile = local ? join(caseDir, "project", ".pi", "settings.json") : join(env.PI_CODING_AGENT_DIR!, "settings.json");
			assert.deepEqual(JSON.parse(readFileSync(settingsFile, "utf8")), { ...initial, packages: [AUDIT] });
			return { caseDir, env, initial, settingsFile };
		}
		async function todoBusiness(c: ReturnType<typeof setup>, r: ReturnType<typeof startRpc>, label: string) {
			if (!realTodoRepo) return;
			await r.request("prompt", "Execute the isolated TODO business probe.", false);
			await until(() => r.events.some((e) => e.type === "agent_end"), `${label} TODO agent completion`);
			await r.request("prompt", "/real-todo-proof");
			const proof = await until(() => observations(c.caseDir).find((o) => o.kind === "todo-business" && o.pid === r.child.pid), `${label} real TODO snapshots`);
			assert.equal(proof.calls, 4);
			assert.deepEqual(proof.snapshots?.map((s) => s.action), ["create", "update", "list"]);
			check(`${label}: actual rpiv-todo create/update/list through native agent runner`, proof.snapshots?.every((s) => !s.error && s.tasks.length === 1 && s.tasks[0].id === 1 && s.tasks[0].subject === "Delivery failure does not block TODO work"));
			assert.deepEqual(proof.snapshots?.map((s) => s.tasks[0].status), ["pending", "in_progress", "in_progress"]);
			check(`${label}: real tool results retained in the native branch`, true);
		}
		if (realTodoRepo) save("real-todo-source.json", { repository: realTodoRepo, revision: git(["-C", realTodoRepo, "rev-parse", "HEAD"]), package: JSON.parse(readFileSync(join(realTodoRepo, "package.json"), "utf8")), entryHash: hash(join(realTodoRepo, "index.ts")), fixtureHash: hash(join(repo, "test/fixtures/real-todo-native.mjs")) });
		if (route === "safety") {
			// Failure injection stays in task-owned Git transport, never production code.
			writeFileSync(join(dir, "bin", "git"), `#!/bin/sh
printf '%s\\n' "$*" >> "$DELIVERY_GIT_CALLS"
case "$*" in
  *clone*pi-llm-as-jev*)
    case "$DELIVERY_GIT_FAILURE" in
      download) echo 'fixture: download unavailable' >&2; exit 128 ;;
      auth) echo 'fixture: authentication required' >&2; exit 128 ;;
    esac
    /usr/bin/git "$@"; code=$?
    if [ "$code" = 0 ]; then
      case "$DELIVERY_GIT_FAILURE" in
        persistence) chmod 444 "$PI_CODING_AGENT_DIR/settings.json" ;;
        invalid-settings) printf '{broken fixture settings' > "$PI_CODING_AGENT_DIR/settings.json" ;;
      esac
    fi
    exit "$code" ;;
  *) exec /usr/bin/git "$@" ;;
esac
`, { mode: 0o755 });
			buildEnv.DELIVERY_GIT_CALLS = join(dir, "build-git-calls.txt");
			const prepare = (label: string, local = false) => {
				const c = setup(label, local);
				c.env.DELIVERY_GIT_CALLS = join(c.caseDir, "git-calls.txt");
				// Native host-only control establishes this empty auth-store baseline.
				writeFileSync(join(c.env.PI_CODING_AGENT_DIR!, "auth.json"), "{}");
				writeFileSync(join(c.env.PI_CODING_AGENT_DIR!, "jev-todo-audit.json"), '{"enabled":false}');
				return c;
			};
			const observe = async (c: ReturnType<typeof setup>, r: ReturnType<typeof startRpc>, token: string) => {
				await r.request("prompt", `/delivery-state ${token}`);
				const value = await until(() => observations(c.caseDir).find((o) => o.kind === "state" && o.token === token), token);
				if (realTodoRepo) check(`${token}: actual rpiv-todo registration preserved`, value.tools?.includes("todo"));
				else check(`${token}: sibling TODO sentinel registration preserved`, value.tools?.includes("todo"));
				check(`${token}: no readiness inference`, value.calls === 0 && value.ledgerEntries === 0 && r.events.filter((e) => e.type === "agent_start").length === observations(c.caseDir).filter((o) => o.kind === "todo-business" && o.pid === r.child.pid).length);
				const commands = (await r.request("get_commands")).data?.commands ?? [];
				const eligible = token !== "suppressed" && token !== "untrusted";
				const auditExpected = eligible && token !== "provisioning-only";
				const provisioningExpected = eligible && token !== "disabled" && token !== "old-audit";
				check(`${token}: audit command follows resource/ownership, not business enablement`, commands.some((command) => command.name === "jev-audit") === auditExpected);
				check(`${token}: service-status command follows resource/ownership`, commands.some((command) => command.name === "jev-audit-service") === provisioningExpected);
				const settingsBeforeCommands = readFileSync(c.settingsFile, "utf8");
				if (auditExpected) {
					const start = r.events.length;
					await r.request("prompt", "/jev-audit");
					check(`${token}: disabled audit command dispatch reports disablement`, r.events.slice(start).some((event) => event.message?.includes("Audit is disabled by configuration")));
				}
				if (provisioningExpected) {
					const start = r.events.length;
					await r.request("prompt", "/jev-audit-service");
					const status = value.version === 1 && value.reviewVersion === 1 ? "Judgment service is available" : "Judgment service is unavailable";
					check(`${token}: read-only service command dispatch reports actual readiness`, r.events.slice(start).some((event) => event.message?.includes(status)));
				}
				await r.request("prompt", `/delivery-state ${token}-after-commands`);
				const after = await until(() => observations(c.caseDir).find((o) => o.kind === "state" && o.token === `${token}-after-commands`), `${token} command side effects`);
				check(`${token}: inspection commands create no judgment or settings side effects`, after.calls === 0 && after.ledgerEntries === 0 && r.events.filter((event) => event.type === "agent_start").length === observations(c.caseDir).filter((o) => o.kind === "todo-business" && o.pid === r.child.pid).length);
				assert.equal(readFileSync(c.settingsFile, "utf8"), settingsBeforeCommands);
				assert.equal(readFileSync(join(c.env.PI_CODING_AGENT_DIR!, "auth.json"), "utf8"), "{}");
				assert.equal(readFileSync(join(c.env.PI_CODING_AGENT_DIR!, "jev-todo-audit.json"), "utf8"), '{"enabled":false}');
				for (const file of ["models.json", "llm-as-jev.json", "trusted-projects.json"]) assert.equal(existsSync(join(c.env.PI_CODING_AGENT_DIR!, file)), false);
				return value;
			};
			for (const kind of ["disabled", "offline", "suppressed", "temporary", "untrusted", "trusted-project", "provisioning-only"]) {
				const local = kind === "untrusted" || kind === "trusted-project";
				const c = prepare(kind, local);
				if (kind === "disabled" || kind === "provisioning-only") writeFileSync(c.settingsFile, JSON.stringify({ ...c.initial, packages: [{ source: AUDIT, extensions: [kind === "disabled" ? "index.ts" : "judgment-service.ts"] }] }));
				if (kind === "offline") c.env.PI_OFFLINE = "1";
				if (kind === "suppressed") c.env.PI_JEV_TODO_AUDIT_OWNER_PID = "999999999";
				const extra = local ? [kind === "trusted-project" ? "--approve" : "--no-approve"] : [];
				if (kind === "temporary") {
					writeFileSync(c.settingsFile, JSON.stringify(c.initial));
					extra.push("-e", join(auditRepo, "judgment-service.ts"), "-e", join(auditRepo, "index.ts"));
				}
				const before = readFileSync(c.settingsFile, "utf8");
				const globalBefore = readFileSync(join(c.env.PI_CODING_AGENT_DIR!, "settings.json"), "utf8");
				const r = startRpc(c.caseDir, c.env, kind, extra);
				const value = await observe(c, r, kind);
				if (kind === "trusted-project" || kind === "provisioning-only") {
					check(`${kind}: own native provenance and readiness`, (!local || value.trusted === true) && value.marker === "S1" && value.scope === (local ? "project" : "user"));
					const previous = JSON.parse(before);
					assert.deepEqual(JSON.parse(readFileSync(c.settingsFile, "utf8")), { ...previous, packages: [...previous.packages, SERVICE] });
					if (local) assert.equal(readFileSync(join(c.env.PI_CODING_AGENT_DIR!, "settings.json"), "utf8"), globalBefore);
				} else {
					assert.equal(readFileSync(c.settingsFile, "utf8"), before);
					check(`${kind}: no service activation`, !value.version && value.commands?.length === 0);
					if (kind === "untrusted") {
						assert.equal(value.trusted, false);
						assert.equal(readFileSync(join(c.env.PI_CODING_AGENT_DIR!, "settings.json"), "utf8"), globalBefore);
					}
					if (kind === "offline") check("offline native diagnostic", r.events.some((e) => e.message?.includes("unavailable in offline mode")));
					if (kind === "temporary") check("temporary native scope diagnostic", r.events.some((e) => e.message?.includes("Cannot determine a persistent audit installation scope")));
				}
				if (kind === "offline") await todoBusiness(c, r, kind);
				await stop(r.child);
			}
			for (const kind of ["audit-first", "service-first", "pinned-filtered", "selected-missing"]) {
				const c = prepare(kind), pinned = `${SERVICE}@${s1}`;
				if (kind !== "selected-missing") run(binary, ["install", kind === "pinned-filtered" ? pinned : SERVICE], join(c.caseDir, "project"), c.env, kind + " explicit service selection");
				const packages = kind === "service-first" ? [SERVICE, AUDIT] : kind === "pinned-filtered" ? [AUDIT, { source: pinned, extensions: [] }] : [AUDIT, SERVICE];
				writeFileSync(c.settingsFile, JSON.stringify({ ...c.initial, packages }));
				const before = readFileSync(c.settingsFile, "utf8"), r = startRpc(c.caseDir, c.env, kind);
				const value = await observe(c, r, kind);
				assert.equal(readFileSync(c.settingsFile, "utf8"), before);
				check(`${kind}: no audit-owned replacement`, !r.events.some((e) => e.message?.includes("Installing the independent judgment-service")));
				if (kind === "pinned-filtered") check("pinned disabled service stays disabled", !value.version && value.commands?.length === 0);
				else check(`${kind}: native selected service owns its commands`, value.version === 1 && value.commands?.length === 2 && value.commands.every((c) => c.sourceInfo.source === SERVICE));
				await stop(r.child);
			}
			for (const failure of ["download", "auth", "persistence", "invalid-settings"]){
				const c = prepare(failure), before = readFileSync(c.settingsFile, "utf8");
				c.env.DELIVERY_GIT_FAILURE = failure;
				const r = startRpc(c.caseDir, c.env, failure);
				const value = await observe(c, r, failure);
				check(`${failure}: no half-ready service`, !value.version && value.commands?.length === 0);
				const stage = ["persistence", "invalid-settings"].includes(failure) ? "registration" : "installation";
				check(`${failure}: exact failed-stage diagnostic`, r.events.filter((e) => e.message?.includes(`Judgment-service ${stage} failed.`)).length === 1);
				const commands = (await r.request("get_commands")).data?.commands ?? [];
				check(`${failure}: main audit command remains usable`, commands.some((c) => c.name === "jev-audit"));
				await r.request("prompt", "/jev-audit");
				const shell = await r.request("bash", "printf main-agent-usable");
				assert.equal(shell.data?.exitCode, 0);
				check(`${failure}: native shell execution still works`, shell.data?.output?.includes("main-agent-usable"));
				if (stage === "registration") {
					assert.ok(value.servicePath);
					assert.equal(git(["-C", value.servicePath, "rev-parse", "HEAD"]), s1, "clone completed before failed registration");
				}
				const clones = readFileSync(c.env.DELIVERY_GIT_CALLS!, "utf8").split("\n").filter((line) => /\bclone\b/.test(line) && line.includes("pi-llm-as-jev"));
				check(`${failure}: one attempt, no alternative transport or audit-triggered retry`, clones.length === 1);
				if (failure !== "invalid-settings") assert.equal(readFileSync(c.settingsFile, "utf8"), before);
				else assert.equal(readFileSync(c.settingsFile, "utf8"), "{broken fixture settings");
				await todoBusiness(c, r, failure);
				await stop(r.child);
				// Explicitly repair this test failure, then perform a later normal load.
				delete c.env.DELIVERY_GIT_FAILURE;
				if (failure === "persistence") chmodSync(c.settingsFile, 0o644);
				writeFileSync(c.settingsFile, before);
				const repaired = startRpc(c.caseDir, c.env, failure + "-repaired");
				const ready = await observe(c, repaired, failure + "-repaired");
				check(`${failure}: later normal load recovers`, ready.version === 1 && ready.commands?.length === 2);
				assert.deepEqual(JSON.parse(readFileSync(c.settingsFile, "utf8")), { ...c.initial, packages: [AUDIT, SERVICE] });
				await stop(repaired.child);
			}
			// A project-selected service must not cause a competing global install.
			{
				const c = prepare("project-selection");
				run(binary, ["install", SERVICE, "--local", "--approve"], join(c.caseDir, "project"), c.env, "explicit project service selection");
				const projectSettings = join(c.caseDir, "project", ".pi", "settings.json");
				const before = [readFileSync(c.settingsFile, "utf8"), readFileSync(projectSettings, "utf8")];
				const r = startRpc(c.caseDir, c.env, "project-selection", ["--approve"]);
				const selected = await observe(c, r, "project-selection");
				check("existing project service wins over user audit", selected.version === 1 && selected.commands?.length === 2 && selected.commands.every((c) => c.sourceInfo.source === SERVICE && c.sourceInfo.scope === "project"));
				assert.deepEqual([readFileSync(c.settingsFile, "utf8"), readFileSync(projectSettings, "utf8")], before);
				assert.equal(selected.servicePath, undefined, "no global competing checkout");
				await stop(r.child);
			}
			// Model an older manifest without the provisioning entry, then update
			// it normally. A leftover nested copy is poison, not an activation source.
			{
				const manifestPath = join(auditRepo, "package.json"), currentManifest = readFileSync(manifestPath, "utf8");
				const legacy = JSON.parse(currentManifest); legacy.pi.extensions = ["./index.ts"];
				writeFileSync(manifestPath, JSON.stringify(legacy)); git(["-C", auditRepo, "add", "package.json"]); git(["-C", auditRepo, "commit", "-qm", "Pre-delivery manifest fixture"]);
				const c = prepare("upgrade"), r = startRpc(c.caseDir, c.env, "old-audit");
				const old = await observe(c, r, "old-audit"); assert.equal(old.version, undefined); assert.ok(old.auditPath);
				await stop(r.child);
				writeFileSync(manifestPath, currentManifest); git(["-C", auditRepo, "add", "package.json"]); git(["-C", auditRepo, "commit", "-qm", "Enable production delivery"]);
				run(binary, ["update", "--extensions"], join(c.caseDir, "project"), c.env, "upgrade pre-delivery audit");
				const nested = join(old.auditPath, "node_modules", "pi-llm-as-jev"); mkdirSync(join(nested, "src"), { recursive: true });
				writeFileSync(join(nested, "package.json"), JSON.stringify({ name: "pi-llm-as-jev", type: "module" }));
				const poison = join(nested, "src", "index.ts"); writeFileSync(poison, "throw Error('Obsolete nested service must not load');"); const poisonHash = hash(poison);
				const next = startRpc(c.caseDir, c.env, "upgraded-audit");
				const ready = await observe(c, next, "upgraded-audit");
				check("normal load after older audit upgrade provisions independent service", ready.version === 1 && ready.reviewVersion === 1);
				assert.equal(hash(poison), poisonHash); assert.equal(hash(join(old.auditPath, "judgment-service.ts")), candidate["judgment-service.ts"]);
				assert.deepEqual(JSON.parse(readFileSync(c.settingsFile, "utf8")), { ...c.initial, packages: [AUDIT, SERVICE] });
				await next.request("prompt", "/delivery-reload");
				const reloaded = await observe(c, next, "upgraded-reload");
				check("upgraded audit reload yields unique native service ownership", reloaded.commands?.length === 2 && reloaded.commands.every((c) => c.sourceInfo.source === SERVICE));
				await stop(next.child);
			}
			const serviceFile = join(serviceRepo, "service.ts"), compatible = readFileSync(serviceFile, "utf8");
			for (const kind of ["incompatible", "partial-publication"]) {
				writeFileSync(serviceFile, kind === "incompatible" ? compatible.replace("reviewVersion:1", "reviewVersion:99") : compatible.replace("pi.on('session_shutdown',", "pi.on('session_start',()=>{throw Error('fixture partial startup');});pi.on('session_shutdown',"));
				git(["-C", serviceRepo, "add", "service.ts"]); git(["-C", serviceRepo, "commit", "-qm", kind]);
				const badRevision = git(["-C", serviceRepo, "rev-parse", "HEAD"]), c = prepare(kind), r = startRpc(c.caseDir, c.env, kind);
				const failed = await observe(c, r, kind); assert.ok(failed.servicePath);
				assert.equal(git(["-C", failed.servicePath, "rev-parse", "HEAD"]), badRevision, "never downgrade latest selection");
				if (kind === "incompatible") {
					assert.equal(failed.reviewVersion, 99);
					check("incompatible latest service diagnostic", r.events.some((e) => e.message?.includes("incompatible with review version 1; no older version will be installed")));
				} else {
					assert.equal(failed.version, undefined);
					check("published handle cleaned before startup returns", observations(c.caseDir).some((o) => o.kind === "service-start") && r.events.some((e) => e.message?.includes("Judgment-service activation failed.")));
				}
				const before = readFileSync(c.settingsFile, "utf8");
				await todoBusiness(c, r, kind);
				writeFileSync(serviceFile, compatible); git(["-C", serviceRepo, "add", "service.ts"]); git(["-C", serviceRepo, "commit", "-qm", "Repair service fixture"]);
				run(binary, ["update", "--extensions"], join(c.caseDir, "project"), c.env, `${kind} native repair update`);
				await r.request("prompt", "/delivery-reload");
				const repaired = await observe(c, r, kind + "-repaired");
				check(`${kind}: native update and successful reload recover unique ownership`, repaired.reviewVersion === 1 && repaired.commands?.length === 2 && repaired.commands.every((c) => c.sourceInfo.source === SERVICE));
				assert.equal(readFileSync(c.settingsFile, "utf8"), before);
				await stop(r.child);
			}
			// A selected package whose factory fails belongs to the native loader;
			// audit must not silently replace it with another checkout.
			writeFileSync(serviceFile, "export default function(){throw Error('fixture selected-service failure');}");
			git(["-C", serviceRepo, "add", "service.ts"]); git(["-C", serviceRepo, "commit", "-qm", "Fail selected service fixture"]);
			{
				const c = prepare("selected-failing");
				run(binary, ["install", SERVICE], join(c.caseDir, "project"), c.env, "explicit failing service selection");
				const before = readFileSync(c.settingsFile, "utf8");
				const gitCallsBefore = readFileSync(c.env.DELIVERY_GIT_CALLS!, "utf8");
				const r = startRpc(c.caseDir, c.env, "selected-failing");
				// Pi's native loader exits before session_start for this selected
				// factory error (also reproduced with audit absent). Observe the
				// real failure, not a nonexistent RPC command loop.
				let closed = false; r.child.once("close", () => { closed = true; });
				await until(() => closed ? true : undefined, "native selected-service loader failure");
				check("selected failing service retains the native loader diagnostic", r.child.exitCode === 1 && readFileSync(join(c.caseDir, "selected-failing.stderr"), "utf8").includes("fixture selected-service failure"));
				assert.equal(readFileSync(c.settingsFile, "utf8"), before);
				const additionalGitCalls = readFileSync(c.env.DELIVERY_GIT_CALLS!, "utf8").slice(gitCallsBefore.length);
				check("selected failing service is not replaced or fetched", !/\b(?:clone|fetch|pull)\b/.test(additionalGitCalls) && !r.events.some((e) => e.message?.includes("Installing the independent judgment-service")));
				writeFileSync(serviceFile, compatible); git(["-C", serviceRepo, "add", "service.ts"]); git(["-C", serviceRepo, "commit", "-qm", "Repair selected service fixture"]);
				run(binary, ["update", "--extensions"], join(c.caseDir, "project"), c.env, "selected failing service native repair");
				const repaired = startRpc(c.caseDir, c.env, "selected-failing-repaired");
				const ready = await observe(c, repaired, "selected-failing-repaired");
				check("selected failing service recovers through native repair", ready.reviewVersion === 1 && ready.commands?.length === 2 && ready.commands.every((command) => command.sourceInfo.source === SERVICE));
				assert.equal(readFileSync(c.settingsFile, "utf8"), before);
				await stop(repaired.child);
			}
			check("native safety uses the unchanged production candidate", files.every((name) => hash(join(repo, name)) === candidate[name]));
			return;
		}
		// Real interactive first startup, not a later session with a preloaded service.
		if (route === "bun" && !realServiceRepo) {
			const ui = setup("tui");
			const quote = (text: string) => '"' + text.replace(/(["\\$`])/g, "\\$1") + '"';
			const tty = spawn("/usr/bin/script", ["-qec", `stty cols 200 rows 32 && exec ${[binary, ...flags].map(quote).join(" ")}`, "/dev/null"], { cwd: join(ui.caseDir, "project"), env: ui.env, stdio: ["pipe", "pipe", "pipe"], detached: true });
			children.push(tty); let screen = "";
			const capture = (data: Buffer) => { screen += data; appendFileSync(join(ui.caseDir, "tui.raw"), data); };
			tty.stdout.on("data", capture); tty.stderr.on("data", capture);
			await until(() => observations(ui.caseDir).find((o) => o.kind === "service-start" && o.marker === "S1"), "first TUI service startup");
			await until(() => screen.includes("No models available"), "interactive editor ready");
			tty.stdin.write("/llm-as");
			await until(() => screen.includes("llm-as-jev-classifier") && screen.includes("Judge backend S1"), "interactive command autocomplete");
			tty.stdin.write("\x1b"); await new Promise((r) => setTimeout(r, 120));
			tty.stdin.write("\x03"); await new Promise((r) => setTimeout(r, 120));
			tty.stdin.write("/llm-as-jev\r");
			await until(() => screen.includes("Fixture S1 status"), "interactive configuration dispatch");
			writeFileSync(join(ui.caseDir, "tui.txt"), stripVTControlCharacters(screen));
			check("production same-start TUI autocomplete and configuration dispatch", !screen.includes("No API key found"));
			tty.stdin.write("/delivery-exit\r");
			await until(() => tty.exitCode !== null || tty.signalCode, "interactive exit");
		}

		const current = setup("rpc");
		let rpc: ReturnType<typeof startRpc>;
		if (realServiceRepo) {
			const protectedFiles = ["auth.json", "models.json", "llm-as-jev.json", "trusted-projects.json"].map((name) => join(current.env.PI_CODING_AGENT_DIR!, name));
			protectedFiles.push(join(current.caseDir, "project", ".pi", "settings.json"));
			const protectedState = () => protectedFiles.map((file) => ({ file, content: existsSync(file) ? readFileSync(file, "utf8") : null }));
			// Pi itself creates an empty auth.json even with extensions disabled.
			// Establish that host-only baseline, then retain exact-byte assertions.
			const control = startRpc(current.caseDir, current.env, "host-only", ["--no-extensions"]);
			const controlCommands = (await control.request("get_commands")).data?.commands ?? [];
			check("host-only baseline loads neither audit nor service", !controlCommands.some((c) => c.name === "jev-audit" || c.name.startsWith("llm-as-jev")));
			await stop(control.child);
			assert.deepEqual(JSON.parse(readFileSync(current.settingsFile, "utf8")), { ...current.initial, packages: [AUDIT] });
			const before = protectedState();
			save("real-protected-baseline.json", before);
			rpc = startRpc(current.caseDir, current.env, "first-real");
			const diagnostic = "llm-as-jev: no usable judge backend; configure an available classifier with /llm-as-jev classifier or an LLM with /llm-as-jev llm";
			const commandResponse = await rpc.request("get_commands");
			check("real service command visible on first startup", commandResponse.data?.commands?.filter((c) => c.name === "llm-as-jev").length === 1);
			for (const [token, owner] of [["first-real", AUDIT], ["reloaded-real", SERVICE]]) {
				if (token === "reloaded-real") await rpc.request("prompt", "/delivery-reload");
				const eventOffset = rpc.events.length;
				await rpc.request("prompt", "/llm-as-jev status");
				await until(() => rpc.events.slice(eventOffset).find((e) => e.type === "extension_ui_request" && e.method === "notify" && e.message === diagnostic), `${token} actual missing-backend diagnostic`);
				check(`${token} actual missing-backend diagnostic, not dispatch-only`, true);
				await rpc.request("prompt", `/delivery-state ${token}`);
				const observed = await until(() => observations(current.caseDir).find((o) => o.kind === "state" && o.token === token), token);
				check(`${token} compatible review capability`, observed.version === 1 && observed.reviewVersion === 1 && observed.review === "function");
				check(`${token} command owner and no duplicate current service command`, observed.commands?.length === 1 && observed.commands[0].sourceInfo.source === owner);
				check(`${token} no readiness judgment receipts`, observed.ledgerEntries === 0);
				assert.equal(observed.sameAsOld, false, "reload must replace the bootstrap instance");
				assert.ok(observed.servicePath);
				assert.equal(hash(join(observed.servicePath, "src/index.ts")), hash(join(serviceRepo, "src/index.ts")));
			}
			const lifecycle = observations(current.caseDir);
			const shutdown = lifecycle.findIndex((o) => o.kind === "shutdown" && o.reason === "reload");
			check("real service supported reload returned after ordered lifecycle", shutdown >= 0 && lifecycle.findIndex((o) => o.kind === "start" && o.reason === "reload") > shutdown && lifecycle.some((o) => o.kind === "reload-returned"));
			assert.deepEqual(JSON.parse(readFileSync(current.settingsFile, "utf8")), { ...current.initial, packages: [AUDIT, SERVICE] });
			assert.deepEqual(protectedState(), before, "no auth/model/trust/service configuration migration");
			check("real service no agent model turn", !rpc.events.some((e) => ["agent_start", "message_start"].includes(e.type)));
			check("real service no provisioning failure", !rpc.events.some((e) => /Judgment-service .* failed|Installed judgment service is incompatible/.test(e.message ?? "")));
			await todoBusiness(current, rpc, "absent-backend");
			assert.deepEqual(protectedState(), before, "TODO work does not mutate auth/model/trust/service configuration");
			check("production candidate unchanged", files.every((name) => hash(join(repo, name)) === candidate[name]));
			return;
		}
		rpc = startRpc(current.caseDir, current.env, "first");
		const commands = (await rpc.request("get_commands")).data?.commands ?? [];
		check("first session exposes service commands", ["llm-as-jev", "llm-as-jev-classifier"].every((name) => commands.filter((c) => c.name === name).length === 1));
		await rpc.request("prompt", "/llm-as-jev");
		await until(() => rpc.events.find((e) => e.type === "extension_ui_request" && e.method === "notify" && e.message === "Fixture S1 status"), "same-session configuration notification");
		check("same-session configuration command really dispatched", true);
		const state = async (token: string) => {
			await rpc.request("prompt", `/delivery-state ${token}`);
			return until(() => observations(current.caseDir).find((o) => o.kind === "state" && o.token === token), token);
		};
		const first = await state("before-update");
		check("first-start capability and bootstrap ownership", first.marker === "S1" && first.review === "function" && first.calls === 0 && first.commands?.every((c) => c.sourceInfo.source === AUDIT));
		assert.ok(first.auditPath); assert.ok(first.servicePath);
		const auditPath = first.auditPath, servicePath = first.servicePath;
		const identity = () => ({ head: git(["-C", auditPath, "rev-parse", "HEAD"]), manifest: hash(join(auditPath, "package.json")), lock: hash(join(auditPath, "package-lock.json")), entry: hash(join(auditPath, "judgment-service.ts")) });
		const before = identity();
		assert.equal(before.head, auditA); assert.equal(before.entry, candidate["judgment-service.ts"]);
		assert.deepEqual(JSON.parse(readFileSync(current.settingsFile, "utf8")), { ...current.initial, packages: [AUDIT, SERVICE] });
		if (route === "npm") await stop(rpc.child); // Update with no active audit session.
		const s2 = serviceRevision("S2");
		run(binary, ["update", "--extensions"], join(current.caseDir, "project"), current.env, "native independent update");
		assert.deepEqual(identity(), before);
		assert.equal(git(["-C", servicePath, "rev-parse", "HEAD"]), s2);
		check("unqualified audit stays A while service advances S1 to S2", s1 !== s2);
		if (route === "npm") rpc = startRpc(current.caseDir, current.env, "updated-cold");
		const offset = observations(current.caseDir).length;
		await rpc.request("prompt", "/delivery-reload");
		const after = await state("after-reload");
		const lifecycle = observations(current.caseDir).slice(offset);
		const shutdown = lifecycle.findIndex((o) => o.kind === "shutdown" && o.reason === "reload");
		const startup = lifecycle.findIndex((o) => o.kind === "start" && o.reason === "reload");
		check("supported reload performs ordered shutdown and startup", shutdown >= 0 && startup > shutdown && lifecycle.some((o) => o.kind === "reload-returned"));
		check("running S2 after reload belongs to native service", after.marker === "S2" && after.review === "function" && after.calls === 0 && after.commands?.length === 2 && after.commands.every((c) => c.sourceInfo.source === SERVICE));
		await rpc.request("prompt", "/llm-as-jev");
		await until(() => rpc.events.find((e) => e.message === "Fixture S2 status"), "S2 command dispatch");
		check("no model turn during native delivery", !rpc.events.some((e) => ["agent_start", "message_start"].includes(e.type)));
		await stop(rpc.child);

		const traceFile = current.env.GIT_TRACE2_EVENT!;
		const traceOffset = existsSync(traceFile) ? readFileSync(traceFile, "utf8").length : 0;
		const npmFile = current.env.JEV_NPM_TRACE!;
		const npmBefore = existsSync(npmFile) ? readFileSync(npmFile, "utf8") : "";
		rpc = startRpc(current.caseDir, current.env, "ordinary-cold");
		const cold = await state("ordinary-cold-S2");
		check("ordinary cold start still uses S2", cold.marker === "S2");
		await stop(rpc.child);
		const starts = (existsSync(traceFile) ? readFileSync(traceFile, "utf8").slice(traceOffset) : "").split("\n").filter(Boolean).map((line) => JSON.parse(line)).filter((row) => row.event === "start");
		check("normal startup does not clone or fetch", !starts.some((row) => row.argv.some((arg: string) => ["clone", "fetch", "pull"].includes(arg))));
		assert.equal(existsSync(npmFile) ? readFileSync(npmFile, "utf8") : "", npmBefore, "normal startup performs no npm operation");
		if (route === "npm") check("native installer actually invokes npm", /\binstall\b/.test(npmBefore));
		else check("native installer uses embedded Bun", readFileSync(join(dir, "commands.log"), "utf8").includes("bun install"));
		assert.deepEqual(JSON.parse(readFileSync(current.settingsFile, "utf8")), { ...current.initial, packages: [AUDIT, SERVICE] });
		assert.deepEqual(identity(), before);
		check("production source was never replaced by a prototype", files.every((name) => hash(join(repo, name)) === candidate[name]));
		save("revisions.json", { auditSource: AUDIT, serviceSource: SERVICE, auditA, s1, s2, before, after: identity() });
	} catch (error) {
		save("failure.json", { error: String(error), stack: error instanceof Error ? error.stack : undefined });
		throw error;
	} finally {
		for (const child of children.reverse()) await stop(child);
		save("checks.json", results);
	}
}
