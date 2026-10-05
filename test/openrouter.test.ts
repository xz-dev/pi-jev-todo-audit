/** OpenRouter System One endpoint: documented wire shapes only (offline; no live OpenRouter call). */
import { expect, test } from "bun:test";
import { buildAuditRequest, isContextOverflow, runAudit, type Attempt } from "./legacy/typesafe.js";
import { newCapacityProfile, predictOverflow, PUBLISHED_LIMITS, sizeOf } from "./legacy/capacity.js";
import { diagnose } from "../ledger.js";

const OPENROUTER = "https://openrouter.ai/api/v1/systemone";
const board = { tasks: [{ id: 5, subject: "Parser", status: "in_progress" as const }], nextId: 6 };
const req = buildAuditRequest(board, "x", "jev-latest");
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

test("the documented OpenRouter response (id, provider, usage.cost) is answered and its charge recorded", async () => {
	const seen: Attempt[] = [];
	let url = "", auth = "";
	const res = await runAudit(req, { apiUrl: OPENROUTER, apiKey: "sk-or-test", timeoutMs: 1000, onAttempt: (a) => seen.push(a), fetchFn: async (u, init) => {
		url = u; auth = new Headers(init?.headers).get("authorization") ?? "";
		return json({ id: "gen-dec-1", model: "typesafe/jev-1.13-20260917", provider: "TypeSafe",
			answers: { alignment: { type: "choice", choice: "aligned", confidence: 0.9, probabilities: { aligned: 0.95 } } },
			usage: { cost: 0.000019992, input_tokens: 476, output_tokens: 70 } });
	} });
	expect(res.ok).toBe(true);
	expect(url).toBe(OPENROUTER); expect(auth).toBe("Bearer sk-or-test");
	expect(seen).toEqual([{ outcome: "answered", status: 200, model: "typesafe/jev-1.13-20260917", inputTokens: 476, outputTokens: 70, costUsd: 0.000019992, ...sizeOf(req) }]);
});

test("OpenRouter's typed context_length_exceeded is an overflow; its other typed errors are not", () => {
	const or = (status: number, error_type: string) => JSON.stringify({ error: { code: status, message: "Provider returned error", metadata: { error_type } } });
	expect(isContextOverflow(400, or(400, "context_length_exceeded"))).toBe(true);
	for (const t of ["invalid_request", "payload_too_large", "token_limit_exceeded", "string_too_long", "unmapped"]) expect(isContextOverflow(400, or(400, t))).toBe(false);
	expect(isContextOverflow(402, or(402, "payment_required"))).toBe(false);
	expect(isContextOverflow(429, or(429, "rate_limit_exceeded"))).toBe(false);
});

test("OpenRouter's single published 32K context bounds both dimensions", () => {
	const limits = PUBLISHED_LIMITS[OPENROUTER];
	const p = newCapacityProfile(); p.tokensPerByte = 0.5;
	// Admitted on TypeSafe direct (60k total ≤ 64k) but over OpenRouter's 32K context.
	const s = { stateBytes: 30_000, questionBytes: 90_000, longestQuestionBytes: 2_000 };
	expect(predictOverflow(p, s, PUBLISHED_LIMITS["https://api.typesafe.ai/v1/systemone"])).toBe(false);
	expect(predictOverflow(p, s, limits)).toBe(true);
	expect(predictOverflow(p, { stateBytes: 50_000, questionBytes: 10_000, longestQuestionBytes: 2_000 }, limits)).toBe(false);
});

test("diagnostics total the reported charge and count attempts that reported none", () => {
	const a = (costUsd?: number): Attempt => ({ outcome: "answered", inputTokens: 10, outputTokens: 1, ...(costUsd === undefined ? {} : { costUsd }) });
	const r = { hits: 0, joined: 0, sent: 1 }, range = { from: null, to: null };
	expect(diagnose("x", "l", r, range, "completed", [a(0.25), a(0.5)]).usage).toEqual({ inputTokens: 20, outputTokens: 2, costUsd: 0.75 });
	expect(diagnose("x", "l", r, range, "completed", [a(0.25), a()]).usage).toEqual({ inputTokens: 20, outputTokens: 2, costUsd: 0.25, unreported: { costUsd: 1 } });
	expect(diagnose("x", "l", r, range, "completed", [a(), a()]).usage).toEqual({ inputTokens: 20, outputTokens: 2 }); // channel reports no charge (TypeSafe direct)
});
