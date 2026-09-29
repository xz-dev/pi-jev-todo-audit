## Context

`reviewRolling` subdivides only after `evaluate` returns an explicit context-overflow rejection. `evaluate` sends only the cache misses of a request, so the envelope that actually gets sent is known just before sending. Per-attempt diagnostics are already persisted on the branch with `stateBytes`, `questionBytes` and provider-reported `inputTokens`.

TypeSafe Models (checked 2026-09-29): Jev 1.13 has 64k tokens for state plus all questions and 32k for state plus the longest question. Our envelopes are state-dominated, so 32k usually binds. Packing all questions onto one state still uses the 64k request-wide allowance.

## Goals / Non-Goals

**Goals:**
- Avoid predictable rejections.
- Keep admitted envelopes whole, up to the channel's real limits.
- Learn from actual admissions and rejections.

**Non-Goals:**
- An exact tokenizer.
- A cross-session profile.
- OpenRouter request support (separate change; only its limits entry is added there).
- Changing question text.

## Decisions

1. **Preflight inside `evaluate`, on the actual miss envelope.**
   - Reason: cached questions shrink the envelope, so estimating the full request would over-split.
   - Behaviour: a predicted overflow returns the same `contextOverflow` result shape with `predicted: true`. Existing subdivision therefore runs unchanged.
   - It is not added to `cache.rejected` and does not call `onReject`/`onAttempt`.
   - Alternative rejected: a separate planner in `rolling.ts`. It would duplicate the dimension choice and cache awareness.

2. **Two separate limit checks per channel.**
   - `request`: state + all questions.
   - `stateAndLongestQuestion`: state + the single largest question.
   - Built-in table keyed by endpoint URL: `https://api.typesafe.ai/v1/systemone` → `{ request: 64000, stateAndLongestQuestion: 32000 }`.
   - A config `contextLimits` overrides the table. With neither, prior limits are absent and only learned rejections apply.
   - Alternative rejected: one conservative 32k total. It would split requests the 64k allowance admits.

3. **Ratio is the densest observed tokens/byte on the channel.**
   - Measure: `inputTokens / (stateBytes + questionBytes)` on answered attempts; the prior is 1/1.75 until the first observation.
   - Densest (max) is chosen over the mean. Under-estimation costs a real rejection; over-estimation only costs a split. The learned-rejection rule catches residual under-estimates.
   - The channel is `digest(apiUrl, requested model)`, recorded on each diagnostic.

4. **Learned rejection dominance.**
   - Each rejected attempt records `stateBytes`, `questionBytes` and `longestQuestionBytes`.
   - An envelope is pre-split if, for some recorded rejection on the channel, its `stateBytes + longestQuestionBytes` and its `stateBytes + questionBytes` are both at least the rejected values.
   - This is monotone, so it never blocks an envelope smaller in either dimension than every rejection.

5. **Irreducible units are always sent.**
   - `evaluateBatched` at a single question, and `reviewRolling` with no possible context halves, retry once with preflight disabled. Server admission stays authoritative, and the existing irreducible diagnostic still requires a real rejection.

6. **Restore from existing diagnostics.**
   - `restoreCapacity(branch)` folds the diag records of the active branch.
   - Diagnostics without a channel or size fields are ignored.
   - No new ledger kind is added.

## Risks / Trade-offs

- [Content much sparser than the densest ratio (English/code)] → Over-splitting costs extra state repetition, not rejections. The prior is only used until real usage exists. Accepted per the user's choice of the densest observed ratio.
- [Published limits change] → Learned rejections still apply, and config can override the limits.
- [A mis-set configured limit that is too low] → Only splits more. Server admission is never bypassed for irreducible units.

## Migration Plan

This is additive. Old diagnostics are simply ignored for learning. To roll back, revert the commit; there is no stored-format dependency.
