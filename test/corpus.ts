/**
 * Representative workload data, shared by projection and actual-wire checks.
 * MOCK_CAPACITY is an explicit fixture limit on serialized state/envelope plus
 * longest question bytes, not a real tokenizer or a provider 32k/64k limit.
 */

export const MOCK_CAPACITY = 24_000;
export interface CaseMetrics {
	requests: number; presplits: number; receipts: number; rejected: number; failed: number; bytes: number; stateBytes: number; questionBytes: number; maxStatePlusQuestion: number;
	questionsAsked: number; textSeen: number; textTotal: number; toolBodyLeaks: number;
	/** Bytes of non-task records already sent in an earlier request of this case (re-sent processed input). */
	resentBytes: number;
	/** Bytes of the rolling opinions/progress block (added overhead). */
	rollingBytes: number;
	/** Requests that reused nothing but the cache: full-repeat audits answered locally. */
	auditsWithoutRequest: number;
}
type Step = { push: unknown[] } | { audit: string } | { failNext: number } | { omit: RegExp } | { answerAll: true };
export interface Case { name: string; ordinary: boolean; steps: Step[]; textMarkers: string[] }

let n = 0;
const id = (p: string) => `${p}-${++n}`;
export const user = (text: string) => ({ id: id("u"), type: "message", message: { role: "user", content: text } });
export const say = (text: string) => ({ id: id("a"), type: "message", message: { role: "assistant", content: [{ type: "text", text }] } });
export const tool = (name: string, args: unknown, body: string, isError = false) => {
	const call = id("call");
	return [
		{ id: id("a"), type: "message", message: { role: "assistant", content: [{ type: "toolCall", id: call, name, arguments: args }] } },
		{ id: id("r"), type: "message", message: { role: "toolResult", toolCallId: call, toolName: name, isError, content: [{ type: "text", text: body }] } },
	];
};
export const todo = (tasks: unknown[]) => [
	{ id: id("a"), type: "message", message: { role: "assistant", content: [{ type: "toolCall", id: id("todo"), name: "todo", arguments: { action: "update" } }] } },
	{ id: id("r"), type: "message", message: { role: "toolResult", toolName: "todo", content: [{ type: "text", text: "Board updated" }], details: { tasks, nextId: 20 } } },
];
const TOOL_BODY = "TOOL_BODY_MARK";
const pad = (mark: string, bytes: number) => `${mark} ` + "analysis detail sentence. ".repeat(Math.ceil(bytes / 26));
const t5 = { id: 5, subject: "Parser rewrite", description: "Reject malformed input in src/parser.ts", status: "in_progress" };

export function corpus(): Case[] {
	const toolHeavy: Step[] = [{ push: [user("Rewrite src/parser.ts so malformed input is rejected."), ...todo([t5])] }];
	for (let i = 0; i < 3; i++) {
		const batch: unknown[] = [];
		for (let j = 0; j < 6; j++) batch.push(...tool(j % 2 ? "bash" : "read", { command: `${TOOL_BODY} cmd ${i}-${j} src/parser.ts`, path: "src/parser.ts" }, pad(`${TOOL_BODY} out ${i}-${j}`, 1500), j === 5 && i === 1));
		toolHeavy.push({ push: [...batch, say(`TEXT_TH_${i} progress on parser`)] }, { audit: "" });
	}
	const textMarks = Array.from({ length: 8 }, (_, i) => `TEXT_AN_${i}`);
	const textOnly: Step[] = [
		{ push: [user("Analyse the trade-offs of three caching strategies; no code changes."), ...todo([{ id: 7, subject: "Caching analysis", status: "in_progress" }])] },
		{ push: textMarks.slice(0, 4).map((m) => say(pad(m, 900))) }, { audit: "" },
		{ push: [{ id: id("jev"), type: "custom_message", customType: "jev-todo-audit", display: true, content: "[jev audit] split #7 into three tasks?" }, say(`${textMarks[4]} Rebuttal: #7 is one coherent comparison; the three strategies are already sections of one deliverable.`)] },
		{ push: textMarks.slice(5).map((m) => say(pad(m, 900))) }, { audit: "" },
		{ audit: "" },
	];
	const short: Step[] = [{ push: [user("Rename a variable in src/a.ts"), ...todo([{ id: 1, subject: "Rename", status: "in_progress" }]), say("TEXT_SH_0 renamed")] }, { audit: "" }, { audit: "" }];
	const revisions: Step[] = [
		{ push: [user("Implement src/cache.ts eviction."), ...todo([{ id: 9, subject: "Eviction", status: "in_progress" }]), say("TEXT_RV_0 started")] }, { audit: "" },
		{ push: [...todo([{ id: 9, subject: "Eviction", description: "LRU with TTL", status: "in_progress" }]), say("TEXT_RV_1 refined scope")] },
		{ push: [...todo([{ id: 9, subject: "Eviction", description: "LRU with TTL; waiting for approval", status: "pending" }]), say("TEXT_RV_2 paused")] }, { audit: "" },
		{ push: [user("Approved, continue."), ...todo([{ id: 9, subject: "Eviction", description: "LRU with TTL", status: "in_progress" }]), say("TEXT_RV_3 resumed")] }, { audit: "" },
	];
	const mixed: Step[] = [
		{ push: [user("Work on src/x.ts and src/y.ts"), ...todo([{ id: 2, subject: "X", status: "in_progress" }, { id: 3, subject: "Y", status: "pending" }]), say("TEXT_MX_0 working on x")] },
		{ omit: /granularity|task_board/ }, { audit: "" }, { answerAll: true }, { audit: "" },
	];
	const longMarks = Array.from({ length: 12 }, (_, i) => `TEXT_LG_${i}`);
	const failedChunk: Step[] = [
		{ push: [user("Review the design document in depth; analysis only."), ...todo([{ id: 4, subject: "Design review", status: "in_progress" }]), ...longMarks.map((m) => say(pad(m, 4000)))] },
		{ failNext: 3 }, { audit: "" }, { audit: "" },
	];
	return [
		{ name: "tool-heavy", ordinary: true, steps: toolHeavy, textMarkers: ["TEXT_TH_0", "TEXT_TH_1", "TEXT_TH_2"] },
		{ name: "text-only+reply", ordinary: true, steps: textOnly, textMarkers: textMarks },
		{ name: "short", ordinary: true, steps: short, textMarkers: ["TEXT_SH_0"] },
		{ name: "todo-revisions", ordinary: true, steps: revisions, textMarkers: ["TEXT_RV_0", "TEXT_RV_1", "TEXT_RV_2", "TEXT_RV_3"] },
		{ name: "mixed-cached", ordinary: true, steps: mixed, textMarkers: ["TEXT_MX_0"] },
		{ name: "failed-later-chunk", ordinary: false, steps: failedChunk, textMarkers: longMarks },
	];
}
