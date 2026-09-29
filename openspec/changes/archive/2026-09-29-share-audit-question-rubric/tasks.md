## 1. Request framing

- [x] 1.1 Move shared per-task rules into one state rubric (only when unfinished tasks exist); keep task scope and full option keys per question; shorten option descriptions and source labels. Verify with tests that the rubric appears once in state and questions stay scoped.
- [x] 1.2 Bump the judgment version so changed definitions never reuse old answers.

## 2. Evidence

- [x] 2.1 Offline size comparison on synthetic boards and real sessions (bytes, not tokens).
- [x] 2.2 Paid A/B on one real session prefix, same endpoint/model/cache-cold, old vs new framing: provider-reported input tokens and answers.
- [x] 2.3 Full validation: bun test, typecheck, git diff --check, openspec validate --strict.
