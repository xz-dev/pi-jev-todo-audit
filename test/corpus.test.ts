/** Ordinary projection checks; R14's opt-in real-wire suite owns requests, bytes and recovery metrics. */
import { expect, test } from "bun:test";
import { collectContext } from "../context.js";
import { corpus, MOCK_CAPACITY } from "./corpus.js";

test("corpus retains all six workloads and their public text without tool bodies", () => {
	const cases = corpus();
	expect(cases.map((c) => c.name)).toEqual(["tool-heavy", "text-only+reply", "short", "todo-revisions", "mixed-cached", "failed-later-chunk"]);
	expect(MOCK_CAPACITY).toBeGreaterThan(0);
	for (const c of cases) {
		const branch: unknown[] = [], seen = new Set<string>();
		for (const step of c.steps) {
			if ("push" in step) branch.push(...step.push);
			if (!("audit" in step)) continue;
			const context = collectContext(branch), text = JSON.stringify(context);
			expect(text).not.toContain("TOOL_BODY_MARK");
			for (const marker of c.textMarkers) if (text.includes(marker)) seen.add(marker);
		}
		expect([...seen].sort()).toEqual([...c.textMarkers].sort());
	}
});
