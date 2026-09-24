import { describe, expect, test } from "bun:test";
import { freshCounter, loopsSinceUserMsg, onTurnEnd, onUserMessage, replayCounter, shouldAudit } from "../counter.js";

const msg = (role: string) => ({ type: "message", message: { role } });
const branch = (...roles: string[]) => roles.map(msg);

describe("counter", () => {
	test("counts finalized assistant messages as loops", () => {
		const b = branch("user", "assistant", "assistant", "user", "assistant");
		expect(replayCounter(b).totalLoops).toBe(3);
	});

	test("lastUserMsgAt = loops completed before the user msg", () => {
		const b = branch("user", "assistant", "assistant", "user", "assistant");
		const c = replayCounter(b);
		expect(c.lastUserMsgAt).toBe(2); // user msg #2 arrived after 2 loops
		expect(loopsSinceUserMsg(c)).toBe(1);
	});

	test("turn_end increments; user message_end resets cooldown ref", () => {
		const c = freshCounter();
		onUserMessage(c); // session prompt at loop 0
		for (let i = 0; i < 10; i++) onTurnEnd(c);
		expect(c.totalLoops).toBe(10);
		expect(loopsSinceUserMsg(c)).toBe(10);
		onUserMessage(c); // user steers at loop 10
		expect(loopsSinceUserMsg(c)).toBe(0);
	});

	test("audit fires at multiples of 10 when past cooldown", () => {
		const c = freshCounter();
		onUserMessage(c);
		for (let i = 0; i < 9; i++) {
			onTurnEnd(c);
			expect(shouldAudit(c, 10, 5)).toBe(false);
		}
		onTurnEnd(c); // loop 10
		expect(shouldAudit(c, 10, 5)).toBe(true);
	});

	test("cooldown skips trigger inside 5 loops of user msg; next multiple still fires", () => {
		const c = freshCounter();
		onUserMessage(c); // initial prompt
		for (let i = 0; i < 7; i++) onTurnEnd(c); // loops 1..7
		onUserMessage(c); // user steers at loop 7
		onTurnEnd(c); // 8
		onTurnEnd(c); // 9
		onTurnEnd(c); // 10 — 3 loops after user msg → skip
		expect(shouldAudit(c, 10, 5)).toBe(false);
		for (let i = 0; i < 10; i++) onTurnEnd(c); // loops 11..20
		expect(shouldAudit(c, 10, 5)).toBe(true); // 20 - 7 = 13 > 5
	});

	test("edge: exactly 5 loops after user msg still skipped, 6th audits", () => {
		const c = freshCounter();
		onUserMessage(c); // lastUserMsgAt = 0
		for (let i = 0; i < 10; i++) onTurnEnd(c); // loop 10, sinceUser=10 → audit
		expect(shouldAudit(c, 10, 5)).toBe(true);
		// simulate user msg at loop 5: trigger at 10 has since=5 → skip
		const c2 = replayCounter(branch("user", ...Array(5).fill("assistant"), "user", ...Array(5).fill("assistant")));
		expect(c2.totalLoops).toBe(10);
		expect(loopsSinceUserMsg(c2)).toBe(5);
		expect(shouldAudit(c2, 10, 5)).toBe(false);
	});

	test("aborted turn never reaches branch → not counted", () => {
		// branch only has finalized messages; an aborted assistant msg simply isn't there
		const c = replayCounter(branch("user", "assistant"));
		expect(c.totalLoops).toBe(1);
	});
});
