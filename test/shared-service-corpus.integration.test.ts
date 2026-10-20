/** Six captured workloads through actual audit/v2 service/Pi. Byte limits are fixture limits, not tokenizer claims. */
import { expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { corpus } from "./corpus.js";
import { runCase } from "./shared-service-corpus.js";

const enabled = !!process.env.PI_JUDGMENT_SOURCE && !!process.env.PI_CLASSIFIER_SOURCE;
for (const workload of corpus()) test.skipIf(!enabled)(`R14 real corpus (stateless v2): ${workload.name}`, async () => {
	const result = await runCase(workload), m = result.metrics;
	const dir = await mkdtemp(join(process.platform === "win32" ? tmpdir() : "/var/tmp", `audit-corpus-${workload.name.replace(/[^a-z0-9-]/g, "-")}-`));
	await writeFile(join(dir, "wire.json"), JSON.stringify(result, null, 2));
	expect(m.requests).toBeGreaterThan(0); expect(m.requests).toBe(result.wire.length);
	expect(m.textTotal).toBe(workload.textMarkers.length); expect(m.textSeen).toBe(m.textTotal);
	expect(m.toolBodyLeaks).toBe(0);
	expect(m.bytes).toBe(result.wire.reduce((n, wire) => n + wire.bytes, 0));
	expect(m.bytes).toBe(m.stateBytes + m.questionBytes);
	expect(m.questionsAsked).toBe(result.wire.reduce((n, wire) => n + Object.keys(wire.body.questions).length, 0));
	// Stateless contract: every provider request came through judge() results,
	// one terminal result per admitted segment attempt.
	expect(result.judgments.length).toBe(m.requests);
	for (const marker of workload.textMarkers) expect(JSON.stringify(result.ledger)).not.toContain(marker);
	for (const judgment of result.judgments) if (judgment.stopReason !== "stop") expect(judgment.answers).toEqual({});
	if (workload.ordinary) expect(m.rejected).toBe(0);
	if (["short", "text-only+reply"].includes(workload.name)) {
		// Unclear answers hold the scope open; a repeated audit re-judges it
		// (the stateless service has no cache answering locally) while a scope
		// whose cursor reached the tip needs no new call.
		expect(m.requests).toBeGreaterThan(0);
	}
	if (workload.name === "mixed-cached") {
		// Version two never publishes partial answers: the deliberately omitted
		// answers error the whole judgment, so nothing advances and the retry asks
		// the identical complete question set — no service cache answered locally.
		expect(result.judgments[0].stopReason).toBe("error");
		expect(result.wire).toHaveLength(2);
		expect(Object.keys(result.wire[1].body.questions).sort()).toEqual(Object.keys(result.wire[0].body.questions).sort());
		expect(result.judgments[1].stopReason).toBe("stop");
	}
	if (workload.name === "failed-later-chunk") {
		expect(m.failed).toBe(1); expect(m.rejected).toBeGreaterThan(0);
		// The non-overflow 422 is a terminal error for that attempt (not fabricated
		// coverage); the next audit retries the uncommitted segment, keeps halving
		// on overflow, and the final admitted segment stops cleanly.
		expect(result.judgments.some((j) => j.stopReason === "error" && !j.contextOverflow)).toBe(true);
		expect(result.judgments.some((j) => j.contextOverflow)).toBe(true);
		expect(result.judgments.at(-1)?.stopReason).toBe("stop");
	}
}, 15000);
