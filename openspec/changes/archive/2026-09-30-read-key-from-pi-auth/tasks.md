## 1. Key resolution

- [x] 1.1 Add `PI_PROVIDERS` (TypeSafe direct URL → `typesafe`, OpenRouter System One URL → `openrouter`) beside `PUBLISHED_LIMITS` in `capacity.ts`; verify with a unit test that both known URLs map and an unknown URL does not
- [x] 1.2 Add async `resolveAuditKey(cfg, registry?)` in `config.ts` returning `{ key?, source, provider? }` per design decision 1 (Pi first when mapped + registered, try/catch, blank = absent, then existing `resolveApiKey`); verify with `test/config.test.ts` cases: Pi key wins over config, Pi blank → fallback with `provider` set, provider unregistered → fallback without `provider`, custom URL → registry never called, registry throws → fallback, nothing anywhere → `source: "none"`

## 2. Wiring

- [x] 2.1 In `index.ts` `auditNow`, await `resolveAuditKey(cfg, ctx.modelRegistry)` once, use its key for the request and pass it to `contextFor` for redaction (drop the second `resolveApiKey` call); update the "no API key" notice to name Pi auth first; verify existing `test/index.test.ts` passes and a new test shows a Pi-registry key reaches the request and is redacted from evidence
- [x] 2.2 In `session_start`, await `resolveAuditKey` once: warn "no API key" (Pi auth first) when `source === "none"`, warn provider-specific migration hint when `source === "fallback" && provider`; verify with index tests that each warning fires exactly once per session and no migration warning appears for `source: "pi"` or custom endpoints

## 3. Docs and checks

- [x] 3.1 Update README Configuration section: Pi auth as the recommended key source per endpoint, new precedence, extension `apiKey`/`apiKeyEnvVar` as fallback, migration warning; verify by reading the section against the delta spec
- [x] 3.2 Run `bun test` and `npm run typecheck`; both pass
