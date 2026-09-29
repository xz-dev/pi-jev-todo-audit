# Evidence

## Live smoke replay (TypeSafe direct, jev-1.13.0, forked real session, 2026-09-29)

Source: per-attempt diagnostics of the reuse-jev-audit-decisions live smoke test. The 15 attempts are replayed through `predictOverflow` with published limits (request 64k, state + longest question 32k), a prior of 1/1.75 tokens/byte, and a longest question of about 1.75 KB.

| | count | predicted overflow |
|---|---|---|
| actual `max_tokens_exceeded` (64–224 KB) | 7 | 7 |
| actual admitted (37–48 KB, ≤ 23,042 tokens) | 8 | 0 |

Observed bytes/token on admitted attempts: mean 2.03, range 1.77–2.22, CV 8.4%, leave-one-out error −14.7%…+10.6%. The verdicts are unchanged after learning the real usage (`test/presplit.test.ts`).

This is a replay of sizes, not a new paid run. Rejected-request billing on TypeSafe direct remains undocumented. OpenRouter documents zero-completion insurance, meaning an errored response with no output is not charged.

## Trade-off

The estimate errs on the side of splitting. If it over-splits content that the server would have admitted, the fixed state and question overhead is paid more than once. That cost is certain. In return, it avoids an uncertain rejection. Whether avoiding a rejection saves money on TypeSafe direct depends on whether rejections are billed, which is still unknown. On this session, the largest admitted request is about 25.5k estimated tokens against a 32k limit, so no admitted request would have been split.

## Review

One fresh-context review round was run. The reviewer timed out before writing a verdict, but its offline mock probes still count as evidence. Triage by the parent session:

- **Fixed.** `auditWithContext` (question batching without context subdivision) could end on a predicted overflow without sending anything. In that path a single question is irreducible, so it now uses `sendIrreducible` and server admission decides. Regression test: `test/presplit.test.ts`, "a direct context evaluation still sends single questions…". The test fails when the fix is reverted. `auditWithContext` has no production caller; the host uses `reviewRolling`.
- **Expected behaviour, confirmed.** Probes with artificially tiny limits (`request: 1`) produced many single-question calls and no whole-state send. This is the specified fallback: the request is divided down to single units, which are then submitted. A probe with limits of 7000 predicted a request-wide overflow while predicting no overflow for state plus longest question. That is the two limits being checked separately.

## Validation

216 Bun tests pass, typecheck is clean, `git diff --check` is clean, and `openspec validate --strict` passes.
