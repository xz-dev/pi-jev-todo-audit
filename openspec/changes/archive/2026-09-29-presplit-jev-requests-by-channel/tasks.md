## 1. Capacity model

- [x] 1.1 Add a pure per-channel capacity profile: channel identity (endpoint + requested model), published/configured limits (TypeSafe direct built in; `contextLimits` config override), densest observed tokens/byte (prior 1/1.75), recorded rejection sizes, and a `predictOverflow(stateBytes, questionBytes, longestQuestionBytes)` check. Verify with unit tests covering both limits separately, the learned-rejection dominance rule and the prior.
- [x] 1.2 Restore the profile from diagnostics on the active branch, ignoring diagnostics without channel/size fields. Verify with a ledger test that a reload restores both the ratio and the rejections.

## 2. Preflight in evaluation

- [x] 2.1 In the cache-aware evaluate path, check the actual miss envelope before sending and return a predicted `contextOverflow` without a provider attempt, rejected-envelope record or onReject. Verify with a cache test that no fetch happens and no rejection is persisted.
- [x] 2.2 Update the profile from each real attempt (answered usage ratio, rejected sizes) and record channel, longest-question bytes and pre-split count in diagnostics. Verify with ledger/diagnostics tests that pre-splits are reported separately from attempts and carry no usage.
- [x] 2.3 Irreducible units (single question, no context halves) retry once without preflight so server admission decides. Verify with a capacity test where the estimate predicts overflow but the provider admits.

## 3. Integration and evidence

- [x] 3.1 Wire a per-session profile in the host (restored on session start, keyed like the evaluation cache). Verify with a host test that a second audit after a recorded rejection pre-splits without a new 400.
- [x] 3.2 Replay the live smoke attempt sizes through the predictor and record the result in the change's evidence (expected: 7 rejected envelopes predicted, 8 admitted envelopes not). Verify by the test asserting this replay.
- [x] 3.3 Full validation: bun test, typecheck, git diff --check, openspec validate --strict.
