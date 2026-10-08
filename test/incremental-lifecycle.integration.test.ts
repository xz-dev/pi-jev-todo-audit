/** Nonempty business memory through actual extension lifecycle, sibling service, and Pi adapter. */
import { expect, test } from "bun:test";
import { buildContextEntries, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import makeExtension from "../index.js";
import { DEFAULT_CONFIG } from "../config.js";
import type { JudgeRequest, JudgeResult } from "../judgment-client.js";
import { STATE_TYPE } from "../state.js";
import { actualNativeFixture } from "./actual-service-fixture.js";

const task = { id: 5, subject: "Parser", status: "in_progress", description: "Implement A and B; no deployment." };
function host(raw: any[]) {
	const handlers = new Map<string, any[]>(), commands = new Map<string, any>(), sent: any[] = [];
	const add = (entry: any) => { raw.push({ parentId: raw.at(-1)?.id ?? null, timestamp: new Date(0).toISOString(), ...entry }); };
	const ctx = { sessionManager: { getSessionId: () => "lifecycle", getBranch: () => raw, buildContextEntries: () => buildContextEntries(raw) }, ui: { notify: () => {} } };
	const pi = { on: (event: string, fn: any) => handlers.set(event, [...(handlers.get(event) ?? []), fn]), events: { on: () => {} },
		registerCommand: (name: string, command: any) => commands.set(name, command),
		appendEntry: (customType: string, data: unknown) => add({ id: `state-${raw.length}`, type: "custom", customType, data: JSON.parse(JSON.stringify(data)) }),
		sendMessage: (message: any, options: any) => { sent.push({ message, options }); add({ id: `advice-${raw.length}`, type: "custom_message", ...message }); },
	} as unknown as ExtensionAPI;
	makeExtension(pi, { ...DEFAULT_CONFIG, legacyFields: [] });
	return { raw, add, ctx, sent, run: () => commands.get("jev-audit").handler("", ctx),
		emit: async (event: string) => { for (const fn of handlers.get(event) ?? []) await fn({}, ctx); } };
}
const message = (id: string, role: string, content: unknown) => ({ id, type: "message", message: { role, content } });

test.skipIf(!process.env.PI_JUDGMENT_SOURCE)("nonempty progress/authority survives JSONL cold reload and real Pi compaction without resending old loops", async () => {
	const key = Symbol.for("pi-llm-as-jev:service"), services = globalThis as Record<symbol, unknown>;
	const saved = services[key], owner = process.env.PI_JEV_TODO_AUDIT_OWNER_PID;
	process.env.PI_JEV_TODO_AUDIT_OWNER_PID = String(process.pid);
	let phase = 0;
	try {
		const fixture = await actualNativeFixture((req: JudgeRequest): JudgeResult => {
			const source = phase === 0 ? "a" : phase < 3 ? `a${phase}` : "b";
			const choices: Record<string, string> = { task_status_5: phase < 3 ? "progress_evidenced" : "completion_reported", task_evidence_5: source,
				task_board_5: "accurate", task_granularity_5: "unchanged", task_granularity_evidence_5: "none_in_segment",
				interaction: phase === 0 ? "permission_granted" : phase < 3 ? "unchanged" : "permission_withdrawn",
				work_evidence: phase === 0 ? "u" : phase < 3 ? "keep_prior" : "withdraw",
				current_work: phase === 0 ? "switched_to_5" : phase < 3 ? "same_work" : "waiting", current_work_evidence: phase === 0 ? "a" : "none_in_segment",
				scope_update: phase === 0 || phase === 3 ? "scope_updated" : "no_scope_change", scope_evidence: phase === 0 ? "u" : phase === 3 ? "withdraw" : "none_in_segment",
				drift: phase === 3 ? "blocked" : "on_track" };
			return { answers: Object.fromEntries(Object.entries(req.questions).map(([id, q]) => {
				if (q.type !== "choice" || !Object.hasOwn(q.criteria, choices[id])) throw new Error(`Unscripted ${id}: ${choices[id]}`);
				return [id, { type: "choice", choice: choices[id], confidence: 1, probabilities: Object.fromEntries(Object.keys(q.criteria).map((k) => [k, k === choices[id] ? 1 : 0])) }];
			})), dropped: [], backend: "classifier", model: "typesafe/jev-latest", stopReason: "stop", reuse: { hits: 0, joined: 0, sent: 1 } };
		}, () => String(phase));
		services[key] = fixture.service;
		const h = host([]);
		h.add(message("u", "user", "Implement A and B locally. Do not deploy."));
		h.add(message("board-call", "assistant", [{ type: "toolCall", id: "todo1", name: "todo", arguments: {} }]));
		h.add({ id: "board", type: "message", message: { role: "toolResult", toolCallId: "todo1", toolName: "todo", content: "Updated", details: { tasks: [task], nextId: 6 } } });
		h.add(message("a", "assistant", "A accepts valid input. B remains open."));
		await h.emit("session_start"); await h.run();
		for (phase = 1; phase < 3; phase++) {
			h.add(message(`a${phase}`, "assistant", phase === 1 ? "A now rejects malformed input. B remains open." : "A passed the unicode checks. B remains open."));
			await h.run();
			const attempt = fixture.wire.filter((w) => w.phase === String(phase))[0];
			expect(new Set(attempt.anchorIds).size).toBe(attempt.anchorIds.length);
			expect(attempt.newIds).toEqual([`a${phase}`]);
			for (const text of ["A accepts valid input. B remains open.", "Implement A and B locally. Do not deploy."])
				expect(attempt.audit.split(text).length - 1).toBe(1); // no duplication via status/progress/permission anchors
		}
		const snapshot = h.raw.filter((e) => e.customType === STATE_TYPE).at(-1).data;
		expect(snapshot.tasks["5"].progressReports).toEqual([{ sourceId: "a" }, { sourceId: "a1" }, { sourceId: "a2" }]);
		expect(snapshot.session.authorizedScope.anchor).toBe("u");
		await h.emit("session_shutdown");
		// JSONL serialization and a new extension/service instance: no in-memory audit state survives.
		const reloaded = host(JSON.parse(JSON.stringify(h.raw))); services[key] = fixture.reload();
		reloaded.add(message("kept", "assistant", "Awaiting final B result."));
		reloaded.add({ id: "comp", type: "compaction", summary: "Reported earlier progress. This summary is not user authority.", firstKeptEntryId: "kept", tokensBefore: 10000 });
		reloaded.add(message("withdraw", "user", "Stop execution. Only reconcile the board; previous implementation permission is withdrawn. No deployment."));
		reloaded.add(message("b", "assistant", "B passed its checks. The entire A+B Parser scope is reported complete."));
		expect(reloaded.ctx.sessionManager.buildContextEntries().some((e: any) => e.id === "a2")).toBe(false);
		await reloaded.emit("session_start"); await reloaded.emit("session_compact"); await reloaded.run();
		const final = reloaded.raw.filter((e) => e.customType === STATE_TYPE).at(-1).data;
		expect(final.tasks["5"].completionReport).toEqual({ sourceId: "b", verified: false });
		expect(final.session.interaction.state).toBe("waiting_user"); expect(final.session.authorizedScope).toEqual({});
		const after = fixture.wire.filter((w) => w.phase === "3"); expect(after).toHaveLength(2);
		for (const call of after) for (const id of ["u", "board-call", "board", "a", "a1", "a2"]) expect(call.newIds).not.toContain(id);
		expect(after[0].anchorIds).toEqual(expect.arrayContaining(["u", "a", "a1", "a2"]));
		expect(reloaded.sent).toHaveLength(1); expect(reloaded.sent[0].message.content).toContain("reported, not independently verified");
		expect(reloaded.sent[0].message.content).not.toContain("CONTINUE"); expect(reloaded.sent[0].options.triggerTurn).toBeUndefined();
		console.log(JSON.stringify({ check: "nonempty-entrypoint-compaction", calls: fixture.wire.map(({ phase, bytes, stateBytes, anchorBytes, newHistoryBytes, anchorIds, newIds }) => ({ phase, bytes, stateBytes, anchorBytes, newHistoryBytes, anchorCount: anchorIds.length, newCount: newIds.length })), tokens: "unknown; scripted transport", cost: "no live inference" }));
	} finally {
		if (saved === undefined) delete services[key]; else services[key] = saved;
		if (owner === undefined) delete process.env.PI_JEV_TODO_AUDIT_OWNER_PID; else process.env.PI_JEV_TODO_AUDIT_OWNER_PID = owner;
	}
});
