/**
 * Offline acceptance at the real audit -> service -> Pi adapter boundary.
 * Run explicitly with PI_JUDGMENT_SOURCE and PI_CLASSIFIER_SOURCE set to source roots.
 * Ordinary consumer tests do not require sibling repositories. No live transport is allowed.
 */
import { expect, test } from "bun:test";
import { AsyncLocalStorage } from "node:async_hooks";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const serviceRoot = process.env.PI_JUDGMENT_SOURCE;
const piRoot = process.env.PI_CLASSIFIER_SOURCE;
const object = (value: unknown): Record<string, unknown> =>
	value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

for (const { backend, failure, full } of [
	{ backend: "classifier", failure: "http", full: false }, { backend: "llm", failure: "http", full: false }, { backend: "classifier", failure: "missing", full: false },
	{ backend: "classifier", failure: "none", full: false }, { backend: "classifier", failure: "http", full: true },
] as const) test.skipIf(!serviceRoot || !piRoot)(`${backend}/${failure}/${full ? "full" : "ordinary"}: shared audit retains completed stages after failure/reload without charging reuse`, async () => {
	const dir = await mkdtemp("/var/tmp/audit-shared-acceptance-");
	const savedAgentDir = process.env.PI_CODING_AGENT_DIR;
	const savedOwner = process.env.PI_JEV_TODO_AUDIT_OWNER_PID;
	const originalFetch = globalThis.fetch;
	const key = Symbol.for("pi-llm-as-jev:service");
	const holder = globalThis as Record<symbol, unknown>;
	const originalService = holder[key];
	process.env.PI_CODING_AGENT_DIR = dir;
	process.env.PI_JEV_TODO_AUDIT_OWNER_PID = String(process.pid);
	await writeFile(join(dir, "llm-as-jev.json"), JSON.stringify({ mode: backend, classifierModel: "typesafe/jev-latest", model: "offline/claude-sonnet-4-5", thinkingLevel: backend === "llm" ? "low" : "off", timeoutMs: 5000 }));

	let branch: unknown[] = [
		{ id: "stage-one", type: "message", message: { role: "user", content: "Investigate parser task #5. Reconcile only; no deployment without separate approval. Credential synthetic-integration-key must stay private." } },
		{ id: "board", type: "message", message: { role: "toolResult", toolName: "todo", content: [{ type: "text", text: "Task snapshot" }], details: { nextId: 6, tasks: [{ id: 5, subject: "Parser investigation", status: "in_progress", description: "Parser checks, including malformed input; rollout is not authorized." }] } } },
		{ id: "stage-two", type: "message", message: { role: "assistant", content: "The agreed parser checks were reported passed; rollout still awaits approval." } },
		{ id: "stage-three", type: "message", message: { role: "user", content: "An additional malformed-input case remains unresolved. Do not claim completion or continue execution until the required input arrives." } },
	];
	const observations: unknown[] = [];
	const attempts: { evidence: string[]; status: number }[] = [];
	const directRequests: string[] = [];
	const reviewResults: Record<string, unknown>[] = [];
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
		const state = object(body.state);
		const evidence = Array.isArray(state.evidence) ? state.evidence.map((entry) => String(object(entry).id)) : [];
		const overflow = evidence.length > 1;
		const fails = failThird && evidence.some((id) => id === "stage-three");
		const status = overflow || (fails && failure === "http") ? 400 : 200;
		attempts.push({ evidence, status });
		if (overflow) return Response.json(backend === "classifier" ? { detail: { error_type: "max_tokens_exceeded" }, usage: { input_tokens: 17 } } : { error: { type: "invalid_request_error", message: "prompt is too long: 213462 tokens > 200000 maximum" }, usage: { input_tokens: 17 } }, { status });
		if (fails && failure === "http") return Response.json({ error: { code: "invalid_payload" }, usage: { input_tokens: 7 } }, { status });
		const choices: Record<string, string> = {
			probe: "ok",
			alignment: "aligned", current_match: "5", drift: "on_track", interaction: "waiting_user",
			task_status_5: JSON.stringify(state).includes("An additional malformed-input case remains unresolved") ? "blocked" : "actually_completed",
			task_granularity_5: "appropriate", task_board_5: "accurate", work_evidence: workEvidenceChoice, task_evidence_5: "stage-one",
		};
		const answers = Object.fromEntries(Object.entries(object(body.questions)).filter(([id]) => !(fails && failure === "missing" && id === "task_granularity_5")).map(([id, value]) => {
			const q = object(value);
			const labels = Object.keys(object(q.criteria));
			expect(labels).toContain(choices[id]);
			const choice = choices[id];
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
			classify: async (_selected: unknown, context: unknown, options: Record<string, unknown> = {}) => {
				selectedCalls++;
				if ("observe" in options || "onAttempt" in options) throw new Error("Private Pi observation options are forbidden");
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
					if (object(data).kind === "review-attempt") observations.push(structuredClone(object(data).attempt));
					branch.push({ id: `ledger-${++serial}`, type: "custom", customType, data });
				},
				events: { on: () => () => {} },
			};
			const ctx = { cwd: dir, isProjectTrusted: () => false, modelRegistry: registry, mode: "rpc", hasUI: false,
				sessionManager: { getSessionId: () => "offline-shared-acceptance", getBranch: () => branch, buildContextEntries: () => branch },
				ui: { notify: (message: string) => notices.push(message) } };
			auditExtension(api as never, { ...DEFAULT_CONFIG, apiKey: "synthetic-ignored-legacy-key", timeoutMs: 5000, ...config });
			serviceExtension(api as never);
			return { sent, notices, async fire(name: string) { for (const handler of handlers.get(name) ?? []) await handler({}, ctx); },
				manual: (mode = "") => commands.get("jev-audit")!.handler(mode, ctx) };
		}
		const first = host();
		await first.fire("session_start");
		const service = object(holder[key]);
		expect(typeof service.judge).toBe("function");
		// Positive wiring control: actual registration reaches Pi's public adapter offline.
		const probe = await (service.judge as (request: unknown) => Promise<Record<string, unknown>>)({ state: {}, questions: { probe: { type: "choice", instructions: "Pick", criteria: { ok: "OK" } } } });
		expect(probe.stopReason).toBe("stop");
		expect(selectedCalls).toBe(1);
		attempts.length = 0; observations.length = 0; selectedCalls = 0; wireBodies.length = 0;
		function captureReview() {
			const current = object(holder[key]);
			if (typeof current.review !== "function") return;
			const review = current.review as (...args: unknown[]) => Promise<Record<string, unknown>>;
			current.review = async (...args: unknown[]) => { const result = await review.apply(current, args); reviewResults.push(result); return result; };
		}
		captureReview();
		await first.manual(full ? "full" : "");
		// The initial baseline fails here for the intended missing consumer integration, not import/setup.
		expect(directRequests, "audit must never revive its direct HTTP client").toHaveLength(0);
		expect(selectedCalls).toBeGreaterThan(0);
		expect(attempts.some((a) => a.status === 200 && a.evidence.includes("stage-one"))).toBe(true);
		expect(attempts.some((a) => a.status === 200 && a.evidence.includes("stage-two"))).toBe(true);
		expect(attempts.some((a) => a.status === (failure === "http" ? 400 : 200) && a.evidence.includes("stage-three"))).toBe(true);
		if (failure === "missing") {
			expect(reviewResults[0].unresolved).toContain("task_granularity_5");
			const receipts = branch.map(object).filter((row) => object(row.data).kind === "receipt");
			expect(object(object(receipts.at(-1)!.data).receipt).through).toBe("stage-two");
		}
		if (failure !== "none") expect(first.sent, "incomplete review cannot publish early completion advice").toHaveLength(0);
		else {
			expect(reviewResults[0].stopReason).toBe("stop");
			const diag = object(object(branch.map(object).filter((row) => object(row.data).kind === "diag").at(-1)!.data).diag);
			expect(diag.outcome).toBe("recovered");
			expect(first.notices.some((notice) => notice.includes("recovered by subdivision"))).toBe(true);
			expect(first.notices.some((notice) => notice.includes("failed:"))).toBe(false);
		}
		const beforeReload = attempts.length;
		if (!full) await first.fire("session_shutdown");
		failThird = false;
		const resumed = full ? first : host({ apiUrl: "https://ignored-change.invalid", model: "obsolete/new", apiKey: "different-ignored-legacy-key" });
		if (!full) { await resumed.fire("session_start"); captureReview(); }
		await resumed.manual(full ? "full" : "");
		const resumedAttempts = attempts.slice(beforeReload);
		if (failure === "none") expect(resumedAttempts).toHaveLength(0); else expect(resumedAttempts.length).toBeGreaterThan(0);
		expect(resumedAttempts.every((a) => !a.evidence.includes("stage-one") && !a.evidence.includes("board") && !a.evidence.includes("stage-two")), "durable earlier stages must not be sent again").toBe(true);
		if (failure !== "none") expect(resumedAttempts.some((a) => a.evidence.includes("stage-three") && a.status === 200)).toBe(true);
		if (failure === "missing") {
			expect(resumedAttempts).toHaveLength(1);
			expect(Object.keys(object(wireBodies[beforeReload].questions))).toEqual(["task_granularity_5"]);
		}
		expect(resumed.sent.every((m) => !/complete #5|continue.*#5/i.test(m.content ?? ""))).toBe(true);
		const beforeCache = attempts.length;
		await resumed.manual();
		expect(attempts).toHaveLength(beforeCache);
		// Original I1 guarantees at the actual paid-work seam, not in a caching test double.
		const originalBoard = object(branch.find((entry) => object(entry).id === "board"));
		branch.push({ ...structuredClone(originalBoard), id: "no-op-board-read" });
		await resumed.manual(); expect(attempts).toHaveLength(beforeCache);
		const report = object(object(branch.find((entry) => object(entry).id === "stage-two")).message);
		report.content = "NEW_SAME_ID_FACT: parser check revised; malformed case and approval still unresolved.";
		const beforeFactChange = attempts.length;
		await resumed.manual();
		expect(reviewResults.at(-1)?.stopReason).toBe("stop");
		expect(attempts.length).toBeGreaterThan(beforeFactChange);
		expect(wireBodies.slice(beforeFactChange).some((body) => JSON.stringify(body).includes("NEW_SAME_ID_FACT"))).toBe(true);
		const afterFactChange = attempts.length;
		await resumed.manual(); expect(attempts).toHaveLength(afterFactChange);
		const activeBoard = object(branch.find((entry) => object(entry).id === "no-op-board-read"));
		const task = (object(activeBoard.message).details as { tasks: { description: string }[] }).tasks[0];
		task.description = "NEW_TASK_FACT: additional parser acceptance requirement; no rollout.";
		await resumed.manual();
		expect(reviewResults.at(-1)?.stopReason).toBe("stop");
		expect(attempts.length).toBeGreaterThan(afterFactChange);
		expect(wireBodies.slice(afterFactChange).some((body) => JSON.stringify(body).includes("NEW_TASK_FACT"))).toBe(true);
		let afterTaskChange = attempts.length;
		await resumed.manual(); expect(attempts).toHaveLength(afterTaskChange);
		if (failure === "none") {
			// Exact paid-work counterparts of the unchanged port I1 source/coverage/role cases.
			for (const mutate of [
				() => { object(task).metadata = { auditBrief: { text: "Parser work is reported, not independently verified.", sources: ["stage-two"], covers: [] } }; },
				() => { object(object(object(task).metadata).auditBrief).sources = ["stage-one", "stage-two"]; },
				() => { object(object(object(task).metadata).auditBrief).covers = ["stage-two"]; },
				() => { report.role = "user"; },
			]) {
				mutate(); const before = attempts.length;
				await resumed.manual(); expect(reviewResults.at(-1)?.stopReason).toBe("stop"); expect(attempts.length).toBeGreaterThan(before);
				const paid = attempts.length; await resumed.manual(); expect(attempts).toHaveLength(paid);
			}
			// Work evidence may select another task's supplement. The next review's
			// task-local candidates must reflect that new opinion, not a frozen seed.
			(object(object(activeBoard.message).details).tasks as unknown[]).push({ id: 7, subject: "Independent completed work", status: "completed" });
			workEvidenceChoice = "task:7";
			await resumed.manual(); expect(reviewResults.at(-1)?.stopReason).toBe("stop");
			const beforeCandidates = attempts.length;
			await resumed.manual(); expect(reviewResults.at(-1)?.stopReason).toBe("stop"); expect(attempts.length).toBeGreaterThan(beforeCandidates);
			expect(wireBodies.slice(beforeCandidates).some(body => Object.hasOwn(object(object(object(body.questions).task_evidence_5).criteria), "task:7"))).toBe(true);
			afterTaskChange = attempts.length;
			await resumed.manual(); expect(attempts).toHaveLength(afterTaskChange);
		}
		const archivedLedger: unknown[] = [];
		if (full) {
			// A successful full review becomes the ordinary baseline; another full
			// invocation is new work, not a retry using the completed token.
			const beforeNewFull = attempts.length;
			await resumed.manual("full");
			expect(reviewResults.at(-1)?.stopReason).toBe("stop");
			expect(attempts.length).toBeGreaterThan(beforeNewFull);
			expect(attempts.slice(beforeNewFull).some((attempt) => attempt.evidence.includes("stage-one"))).toBe(true);
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
			// R09: identical public facts on a branch without the judgments are not cache hits.
			archivedLedger.push(...branch.map(object).filter((row) => row.type === "custom"));
			await resumed.fire("session_shutdown");
			branch = structuredClone(branch.map(object).filter((row) => row.type !== "custom"));
			const active = host(); await active.fire("session_tree"); captureReview(); await active.manual();
			expect(attempts.length).toBeGreaterThan(afterRebuttal);
			await active.fire("session_shutdown");
		}
		const allLedger = [...archivedLedger, ...branch.map(object).filter((row) => row.type === "custom")];
		const businessDiags = allLedger.map(object).filter((row) => row.customType === "jev-todo-audit-ledger" && object(row.data).kind === "diag").map((row) => object(object(row.data).diag));
		expect(allLedger.some((row) => object(object(row).data).kind === "eval")).toBe(false);
		expect(JSON.stringify(allLedger)).not.toContain("synthetic-integration-key");
		expect(JSON.stringify(allLedger)).not.toContain("An additional malformed-input case remains unresolved");
		expect(businessDiags.flatMap((diag) => diag.attempts as unknown[])).toHaveLength(attempts.length);
		for (const diag of businessDiags) {
			const usage = object(diag.usage), actual = object(object(diag.service).usage);
			expect(diag.channel).toBe(object(diag.service).channel);
			expect(diag.presplits).toBe(object(diag.service).presplits);
			expect(usage.inputTokens).toBe(object(actual.inputTokens).knownSum);
			expect(usage.outputTokens).toBe(object(actual.outputTokens).knownSum);
			expect(object(actual.outputTokens).missing).toBe(object(usage.unreported).outputTokens ?? 0);
			expect(usage.costUsd).toBeUndefined();
			if (object(diag.service).attemptCount === 0) expect(diag).toMatchObject({ misses: 0, attempts: [], usage: { inputTokens: 0, outputTokens: 0 } });
		}
		if (backend === "llm") {
			expect(wireBodies.every((body) => body.model === model.id && object(body.thinking).type === "enabled")).toBe(true);
			expect(reviewResults.every((result) => result.backend === "llm")).toBe(true);
			const actual = reviewResults.flatMap((result) => object(result.diagnostics).attempts as unknown[]);
			expect(actual).toHaveLength(attempts.length);
			expect(new Set(actual.map((row) => object(row).id)).size).toBe(attempts.length);
		}
		expect(observations.filter((e) => object(e).phase === "start")).toHaveLength(attempts.length);
		expect(observations.filter((e) => object(e).phase === "end")).toHaveLength(attempts.length);
		const failedObservation = observations.map(object).find((e) => e.phase === "end" && e.status === 400);
		expect(failedObservation?.inputTokens).toBeDefined();
		expect(failedObservation?.outputTokens).toBeUndefined();
		expect(failedObservation?.costUsd).toBeUndefined();
		expect(reviewResults.length).toBeGreaterThan(0);
		if (failure !== "none") expect(reviewResults[0].answers).toEqual({});
		expect(reviewResults.at(-1)?.stopReason).toBe("stop");
		await writeFile(join(dir, "evidence.json"), JSON.stringify({ backend, failure, full, wireBodies, attempts, observations, reviewResults, ledger: allLedger, notices: [...first.notices, ...resumed.notices] }, null, 2));
		await resumed.fire("session_shutdown");
	} finally {
		globalThis.fetch = originalFetch;
		if (originalService === undefined) delete holder[key]; else holder[key] = originalService;
		if (savedAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = savedAgentDir;
		if (savedOwner === undefined) delete process.env.PI_JEV_TODO_AUDIT_OWNER_PID; else process.env.PI_JEV_TODO_AUDIT_OWNER_PID = savedOwner;
	}
}, 15000);
