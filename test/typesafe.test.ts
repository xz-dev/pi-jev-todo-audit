import { describe, expect, mock, test } from "bun:test";
import { buildAuditRequest, runAudit, NOT_ON_BOARD, type AuditRequest } from "../typesafe.js";
import type { BoardSnapshot } from "../board.js";

const board: BoardSnapshot = {
	tasks: [
		{ id: 3, subject: "Write parser", status: "in_progress", activeForm: "writing parser" },
		{ id: 5, subject: "Add tests", status: "pending" },
		{ id: 9, subject: "Old task", status: "deleted" },
	],
	nextId: 10,
};

describe("typesafe request", () => {
	test("non-empty board → 5 questions, no board_warranted", () => {
		const req = buildAuditRequest(board, "edited parser.ts", "jev-latest");
		expect(req.model).toBe("jev-latest");
		expect(Object.keys(req.questions).sort()).toEqual(["alignment", "current_match", "drift", "granularity", "task_status_3", "task_status_5"]);
		for (const q of Object.values(req.questions)) expect(q.type).toBe("choice");
	});

	test("all-done board → board_warranted included", () => {
		const doneBoard: BoardSnapshot = {
			tasks: [{ id: 1, subject: "done", status: "completed" }, { id: 2, subject: "also done", status: "completed" }],
			nextId: 3,
		};
		const req = buildAuditRequest(doneBoard, "x", "jev-latest");
		expect(req.questions.board_warranted).toBeDefined();
	});

	test("pending-only board → board_warranted included", () => {
		const pendingBoard: BoardSnapshot = {
			tasks: [{ id: 1, subject: "queued", status: "pending" }],
			nextId: 2,
		};
		const req = buildAuditRequest(pendingBoard, "x", "jev-latest");
		expect(req.questions.board_warranted).toBeDefined();
	});

	test("state embeds board rows + activity", () => {
		const req = buildAuditRequest(board, "edited parser.ts", "jev-latest");
		expect(req.state).toContain("[in_progress] #3 Write parser (writing parser)");
		expect(req.state).toContain("edited parser.ts");
	});

	test("current_match options = visible tasks + not_on_board (deleted excluded)", () => {
		const req = buildAuditRequest(board, "x", "jev-latest");
		const crit = req.questions.current_match.criteria as Record<string, string>;
		expect(Object.keys(crit).sort()).toEqual(["3", "5", NOT_ON_BOARD]);
		expect(crit["3"]).toContain("Write parser");
	});

	test("empty board → not_on_board only + board_warranted question present", () => {
		const req = buildAuditRequest({ tasks: [], nextId: 1 }, "x", "jev-latest");
		expect(req.state).toContain("(board is empty)");
		const crit = req.questions.current_match.criteria as Record<string, string>;
		expect(Object.keys(crit)).toEqual([NOT_ON_BOARD]);
		expect(req.questions.board_warranted).toBeDefined();
		expect(req.questions.granularity).toBeDefined();
		const bw = req.questions.board_warranted.criteria as Record<string, string>;
		expect(Object.keys(bw).sort()).toEqual(["idle", "trivial", "warranted"]);
	});

	test("per-task lifecycle question per unfinished task", () => {
		const req = buildAuditRequest(board, "x", "jev-latest");
		const q5 = req.questions.task_status_5;
		const q3 = req.questions.task_status_3;
		expect(q5).toBeDefined();
		expect(q3).toBeDefined();
		expect(q5.instructions).toContain("#5");
		expect(Object.keys(q5.criteria).sort()).toEqual([
			"actually_completed", "blocked", "cancelled", "deliberately_deferred", "future", "still_ongoing", "unclear",
		]);
		// deleted task #9 gets no question
		expect(req.questions.task_status_9).toBeUndefined();
	});

	test("terminalStop info serializes into state", () => {
		const req = buildAuditRequest(board, "x", "jev-latest", {
			stopKind: "AI_UNLOCK",
			reasonType: "JOB_DONE",
			reason: "work done",
		});
		expect(req.state).toContain("STOP_KIND: AI_UNLOCK");
		expect(req.state).toContain("REASON_TYPE: JOB_DONE");
		expect(req.state).toContain("REASON: work done");
	});

	test("no terminalStop → no stop block in state", () => {
		const req = buildAuditRequest(board, "x", "jev-latest");
		expect(req.state).not.toContain("STOP_KIND");
	});
});

