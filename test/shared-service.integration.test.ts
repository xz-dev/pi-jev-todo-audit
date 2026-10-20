/**
 * Offline acceptance at the real audit -> v2 service -> Pi adapter boundary.
 * Run explicitly with PI_JUDGMENT_SOURCE and PI_CLASSIFIER_SOURCE set to source roots.
 * Ordinary consumer tests do not require sibling repositories. No live transport is allowed.
 */
import { expect, test } from "bun:test";
import { AsyncLocalStorage } from "node:async_hooks";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const serviceRoot = process.env.PI_JUDGMENT_SOURCE;
const piRoot = process.env.PI_CLASSIFIER_SOURCE;
const object = (value: unknown): Record<string, unknown> =>
	value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

for (const { backend, failure, full } of [
	{ backend: "classifier", failure: "http", full: false }, { backend: "llm", failure: "http", full: false }, { backend: "classifier", failure: "missing", full: false },
	{ backend: "classifier", failure: "none", full: false }, { backend: "classifier", failure: "http", full: true },
] as const) test.skipIf(!serviceRoot || !piRoot)(`${backend}/${failure}/${full ? "full" : "ordinary"}: stateless v2 audit keeps consumer-owned progress across failure/reload`, async () => {
	const dir = await mkdtemp(join(process.platform === "win32" ? tmpdir() : "/var/tmp", "audit-shared-acceptance-"));
	const savedAgentDir = process.env.PI_CODING_AGENT_DIR;
	const savedOwner = process.env.PI_JEV_TODO_AUDIT_OWNER_PID;
	const originalFetch = globalThis.fetch;
	const key = Symbol.for("pi-llm-as-jev:service");
	const holder = globalThis as Record<symbol, unknown>;
	const originalService = holder[key];
	process.env.PI_CODING_AGENT_DIR = dir;
	process.env.PI_JEV_TODO_AUDIT_OWNER_PID = String(process.pid);
	await writeFile(join(dir, "llm-as-jev.json"), JSON.stringify({ mode: backend, classifierModel: "typesafe/jev-latest", model: "offline/claude-sonnet-4-5", thinkingLevel: backend === "llm" ? "low" : "off" }));

	let branch: unknown[] = [
		{ id: "stage-one", type: "message", message: { role: "user", content: "Investigate parser task #5. Reconcile only; no deployment without separate approval. Credential synthetic-integration-key must stay private." } },
		{ id: "board", type: "message", message: { role: "toolResult", toolName: "todo", content: [{ type: "text", text: "Task snapshot" }], details: { nextId: 6, tasks: [{ id: 5, subject: "Parser investigation", status: "in_progress", description: "Parser checks, including malformed input; rollout is not authorized." }] } } },
		{ id: "stage-two", type: "message", message: { role: "assistant", content: "The agreed parser checks were reported passed; rollout still awaits approval." } },
		{ id: "stage-three", type: "message", message: { role: "user", content: "An additional malformed-input case remains unresolved. Do not claim completion or continue execution until the required input arrives." } },
	];
	// Whole-segment records carry their ids in the packed state; no `evidence` field exists in v2.
	const attempts: { ids: string[]; status: number }[] = [];
	const directRequests: string[] = [];
	const judgeResults: Record<string, unknown>[] = [];
	let failThird = failure !== "none";
	let workEvidenceChoice = "stage-one";
	let selectedCalls = 0;
	let serial = 0;
	const wireBodies: Record<string, unknown>[] = [];
	const model = backend === "classifier" ? { type: "classifier", id: "jev-latest", name: "Jev fixture", provider: "typesafe", api: "typesafe-system-one", baseUrl: "https://fixture.invalid/v1/", input: ["text"], contextWindow: 64000, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }
		: { id: "claude-sonnet-4-5", name: "LLM fixture", provider: "offline", api: "anthropic-messages", baseUrl: "https://fixture.invalid", reasoning: true, input: ["text"], maxTokens: 8192, contextWindow: 200000, cost: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 } };
	const localFetch = async (url: unknown, init?: RequestInit): Promise<Response> => {
		if (!String(url).startsWith("https://fixture.invalid/")) throw new Error("live transport forbidden");
		const headers = new Headers(init?.headers);
		expect(headers.get(backend === "classifier" ? "authorization" : "x-api-key")).toBe(backend === "classifier" ? "Bearer synthetic-integration-key" : "synthetic-integration-key");
		expect(String(init?.body)).not.toContain("synthetic-integration-key");
		const wire = object(JSON.parse(String(init?.body))); wireBodies.push(wire);
		const messages = wire.messages as { content: { text: string }[] }[] | undefined;
		const payload = backend === "llm" ? JSON.parse(messages![0].content[0].text) : undefined;
		const body = payload ? { state: payload.state, questions: { [payload.questionId]: payload.question } } : wire;
		const audit = String(object(body.state).audit ?? JSON.stringify(body.state));
		const ids = ["stage-one", "board", "stage-two", "stage-three"].filter((id) => audit.includes(`"id":"${id}"`));
		// Failure policy follows the segment: a segment containing stage-three
		// fails while failThird is set; earlier segments always succeed.
		const fails = failThird && ids.includes("stage-three");
		const status = fails && failure === "http" ? 400 : 200;
		attempts.push({ ids, status });
		if (fails && failure === "http") return Response.json({ error: { code: "invalid_payload" }, usage: { input_tokens: 7 } }, { status });
		// Source-scoped answers must name a record actually inside THIS segment.
		const pickSource = (q: Record<string, unknown>, prefer: string[] = []) => {
			const c = Object.keys(object(q.criteria));
			return prefer.find((p) => c.includes(p)) ?? c.find((k) => !["keep_prior", "none_in_segment", "insufficient_evidence"].includes(k)) ?? c[0];
		};
		const fixed: Record<string, string> = {
			probe: "ok", drift: "on_track", interaction: "now_waiting_user",
			task_status_5: audit.includes("An additional malformed-input case remains unresolved") ? "blocked_now" : "completion_reported",
			task_granularity_5: "appropriate_now", task_board_5: "accurate",
			current_work: "same_work", scope_update: "no_scope_change", scope_evidence: "keep_prior",
		};
		const sourcePrefer: Record<string, string[]> = {
			work_evidence: [workEvidenceChoice, "stage-one"], current_work_evidence: [workEvidenceChoice, "stage-one"],
			task_evidence_5: ["stage-one", "stage-two"], task_granularity_evidence_5: ["stage-two", "stage-one"],
		};
		const answers = Object.fromEntries(Object.entries(object(body.questions)).filter(([id]) => !(fails && failure === "missing" && id === "task_granularity_5")).map(([id, value]) => {
			const q = object(value);
			const labels = Object.keys(object(q.criteria));
			const choice = sourcePrefer[id] ? pickSource(q, sourcePrefer[id]) : fixed[id];
			expect(labels, `unscripted choice ${id}`).toContain(choice);
			return [id, { type: "choice", choice, confidence: 0.95, probabilities: Object.fromEntries(labels.map((label) => [label, label === choice ? 1 : 0])) }];
		}));
		if (backend === "llm") {
			const events = [
				{ type: "message_start", message: { id: "fixture", type: "message", role: "assistant", model: model.id, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10 } } },
				{ type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "tool", name: "answer", input: {} } },
				{ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify({ choice: answers[payload.questionId].choice }) } },
				{ type: "content_block_stop", index: 0 },
				{ type: "message_delta", delta: { stop_reason: "tool_use", stop_sequence: null }, usage: { output_tokens: 2 } },
				{ type: "message_stop" },
			];
			return new Response(events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "content-type": "text/event-stream" } });
		}
		return Response.json({ model: "jev-latest", answers, usage: { input_tokens: 10, ...(failure === "none" ? {} : { output_tokens: 2 }) } });
	};
	const providerRequest = new AsyncLocalStorage<boolean>();
	globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
		if (providerRequest.getStore()) return localFetch(url, init);
		directRequests.push(String(url));
		throw new Error("Offline acceptance forbids consumer-owned HTTP; use the shared Pi registry");
	}) as unknown as typeof fetch;

	try {
		const { createModels, createProvider } = await import(pathToFileURL(join(piRoot!, "packages/ai/src/models.ts")).href);
		const { anthropicMessagesApi } = await import(pathToFileURL(join(piRoot!, "packages/ai/src/api/anthropic-messages.lazy.ts")).href);
		const models = createModels();
		if (backend === "llm") models.setProvider(createProvider({ id: "offline", models: [model], auth: { apiKey: { name: "Offline", resolve: async () => ({ auth: { apiKey: "synthetic-integration-key" } }) } }, api: anthropicMessagesApi() }));
		const { classify } = await import(pathToFileURL(join(piRoot!, "packages/ai/src/api/typesafe-system-one.ts")).href);
		const { default: serviceExtension } = await import(pathToFileURL(join(serviceRoot!, "src/index.ts")).href);
		const { default: auditExtension } = await import("../index.ts");
		const { DEFAULT_CONFIG } = await import("../config.ts");
		const registry = {
			getAll: () => [model], getAvailable: () => [], find: (provider: string, id: string) => backend === "llm" ? models.getModel(provider, id) : undefined,
			getAvailableOfType: async () => backend === "classifier" ? [model] : [], getRegisteredProviderIds: () => [model.provider],
			getProviderAuth: async () => ({ auth: { apiKey: "synthetic-integration-key" }, source: "fixture" }),
			getAuth: models.getAuth ? models.getAuth.bind(models) : async () => ({ auth: { apiKey: "synthetic-integration-key" } }),
			classify: async (_selected: unknown, context: unknown, options: Record<string, unknown> = {}) => {
				selectedCalls++;
				return providerRequest.run(true, () => classify(model, context, { ...options, apiKey: "synthetic-integration-key", fetch: options.fetch ?? globalThis.fetch }));
			},
			streamSimple: (...args: unknown[]) => {
				if (backend !== "llm") throw new Error("Native acceptance must not substitute LLM");
				selectedCalls++;
				return providerRequest.run(true, () => models.streamSimple(...args));
			},
		};
		function host(config = {}) {
			const handlers = new Map<string, ((event: unknown, ctx: unknown) => unknown)[]>();
			const commands = new Map<string, { handler: (args: string, ctx: unknown) => Promise<void> }>();
			const sent: { content?: string }[] = [];
			const notices: string[] = [];
			const api = {
				on: (name: string, handler: (event: unknown, ctx: unknown) => unknown) => handlers.set(name, [...(handlers.get(name) ?? []), handler]),
				registerCommand: (name: string, command: { handler: (args: string, ctx: unknown) => Promise<void> }) => commands.set(name, command),
				registerProvider: () => {}, unregisterProvider: () => {},
				sendMessage: (message: { content?: string }) => sent.push(message),
				appendEntry: (customType: string, data: unknown) => {
					branch.push({ id: `ledger-${++serial}`, type: "custom", customType, data });
				},
				events: { on: () => () => {} },
			};
			const ctx = { cwd: dir, isProjectTrusted: () => false, modelRegistry: registry, mode: "rpc", hasUI: false,
				sessionManager: { getSessionId: () => "offline-shared-acceptance", getBranch: () => branch, buildContextEntries: () => branch },
				ui: { notify: (message: string) => notices.push(message) } };
			auditExtension(api as never, { ...DEFAULT_CONFIG, apiKey: "synthetic-ignored-legacy-key", ...config });
			serviceExtension(api as never);
			return { sent, notices, async fire(name: string) { for (const handler of handlers.get(name) ?? []) await handler({}, ctx); },
				manual: (mode = "") => commands.get("jev-audit")!.handler(mode, ctx) };
		}
		const first = host();
		await first.fire("session_start");
		const service = object(holder[key]);
		expect(service.version).toBe(2);
		expect(typeof service.judge).toBe("function");
		expect(typeof service.review).toBe("undefined");
		// Positive wiring control: actual registration reaches Pi's public adapter offline.
		const probe = await (service.judge as (request: unknown) => Promise<Record<string, unknown>>)({ state: {}, questions: { probe: { type: "choice", instructions: "Pick", criteria: { ok: "OK" } } } });
		expect(probe.stopReason).toBe("stop");
		expect(selectedCalls).toBe(1);
		attempts.length = 0; selectedCalls = 0; wireBodies.length = 0;
		const originalJudge = (service as { judge: (...args: unknown[]) => Promise<Record<string, unknown>> }).judge;
		(service as { judge: (...args: unknown[]) => Promise<Record<string, unknown>> }).judge = async (...args: unknown[]) => {
			const result = await originalJudge.apply(service, args); judgeResults.push(result); return result;
		};
		await first.manual(full ? "full" : "");
		expect(directRequests, "audit must never revive its direct HTTP client").toHaveLength(0);
		expect(selectedCalls).toBeGreaterThan(0);
		// One stateless call per segment: all records live in packed state.
		if (failure === "http") {
			// Segments are atomic: the segment containing stage-three fails whole.
			expect(attempts.some((a) => a.status === 400 && a.ids.includes("stage-three"))).toBe(true);
		} else {
			expect(attempts.some((a) => a.status === 200 && a.ids.includes("stage-one"))).toBe(true);
			expect(attempts.some((a) => a.status === 200 && a.ids.includes("stage-two"))).toBe(true);
			expect(attempts.some((a) => a.status === 200 && a.ids.includes("stage-three"))).toBe(true);
		}
		const stateRows = () => branch.map(object).filter((row) => row.customType === "jev-todo-audit-state").map((row) => object(row.data));
		if (failure !== "none") {
			// A failed segment cannot publish early completion advice.
			expect(first.sent, "incomplete judgment cannot publish early completion advice").toHaveLength(0);
		} else {
			expect(judgeResults[0].stopReason).toBe("stop");
			const diag = object(object(branch.map(object).filter((row) => object(row.data).kind === "diag").at(-1)!.data).diag);
			expect(diag.outcome).toBe("completed");
			expect(first.notices.some((notice) => notice.includes("failed:"))).toBe(false);
		}
		const beforeReload = attempts.length;
		if (!full) await first.fire("session_shutdown");
		failThird = false;
		const resumed = full ? first : host({ apiUrl: "https://ignored-change.invalid", model: "obsolete/new", apiKey: "different-ignored-legacy-key" });
		if (!full) {
			await resumed.fire("session_start");
			// The second host republished its own service instance; wrap it too.
			const resumedService = object(holder[key]);
			const resumedJudge = (resumedService as { judge: (...args: unknown[]) => Promise<Record<string, unknown>> }).judge;
			(resumedService as { judge: (...args: unknown[]) => Promise<Record<string, unknown>> }).judge = async (...args: unknown[]) => {
				const result = await resumedJudge.apply(resumedService, args); judgeResults.push(result); return result;
			};
		}
		await resumed.manual(full ? "full" : "");
		const resumedAttempts = attempts.slice(beforeReload);
		if (failure === "none") expect(resumedAttempts).toHaveLength(0); else expect(resumedAttempts.length).toBeGreaterThan(0);
		if (failure === "none") {
			// Consumer-owned cursors: durable earlier segments are not resent as new history.
			expect(resumedAttempts.every((a) => !a.ids.includes("stage-one") && !a.ids.includes("stage-two")), "durable earlier loops must not be sent again").toBe(true);
		} else {
			// Stateless retry: the uncommitted segment is re-judged whole (stage ids resent)
			// because no accepted judgment moved the cursor. This is not service memory.
			expect(resumedAttempts.some((a) => a.status === 200 && a.ids.includes("stage-three"))).toBe(true);
		}
		if (failure === "missing") {
			// The incomplete scope was held open; its next segment retries from the open loop.
			const last = stateRows().at(-1)!;
			expect(resumedAttempts.some((a) => a.ids.includes("stage-three"))).toBe(true);
		}
		expect(resumed.sent.every((m) => !/complete #5|continue.*#5/i.test(m.content ?? ""))).toBe(true);
		const beforeCache = attempts.length;
		await resumed.manual();
		expect(attempts).toHaveLength(beforeCache); // covered segments need no new inference
		// Original I1 guarantees at the actual paid-work seam, not in a caching test double.
		const originalBoard = object(branch.find((entry) => object(entry).id === "board"));
		branch.push({ ...structuredClone(originalBoard), id: "no-op-board-read" });
		await resumed.manual(); expect(attempts).toHaveLength(beforeCache);
		// Mutating an already-judged record does not move consumer cursors back: the
		// stateless service has no cache to invalidate and audit's committed judgment
		// for that range stays. New evidence must arrive as new records.
		const report = object(object(branch.find((entry) => object(entry).id === "stage-two")).message);
		report.content = "NEW_SAME_ID_FACT: parser check revised; malformed case and approval still unresolved.";
		await resumed.manual();
		expect(attempts).toHaveLength(beforeCache);
		const afterFactChange = attempts.length;
		await resumed.manual(); expect(attempts).toHaveLength(afterFactChange);
		const activeBoard = object(branch.find((entry) => object(entry).id === "no-op-board-read"));
		const task = (object(activeBoard.message).details as { tasks: { description: string }[] }).tasks[0];
		task.description = "NEW_TASK_FACT: additional parser acceptance requirement; no rollout.";
		await resumed.manual();
		expect(judgeResults.at(-1)?.stopReason).toBe("stop");
		expect(attempts.length).toBeGreaterThan(afterFactChange);
		expect(wireBodies.slice(afterFactChange).some((body) => JSON.stringify(body).includes("NEW_TASK_FACT"))).toBe(true);
		let afterTaskChange = attempts.length;
		await resumed.manual(); expect(attempts).toHaveLength(afterTaskChange);
		if (failure === "none") {
			// Task-contract changes (description/metadata are in the task scope hash)
			// reset that task's stored state, so each metadata change re-judges.
			for (const mutate of [
				() => { object(task).metadata = { auditBrief: { text: "Parser work is reported, not independently verified.", sources: ["stage-two"], covers: [] } }; },
				() => { object(object(object(task).metadata).auditBrief).sources = ["stage-one", "stage-two"]; },
				() => { object(object(object(task).metadata).auditBrief).covers = ["stage-two"]; },
			]) {
				mutate(); const before = attempts.length;
				await resumed.manual(); expect(judgeResults.at(-1)?.stopReason).toBe("stop"); expect(attempts.length).toBeGreaterThan(before);
				const paid = attempts.length; await resumed.manual(); expect(attempts).toHaveLength(paid);
			}
			// Mutating a judged record re-segments the branch: audit re-collects honestly
			// rather than freezing stale facts; the mutated content reaches the next wire.
			report.role = "user";
			await resumed.manual();
			if (attempts.length > afterTaskChange) expect(wireBodies.slice(afterTaskChange).some((body) => JSON.stringify(body).includes("NEW_SAME_ID_FACT"))).toBe(true);
			afterTaskChange = attempts.length;
			// A NEW public record re-arms judgment: its id must reach the wire as a
			// segment source candidate for the task's evidence question.
			branch.push({ id: "new-evidence", type: "message", message: { role: "assistant", content: "New supplementary parser result available." } });
			const beforeCandidates = attempts.length;
			await resumed.manual(); expect(judgeResults.at(-1)?.stopReason).toBe("stop"); expect(attempts.length).toBeGreaterThan(beforeCandidates);
			expect(wireBodies.slice(beforeCandidates).some(body => Object.hasOwn(object(object(object(body.questions).task_evidence_5).criteria), "new-evidence"))).toBe(true);
			afterTaskChange = attempts.length;
			await resumed.manual(); expect(attempts).toHaveLength(afterTaskChange);
		}
		const archivedLedger: unknown[] = [];
		if (full) {
			// A successful full audit becomes the ordinary baseline; another full
			// invocation is new work, not a retry of completed state.
			const beforeNewFull = attempts.length;
			await resumed.manual("full");
			expect(judgeResults.at(-1)?.stopReason).toBe("stop");
			expect(attempts.length).toBeGreaterThan(beforeNewFull);
			expect(attempts.slice(beforeNewFull).some((attempt) => attempt.ids.includes("stage-one"))).toBe(true);
			const afterNewFull = attempts.length;
			await resumed.manual(); expect(attempts).toHaveLength(afterNewFull);
		}
		if (failure === "none") {
			// R08/R11: lifecycle refresh/advice alone are not facts; a reply is.
			await resumed.fire("session_compact"); await resumed.manual(); expect(attempts).toHaveLength(afterTaskChange);
			branch.push({ id: "advice", type: "custom_message", customType: "jev-todo-audit", display: true, content: "[jev audit] split #5?" });
			await resumed.manual(); expect(attempts).toHaveLength(afterTaskChange);
			branch.push({ id: "rebuttal", type: "message", message: { role: "assistant", content: "REBUTTAL: #5 is one coherent comparison; no split." } });
			await resumed.manual(); expect(attempts.length).toBeGreaterThan(afterTaskChange);
			const changedWire = wireBodies.slice(afterTaskChange);
			expect(changedWire.some((body) => JSON.stringify(body).includes("REBUTTAL"))).toBe(true);
			expect(changedWire.some((body) => JSON.stringify(body).includes("split #5?"))).toBe(true);
			const afterRebuttal = attempts.length;
			await resumed.manual(); expect(attempts).toHaveLength(afterRebuttal);
			// R09: identical public facts on a branch without audit state are judged
			// fresh — there is no service cache to consult, so the call is new inference.
			archivedLedger.push(...branch.map(object).filter((row) => row.type === "custom"));
			await resumed.fire("session_shutdown");
			branch = structuredClone(branch.map(object).filter((row) => row.type !== "custom"));
			const active = host(); await active.fire("session_tree"); await active.manual();
			expect(attempts.length).toBeGreaterThan(afterRebuttal);
			await active.fire("session_shutdown");
		}
		const allLedger = [...archivedLedger, ...branch.map(object).filter((row) => row.type === "custom")];
		const businessDiags = allLedger.map(object).filter((row) => row.customType === "jev-todo-audit-ledger" && object(row.data).kind === "diag").map((row) => object(object(row.data).diag));
		expect(allLedger.some((row) => object(object(row).data).kind === "eval")).toBe(false);
		expect(JSON.stringify(allLedger)).not.toContain("synthetic-integration-key");
		expect(JSON.stringify(allLedger)).not.toContain("An additional malformed-input case remains unresolved");
		for (const diag of businessDiags) {
			// Segment-scoped observations only; no attempt framing or invented usage.
			expect(Array.isArray(diag.segments)).toBe(true);
			expect(diag.attempts).toBeUndefined(); expect(diag.usage).toBeUndefined();
			expect(diag.hits).toBeUndefined(); expect(diag.misses).toBeUndefined();
		}
		if (backend === "llm") {
			expect(wireBodies.every((body) => body.model === model.id && object(body.thinking).type === "enabled")).toBe(true);
			expect(judgeResults.every((result) => result.backend === "llm")).toBe(true);
		}
		expect(judgeResults.length).toBeGreaterThan(0);
		if (failure !== "none") expect(judgeResults[0].answers ?? {}).toBeDefined();
		expect(judgeResults.at(-1)?.stopReason).toBe("stop");
		await writeFile(join(dir, "evidence.json"), JSON.stringify({ backend, failure, full, wireBodies, attempts, judgeResults, ledger: allLedger, notices: [...first.notices, ...resumed.notices] }, null, 2));
		await resumed.fire("session_shutdown");
	} finally {
		globalThis.fetch = originalFetch;
		if (originalService === undefined) delete holder[key]; else holder[key] = originalService;
		if (savedAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = savedAgentDir;
		if (savedOwner === undefined) delete process.env.PI_JEV_TODO_AUDIT_OWNER_PID; else process.env.PI_JEV_TODO_AUDIT_OWNER_PID = savedOwner;
	}
}, 15000);
