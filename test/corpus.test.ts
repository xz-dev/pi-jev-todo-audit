/** Replay corpus: offline request-shape evidence under an explicit mock byte capacity (not provider tokens). */
import { expect, test } from "bun:test";
import { corpus, MOCK_CAPACITY, runCase } from "./corpus.js";

test("corpus covers the representative workloads and reports per-case metrics", async () => {
	const cases = corpus();
	expect(cases.map((c) => c.name)).toEqual(["tool-heavy", "text-only+reply", "short", "todo-revisions", "mixed-cached", "failed-later-chunk"]);
	expect(MOCK_CAPACITY).toBeGreaterThan(0);
	for (const c of cases) {
		const m = await runCase(c);
		expect(m.requests).toBeGreaterThan(0);
		expect(m.textTotal).toBe(c.textMarkers.length);
		expect(m.bytes).toBeGreaterThanOrEqual(m.stateBytes);
	}
});
