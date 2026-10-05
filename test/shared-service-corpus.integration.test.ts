/** Six captured workloads through actual audit/service/Pi. Byte limits are fixture limits, not tokenizer claims. */
import { expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { corpus } from "./corpus.js";
import { runCase } from "./shared-service-corpus.js";

const enabled = !!process.env.PI_JUDGMENT_SOURCE && !!process.env.PI_CLASSIFIER_SOURCE;
for (const workload of corpus()) test.skipIf(!enabled)(`R14 real corpus: ${workload.name}`, async () => {
	const result = await runCase(workload), m = result.metrics;
	const dir = await mkdtemp(`/var/tmp/audit-corpus-${workload.name.replace(/[^a-z0-9-]/g, "-")}-`);
	await writeFile(join(dir, "wire.json"), JSON.stringify(result, null, 2));
	expect(m.requests).toBeGreaterThan(0); expect(m.requests).toBe(result.wire.length);
	expect(m.textTotal).toBe(workload.textMarkers.length); expect(m.textSeen).toBe(m.textTotal);
	expect(m.toolBodyLeaks).toBe(0);
	expect(m.bytes).toBe(result.wire.reduce((n, wire) => n + wire.bytes, 0));
	expect(m.bytes).toBe(m.stateBytes + m.questionBytes);
	expect(m.questionsAsked).toBe(result.wire.reduce((n, wire) => n + Object.keys(wire.body.questions).length, 0));
	expect(result.reviews.reduce((n, review) => n + review.diagnostics.attemptCount, 0)).toBe(m.requests);
	expect(result.attempts.filter((attempt) => attempt.phase === "start")).toHaveLength(m.requests);
	expect(result.attempts.filter((attempt) => attempt.phase === "end")).toHaveLength(m.requests);
	for (const marker of workload.textMarkers) expect(JSON.stringify(result.ledger)).not.toContain(marker);
	for (const review of result.reviews) if (review.stopReason !== "stop") expect(review.answers).toEqual({});
	if (workload.ordinary) expect(m.rejected).toBe(0);
	if (["short", "text-only+reply"].includes(workload.name)) expect(m.auditsWithoutRequest).toBeGreaterThan(0);
	if (workload.name === "mixed-cached") {
		expect(result.reviews[0].stopReason).toBe("error"); expect(result.reviews[0].progress.stages).toHaveLength(0);
		expect(result.wire).toHaveLength(2);
		expect(Object.keys(result.wire[1].body.questions).sort()).toEqual(["task_board_2", "task_board_3", "task_granularity_2"]);
		expect(result.reviews[1].stopReason).toBe("stop");
	}
	if (workload.name === "failed-later-chunk") {
		expect(m.failed).toBe(1); expect(m.rejected).toBeGreaterThan(0);
		// Presence in an attempted/rejected envelope is NOT completed factual coverage.
		expect(result.reviews[0].stopReason).toBe("error");
		expect(result.reviews.at(-1)?.stopReason).toBe("error"); // retained required reports exceed this fixture's fixed-state limit
		expect(result.reviews.at(-1)?.contextOverflow).toBe(true);
		expect(result.reviews.flatMap((review) => review.progress.stages).every((stage) => !stage.final)).toBe(true);
	}
}, 15000);
