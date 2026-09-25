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
		for (let i = 0; i < 19; i++) {
			onTurnEnd(c);
			expect(shouldAudit(c, 10, 10)).toBe(false);
		}
		onTurnEnd(c); // loop 20, sinceUser=20 > 10
		expect(shouldAudit(c, 10, 10)).toBe(true);
	});

	test("cooldown 10 boundary: exactly 10 skips, 11 fires", () => {
		// user msg at loop 0 → trigger at loop 10 has since=10 → skip
		const c = freshCounter();
		onUserMessage(c);
		for (let i = 0; i < 10; i++) onTurnEnd(c);
		expect(loopsSinceUserMsg(c)).toBe(10);
		expect(shouldAudit(c, 10, 10)).toBe(false);
		// user msg at loop 9 → loop 20 trigger has since=11 → fire
		const c2 = replayCounter(branch("user", ...Array(9).fill("assistant"), "user", ...Array(11).fill("assistant")));
		expect(c2.totalLoops).toBe(20);
		expect(loopsSinceUserMsg(c2)).toBe(11);
		expect(shouldAudit(c2, 10, 10)).toBe(true);
	});

	test("cooldown skips trigger inside 10 loops of user msg; next multiple still fires", () => {
		const c = freshCounter();
		onUserMessage(c); // initial prompt
		for (let i = 0; i < 17; i++) onTurnEnd(c); // loops 1..17
		onUserMessage(c); // user steers at loop 17
		onTurnEnd(c); // 18
		onTurnEnd(c); // 19
		onTurnEnd(c); // 20 — 3 loops after user msg → skip
		expect(shouldAudit(c, 10, 10)).toBe(false);
		for (let i = 0; i < 10; i++) onTurnEnd(c); // loops 21..30, since=13 > 10
		expect(shouldAudit(c, 10, 10)).toBe(true);
	});

	test("edge: exactly 10 loops after user msg still skipped", () => {
		// user msg at loop 5: trigger at 10 has since=5 → skip
		const c2 = replayCounter(branch("user", ...Array(5).fill("assistant"), "user", ...Array(5).fill("assistant")));
		expect(c2.totalLoops).toBe(10);
		expect(loopsSinceUserMsg(c2)).toBe(5);
		expect(shouldAudit(c2, 10, 10)).toBe(false);
		// since=10 exactly → still skipped
		const c3 = replayCounter(branch("user", ...Array(10).fill("assistant"), "user", ...Array(10).fill("assistant")));
		expect(c3.totalLoops).toBe(20);
		expect(loopsSinceUserMsg(c3)).toBe(10);
		expect(shouldAudit(c3, 10, 10)).toBe(false);
	});

	test("aborted turn never reaches branch → not counted", () => {
		// branch only has finalized messages; an aborted assistant msg simply isn't there
		const c = replayCounter(branch("user", "assistant"));
		expect(c.totalLoops).toBe(1);
	});
});
