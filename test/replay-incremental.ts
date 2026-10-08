/** Explicit offline real-session replay. Writes only aggregate metrics to stdout, never session text.
 * PI_JUDGMENT_SOURCE=/path/to/service bun test/replay-incremental.ts SESSION FIRST_LEAF SECOND_LEAF
 * Scripted no-change replies test transport, suffix coverage and recovery, NOT semantic accuracy.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { buildContextEntries, parseSessionEntries, type SessionEntry } from "@earendil-works/pi-coding-agent";
import { collectContext, digest } from "../context.js";
import { replayBoardWithAges, unfinishedTasks } from "../board.js";
import { groupLoops } from "../loops.js";
import { runIncremental } from "../incremental.js";
import { emptyState, restoreState, writeState, type JudgmentState } from "../state.js";
import type { JudgeRequest, JudgmentService } from "../judgment-client.js";

const [file, firstLeaf, secondLeaf] = process.argv.slice(2);
const root = process.env.PI_JUDGMENT_SOURCE;
if (!file || !firstLeaf || !secondLeaf || !root) throw new Error("Set PI_JUDGMENT_SOURCE and supply session path plus two fixed leaf ids");
const all = parseSessionEntries(readFileSync(file, "utf8")).filter((e): e is SessionEntry => e.type !== "session");
const byId = new Map(all.map((e) => [e.id, e]));
function branch(leaf: string): SessionEntry[] {
	const out: SessionEntry[] = []; let at: string | null = leaf;
	while (at) { const e = byId.get(at); assert(e, `Missing entry ${at}`); out.push(e); at = e.parentId; }
	return out.reverse();
}
const { createJudgmentService } = await import(pathToFileURL(join(root, "src/service.ts")).href);
const { validateConfig } = await import(pathToFileURL(join(root, "src/config.ts")).href);
const { classify } = await import(new URL("./api/typesafe-system-one.js", import.meta.resolve("@earendil-works/pi-ai")).href);
const model = { type: "classifier", id: "jev-latest", provider: "typesafe", name: "Offline replay", api: "typesafe-system-one", baseUrl: "https://fixture.invalid/v1", input: ["text"], contextWindow: 32000, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } };
let phase = "first";
const wire: { phase: string; bytes: number; questionCount: number; ids: string[] }[] = [];
const fixtureFetch = async (url: unknown, init?: RequestInit) => {
	assert.equal(String(url), "https://fixture.invalid/v1/systemone", "No live transport");
	const raw = String(init?.body), req = JSON.parse(raw) as JudgeRequest;
	const audit = (req.state.fixed as { audit: string }).audit;
	const segment = JSON.parse(audit.split(/New segment \(\d+ complete loops\):\n/)[1].split("\nSegment records")[0]) as { id: string }[];
	wire.push({ phase, bytes: Buffer.byteLength(raw), questionCount: Object.keys(req.questions).length, ids: segment.map((r) => r.id) });
	const answers = Object.fromEntries(Object.entries(req.questions).map(([id, q]) => {
		assert.equal(q.type, "choice"); if (q.type !== "choice") throw new Error("choice only");
		const choice = id.startsWith("task_status_") ? "no_change" : id.startsWith("task_board_") ? "accurate" : id.includes("evidence") ? "none_in_segment" : id.startsWith("task_granularity_") ? "unchanged" :
			({ interaction: "unchanged", current_work: "same_work", scope_update: "no_scope_change", drift: "on_track", board_warranted: "idle" } as Record<string, string>)[id];
		assert(Object.hasOwn(q.criteria, choice), `Unscripted question ${id}`);
		assert(Object.keys(q.criteria).length <= 255, `Choice overflow ${id}`);
		return [id, { type: "choice", choice, confidence: 1, probabilities: Object.fromEntries(Object.keys(q.criteria).map((label) => [label, label === choice ? 1 : 0])) }];
	}));
	return Response.json({ answers });
};
function service(): JudgmentService {
	return createJudgmentService({ config: () => validateConfig({ mode: "classifier", classifierModel: "typesafe/jev-latest", timeoutMs: 5000 }).config,
		ledger: { branch: () => [], append: undefined }, nativeFetch: fixtureFetch,
		registry: { getAvailableOfType: async () => [model], getModel: () => undefined, getProviders: () => [], getAuth: async () => undefined,
			streamSimple: () => { throw new Error("No LLM fallback"); }, classify: (_m: unknown, ctx: unknown, opts: any) => classify(model, ctx, { ...opts, apiKey: "offline-replay-key", fetch: opts.fetch ?? fixtureFetch }) } });
}
function input(leaf: string) {
	const entries = branch(leaf), board = replayBoardWithAges(entries), effective = buildContextEntries(entries, leaf);
	const context = collectContext(effective, board.tasks.map((value) => ({ id: `task:${value.id}`, value })), true);
	return { entries, board, context, effective };
}
const rows: unknown[] = [];
const persist = (s: JudgmentState) => writeState((customType, data) => rows.push(JSON.parse(JSON.stringify({ type: "custom", customType, data }))), s);
const firstInput = input(firstLeaf), secondInput = input(secondLeaf);
async function run(i: ReturnType<typeof input>, state: JudgmentState) {
	return runIncremental({ service: service(), board: i.board, context: i.context, state, timeoutMs: 5000, minConfidence: 0.8,
		signal: new AbortController().signal, persist, maxSegmentsPerRun: 10000 });
}
const first = await run(firstInput, emptyState());
phase = "second";
const restored = restoreState(rows, new Set(secondInput.entries.map((e) => e.id)));
const second = await run(secondInput, restored);
phase = "second-cold-baseline";
const baseline = await run(secondInput, emptyState());
const stats = (p: string) => {
	const calls = wire.filter((w) => w.phase === p);
	return { requests: calls.length, bytes: calls.reduce((n, w) => n + w.bytes, 0), questions: calls.reduce((n, w) => n + w.questionCount, 0), uniqueEvidence: new Set(calls.flatMap((w) => w.ids)).size };
};
const firstIds = new Set(wire.filter((w) => w.phase === "first").flatMap((w) => w.ids));
const overlap = new Set(wire.filter((w) => w.phase === "second").flatMap((w) => w.ids).filter((id) => firstIds.has(id)));
console.log(JSON.stringify({ fixture: { firstLeaf, secondLeaf, firstHash: digest(firstInput.effective), secondHash: digest(secondInput.effective), entries: [firstInput.entries.length, secondInput.entries.length], projectedLoops: [groupLoops(firstInput.context.records).length, groupLoops(secondInput.context.records).length], unfinishedTasks: [unfinishedTasks(firstInput.board).length, unfinishedTasks(secondInput.board).length] },
	first: { ...stats("first"), complete: first.complete, scopes: first.reports.length, failed: first.reports.filter((r) => ["failed", "oversize"].includes(r.outcome)).map((r) => ({ outcome: r.outcome, error: r.error })) },
	second: { ...stats("second"), complete: second.complete, scopes: second.reports.length, repeatedEvidenceCount: overlap.size, failed: second.reports.filter((r) => ["failed", "oversize"].includes(r.outcome)).map((r) => ({ outcome: r.outcome, error: r.error })) },
	coldBaseline: { ...stats("second-cold-baseline"), complete: baseline.complete },
	tokens: "unknown; synthetic transport supplied no usage", cost: "no live inference; no provider billing measurement", semanticAccuracy: "not evaluated; no-change replies are scripted", adapter: "installed pi-ai native adapter; actual sibling service source", capacity: first.capacity }, null, 2));
assert(first.complete && second.complete && baseline.complete, "Incomplete replay is not acceptance");
assert.equal(overlap.size, 0, "No pre-cursor evidence may repeat as new history for unchanged scopes");