describe("typesafe client", () => {
	const req: AuditRequest = buildAuditRequest(board, "x", "jev-latest");
	const opts = { apiUrl: "https://x.test/v1/systemone", apiKey: "k", timeoutMs: 1000 };

	test("ok response → parsed answers", async () => {
		const fetchFn = mock(async () => new Response(JSON.stringify({
			answers: { alignment: { choice: "aligned", confidence: 0.9, probabilities: { aligned: 0.9 } } },
		}), { status: 200 }));
		const res = await runAudit(req, { ...opts, fetchFn: fetchFn });
		expect(res.ok).toBe(true);
		if (res.ok) expect(res.answers.alignment?.choice).toBe("aligned");
		const call = (fetchFn as any).mock.calls[0];
		expect(call[0]).toBe(opts.apiUrl);
		expect(JSON.parse(call[1].body as string).model).toBe("jev-latest");
		expect((call[1].headers as Record<string, string>).authorization).toBe("Bearer k");
	});

	test("HTTP error → ok:false, no throw", async () => {
		const fetchFn = mock(async () => new Response("nope", { status: 500 }));
		const res = await runAudit(req, { ...opts, fetchFn: fetchFn });
		expect(res.ok).toBe(false);
		if (!res.ok) expect(res.error).toContain("HTTP 500");
	});

	test("network failure → ok:false, no throw", async () => {
		const fetchFn = mock(async () => { throw new Error("boom"); });
		const res = await runAudit(req, { ...opts, fetchFn: fetchFn });
		expect(res.ok).toBe(false);
		if (!res.ok) expect(res.error).toBe("boom");
	});

	test("malformed body → ok:false", async () => {
		const fetchFn = mock(async () => new Response("{}", { status: 200 }));
		const res = await runAudit(req, { ...opts, fetchFn: fetchFn });
		expect(res.ok).toBe(false);
	});

	test("transient HTTP error retries up to maxRetries, then ok:true", async () => {
		let n = 0;
		const fetchFn = mock(async () => {
			n++;
			if (n < 3) return new Response("overloaded", { status: 503 });
			return new Response(JSON.stringify({ answers: { alignment: { choice: "aligned" } } }), { status: 200 });
		});
		const res = await runAudit(req, { ...opts, fetchFn: fetchFn, maxRetries: 3, baseDelayMs: 1 });
		expect(res.ok).toBe(true);
		expect(n).toBe(3);
	});

	test("network throw retries up to maxRetries", async () => {
		let n = 0;
		const fetchFn = mock(async () => {
			n++;
			if (n === 1) throw new Error("fetch failed");
			return new Response(JSON.stringify({ answers: {} }), { status: 200 });
		});
		const res = await runAudit(req, { ...opts, fetchFn: fetchFn, maxRetries: 2, baseDelayMs: 1 });
		expect(res.ok).toBe(true);
		expect(n).toBe(2);
	});

	test("non-retryable error fails fast — no retry", async () => {
		let n = 0;
		const fetchFn = mock(async () => {
			n++;
			return new Response("insufficient_quota", { status: 429 });
		});
		const res = await runAudit(req, { ...opts, fetchFn: fetchFn, maxRetries: 3, baseDelayMs: 1 });
		expect(res.ok).toBe(false);
		expect(n).toBe(1);
	});

	test("budget exhausted → ok:false after maxRetries+1 calls", async () => {
		let n = 0;
		const fetchFn = mock(async () => {
			n++;
			return new Response("overloaded", { status: 503 });
		});
		const res = await runAudit(req, { ...opts, fetchFn: fetchFn, maxRetries: 2, baseDelayMs: 1 });
		expect(res.ok).toBe(false);
		expect(n).toBe(3);
	});

	test("real transport errors retry: TypeError fetch failed + ENOTFOUND + socket hang up", async () => {
		const causes = [
			new TypeError("fetch failed"),
			new Error("getaddrinfo ENOTFOUND api.typesafe.ai"),
			new Error("socket hang up"),
		];
		let n = 0;
		const fetchFn = mock(async () => {
			const c = causes[n++];
			if (c) throw c;
			return new Response(JSON.stringify({ answers: {} }), { status: 200 });
		});
		const res = await runAudit(req, { ...opts, fetchFn: fetchFn, maxRetries: 3, baseDelayMs: 1 });
		expect(res.ok).toBe(true);
		expect(n).toBe(4);
	});

	test("malformed response is not retried even with maxRetries>0", async () => {
		let n = 0;
		const fetchFn = mock(async () => {
			n++;
			return new Response("{}", { status: 200 });
		});
		const res = await runAudit(req, { ...opts, fetchFn: fetchFn, maxRetries: 5, baseDelayMs: 1 });
		expect(res.ok).toBe(false);
		expect(n).toBe(1);
	});

	test("backoff delays double: base * 2^(attempt-1)", async () => {
		const gaps: number[] = [];
		let last = Date.now();
		let n = 0;
		const fetchFn = mock(async () => {
			if (n++ > 0) { gaps.push(Date.now() - last); last = Date.now(); }
			else last = Date.now();
			if (n < 3) return new Response("overloaded", { status: 503 });
			return new Response(JSON.stringify({ answers: {} }), { status: 200 });
		});
		await runAudit(req, { ...opts, fetchFn: fetchFn, maxRetries: 3, baseDelayMs: 30 });
		expect(gaps[0]).toBeGreaterThanOrEqual(25);   // ~30ms
		expect(gaps[1]).toBeGreaterThanOrEqual(55);   // ~60ms — proves doubling
		// Constant delay would put gaps[1] ≈ gaps[0]; ratio asserts exponential.
		expect(gaps[1]).toBeGreaterThan(gaps[0] * 1.5);
	});

	test("abort during backoff → ok:false 'aborted', no further fetch", async () => {
		const ac = new AbortController();
		let n = 0;
		const fetchFn = mock(async () => {
			n++;
			if (n === 1) {
				setTimeout(() => ac.abort(), 5);
				return new Response("overloaded", { status: 503 });
			}
			return new Response(JSON.stringify({ answers: {} }), { status: 200 });
		});
		const res = await runAudit(req, { ...opts, fetchFn: fetchFn, maxRetries: 5, baseDelayMs: 10_000, signal: ac.signal });
		expect(res.ok).toBe(false);
		if (!res.ok) expect(res.error).toBe("aborted");
		expect(n).toBe(1);
	});

	test("repeated successful+retried audits leave no abort listeners on signal", async () => {
		const ac = new AbortController();
		// Spy on the signal's listener churn — every added listener must be removed.
		let adds = 0, removes = 0;
		const sig = ac.signal as AbortSignal & EventTarget;
		const origAdd = sig.addEventListener.bind(sig) as (type: string, l: EventListenerOrEventListenerObject | null, o?: unknown) => void;
		const origRm = sig.removeEventListener.bind(sig) as (type: string, l: EventListenerOrEventListenerObject | null, o?: unknown) => void;
		sig.addEventListener = ((type: string, l: EventListenerOrEventListenerObject | null, o?: unknown) => { adds++; return origAdd(type, l, o); }) as typeof sig.addEventListener;
		sig.removeEventListener = ((type: string, l: EventListenerOrEventListenerObject | null, o?: unknown) => { removes++; return origRm(type, l, o); }) as typeof sig.removeEventListener;
		let calls = 0;
		const fetchFn = mock(async () => {
			calls++;
			// every 3rd call pattern: one retryable failure then success
			if (calls % 3 === 1 && calls > 1) return new Response("overloaded", { status: 503 });
			return new Response(JSON.stringify({ answers: {} }), { status: 200 });
		});
		for (let i = 0; i < 5; i++) {
			await runAudit(req, { ...opts, fetchFn, maxRetries: 2, baseDelayMs: 1, signal: ac.signal });
		}
		expect(adds).toBeGreaterThan(0);
		expect(adds).toBe(removes); // every backoff listener cleaned up
	});

	test("maxRetries 0 / unset → single attempt (default off)", async () => {
		let n = 0;
		const fetchFn = mock(async () => {
			n++;
			return new Response("boom", { status: 503 });
		});
		const res = await runAudit(req, { ...opts, fetchFn: fetchFn });
		expect(res.ok).toBe(false);
		expect(n).toBe(1);
	});

	test("task_status_* answers fold into lifecycle map; garbage keys dropped", async () => {
		const fetchFn = mock(async () => new Response(JSON.stringify({
			answers: {
				alignment: { choice: "aligned", confidence: 0.9 },
				task_status_5: { choice: "actually_completed", confidence: 0.9 },
				task_status_7: { choice: "still_ongoing", confidence: 0.8 },
				bogus_key: { choice: "x" },
				junk: "not-an-object",
			},
		}), { status: 200 }));
		const res = await runAudit(req, { ...opts, fetchFn: fetchFn });
		expect(res.ok).toBe(true);
		if (res.ok) {
			expect(res.answers.lifecycle?.task_status_5?.choice).toBe("actually_completed");
			expect(res.answers.lifecycle?.task_status_7?.choice).toBe("still_ongoing");
			expect((res.answers as Record<string, unknown>).bogus_key).toBeUndefined();
			expect(res.answers.alignment?.choice).toBe("aligned");
		}
	});
});
