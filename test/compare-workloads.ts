/** Offline paired request-shape measurements. --baseline reads committed core modules without a checkout. */
import { plugin } from "bun";
import { execFileSync } from "node:child_process";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { AuditRequest } from "../typesafe.js";
import type { EvidenceRecord } from "../context.js";
import type { Rolling } from "../rolling.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const baseline = process.argv.includes("--baseline");
const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
if (baseline) plugin({ name: "read-only-baseline", setup(build) {
	build.onLoad({ filter: /\.ts$/ }, ({ path }) => {
		const name = relative(root, path);
		if (!/^(?:[^/]+\.ts|test\/corpus\.ts)$/.test(name)) return;
		return { contents: execFileSync("git", ["show", `${revision}:${name}`], { cwd: root, encoding: "utf8" }), loader: "ts" };
	});
} });
// This standalone offline benchmark is its own main process, not an audit child.
process.env.PI_JEV_TODO_AUDIT_OWNER_PID = String(process.pid);
const { runCorpus } = await import(baseline ? "./corpus.ts" : "./shared-service-corpus.ts");
const corpus = await runCorpus();
console.log(JSON.stringify({ mode: baseline ? "baseline" : "candidate", baselineRevision: revision, corpus: corpus.rows }));

// Retained-prefix legacy measurements are historical only. The candidate's
// corresponding 1/6/69-record admissions run in shared-service-boundary.integration.test.ts.
if (baseline) {
const rollingPath = "../rolling.ts", typesafePath = "../typesafe.ts";
const { reviewRolling } = await import(rollingPath) as typeof import("./legacy/rolling.js");
const { newEvaluationCache } = await import(typesafePath) as typeof import("./legacy/typesafe.js");
const board = { tasks: [{ id: 1, subject: "Current task", status: "in_progress" as const },
	{ id: 2, subject: "Next task", status: "pending" as const }], nextId: 3 };
const record = (id: string, kind: string, text: string): EvidenceRecord => ({ id, kind, text, group: id, view: "recent", protected: kind === "user", complete: true });
for (const count of [1, 6, 69]) {
	const records = [record("u", "user", "context ".repeat(8000)), ...Array.from({ length: count }, (_, i) => record(`t${i}`, "tool_call", `read completed ${i}`))];
	const sent: AuditRequest[] = [], receipts: Rolling[] = []; let presplits = 0, stateBytes = 0, questionBytes = 0;
	const outcome = await reviewRolling({ board, context: { records, omissions: [], globalComplete: true, reduced: false }, processed: new Set(["u"]),
		rolling: { through: "u", inputKey: "old", opinions: {}, answerKeys: [] }, inputKey: "new", model: "jev-latest",
		opts: { apiUrl: "https://api.typesafe.ai/v1/systemone", apiKey: "offline", timeoutMs: 1000, cache: newEvaluationCache(),
			capacity: { profile: { tokensPerByte: 0.4779192204934779, rejections: [] }, limits: { request: 64000, stateAndLongestQuestion: 32000 } },
			onPresplit: () => presplits++, fetchFn: async (_u, init) => {
				const req = JSON.parse(String(init!.body)) as AuditRequest; sent.push(req);
				const s = Buffer.byteLength(req.state), q = Buffer.byteLength(JSON.stringify(req.questions));
				stateBytes += s; questionBytes += q;
				return new Response(JSON.stringify({ usage: { input_tokens: Math.ceil((s + q) * 0.34), output_tokens: 30 },
					answers: Object.fromEntries(Object.entries(req.questions).map(([k, v]) => [k, { choice: Object.keys(v.criteria)[0], confidence: 0.9 }])) }));
			} }, commit: (r) => (receipts.push(r), true) });
	console.log(JSON.stringify({ case: `retained-prefix-${count}`, requests: sent.length, presplits, stateBytes, questionBytes, receipts: receipts.length,
		complete: outcome.complete && outcome.final, through: receipts.at(-1)?.through,
		recordsSeen: records.filter((r) => sent.some((s) => s.state.includes(r.text))).length, recordsTotal: records.length }));
}
}
