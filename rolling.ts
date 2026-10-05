/** Business source projection and receipt types; subdivision belongs to the shared service. */
import type { AuditContext, EvidenceRecord } from "./context.js";
import type { AuditResult, ChoiceAnswer, Reuse } from "./typesafe.js";

/** Latest completed business frontier; opinions are advisory, never factual coverage. */
export interface Rolling {
	serviceCheckpoint?: string;
	/** Stable starting checkpoint/frontier of this exact review across partial retries. */
	reviewOrigin?: { inputKey: string; checkpoint?: string; through?: string };
	through?: string; inputKey: string; opinions: Record<string, ChoiceAnswer>; answerKeys: string[];
	/** Historical fragment progress, not a substitute for the original source. */
	oversized?: string[];
}

/** Source entry of a projected record (tool calls are `<entry>:call:<id>`). */
export const entryOf = (r: EvidenceRecord) => (r.fragment?.of ?? r.id).split(":call:")[0];

/** Active-branch ids through the frontier; undefined means the frontier is not present. */
export function processedEntries(branch: Iterable<unknown>, through?: string): Set<string> | undefined {
	const out = new Set<string>();
	if (!through) return out;
	for (const raw of branch) {
		const id = (raw as { id?: unknown })?.id;
		if (typeof id !== "string") continue;
		out.add(id);
		if (id === through) return out;
	}
	return undefined;
}

/** Coverage cannot retire uncertain primary eligibility; retain permitted reports as authored. */
export function retainedFrom(processed: EvidenceRecord[]): { records: EvidenceRecord[] } {
	const summary = processed.filter((r) => r.kind === "summary").at(-1);
	return {
		records: processed.filter((r) => r.kind === "user" || r === summary ||
			((r.kind === "assistant" || r.kind === "custom") && !r.advice)).map((r) => {
			// Progress is not an account of facts. Necessary original text remains fixed state.
			const { fragment, ...whole } = r;
			return { ...whole, view: "global" as const, selection: "retained from processed range" };
		}),
	};
}

export interface RollingOutcome {
	result: AuditResult;
	context: AuditContext;
	reuse: Reuse;
	final: boolean;
	complete: boolean;
	unchanged: boolean;
	needsAccount?: boolean;
	recovered: boolean;
}
