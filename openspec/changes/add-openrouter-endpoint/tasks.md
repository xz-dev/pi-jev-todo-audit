## 1. OpenRouter channel

- [x] 1.1 Add the OpenRouter System One endpoint to the built-in published limits (32k request-wide, 32k state + longest question). Verify with a capacity test that the same envelope fits TypeSafe direct but is pre-split on OpenRouter.
- [x] 1.2 Recognise `error.metadata.error_type: "context_length_exceeded"` as a context overflow while other typed OpenRouter errors stay ordinary failures. Verify with overflow-recognition tests (the test fails if the metadata lookup is removed).
- [x] 1.3 Record `usage.cost` as an optional per-attempt USD charge and total it in diagnostics only when reported (unknown when partial, absent when none). Verify with a runAudit test using the documented response and a diagnostics test.

## 2. Docs and validation

- [x] 2.1 README: OpenRouter configuration and the per-channel pre-split behaviour.
- [x] 2.2 Full validation: bun test, typecheck, git diff --check, openspec validate --strict. No live OpenRouter call.
