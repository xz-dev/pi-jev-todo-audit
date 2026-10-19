## 1. Reproduce and repair

- [x] 1.1 Recover original feedback and verify the existing confidence/cursor safety contract.
- [x] 1.2 Add a deterministic regression: 41 pending loops, at most two admitted, no cursor progress before the 32-call budget on the original implementation. Observe the intended failure.
- [x] 1.3 Replace linear overflow shrink with a nonempty leading half of complete loops; preserve all other admission and persistence rules.
- [x] 1.4 Verify progress survives ledger reload and bounded later runs cover the suffix.

## 2. Verify and hand off

- [x] 2.1 Run focused and full tests, typecheck, and real-service offline lifecycle integration; record exact results.
- [x] 2.2 Validate the OpenSpec change and affected process model, and obtain independent read-only review of the local diff.
- [x] 2.3 Record evidence, remaining limitations, and local-only delivery status. Leave installed copies, global settings, commits, push, and release untouched.
