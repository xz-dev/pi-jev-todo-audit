## Context

`config.ts:resolveApiKey(cfg)` is synchronous and reads only extension sources (env var named by `apiKeyEnvVar`, then global `apiKey`). `index.ts` calls it in three places: `auditNow` (gate + request key), `contextFor` (redaction secret list), and `session_start` (one-time "no key" warning). The extension builds and sends the System One request itself (`typesafe.ts`), so it needs a bare key string, not Pi's full request auth.

Pi's extension context exposes `ctx.modelRegistry` with `getProvider(id)` and `async getApiKeyForProvider(id)`. The latter is documented as provider-level key lookup without model headers, which is what a hand-built request needs. Existing tests build `ctx` objects without `modelRegistry`.

## Goals / Non-Goals

**Goals:**
- One resolution function, shared by all three call sites, returning the key and its origin.
- Endpoint→provider mapping kept next to the existing per-endpoint table so the two known channels are defined once.

**Non-Goals:**
- Switching the transport to `ctx.modelRegistry.classify()` (would drop the custom overflow split, per-question cache, retries, and cost parsing).
- Removing `apiKey` / `apiKeyEnvVar` or emitting a deprecation for them on custom endpoints.
- Using Pi auth headers, `baseUrl` overrides, or OAuth token refresh beyond what `getApiKeyForProvider` returns.

## Decisions

**1. `resolveAuditKey(cfg, registry?)` returns `{ key?, source: "pi" | "fallback" | "none", provider? }`.**
Async. Steps: map `cfg.apiUrl` → provider id; if mapped and `registry?.getProvider?.(id)` is truthy, `await registry.getApiKeyForProvider(id)` inside try/catch; nonblank → `source: "pi"`. Otherwise existing `resolveApiKey(cfg)` → `source: "fallback"` or `"none"`. `provider` is set only when the provider is mapped *and* registered — that is exactly the condition for the migration warning.
Alternative: keep sync and pre-read `auth.json` directly — rejected: duplicates Pi's precedence, misses `!command` keys, env, and `models.json`.

**2. Mapping lives beside `PUBLISHED_LIMITS` in `capacity.ts`** as a small `PI_PROVIDERS` record keyed by the same URL strings. Exact-string match, same as the limits lookup.
Alternative: hostname matching — rejected: a proxy on the same host with a different path is a different channel; exact match is what the limits table already does.

**3. Resolve once per audit, reuse the value.** `auditNow` awaits `resolveAuditKey` at its start and passes the key into `contextFor` for redaction, replacing the second synchronous `resolveApiKey` call. Keys resolved by Pi may come from a `!command`; Pi caches those for the process lifetime, so per-audit resolution costs nothing extra.

**4. Warnings at `session_start` only.** `session_start` awaits `resolveAuditKey` once: `source === "none"` → "no API key" warning naming Pi auth first, then `apiKeyEnvVar` / `apiKey` in `agentConfigPath()`; `source === "fallback" && provider` → migration warning with provider-specific hint (`openrouter`: `/login` or `OPENROUTER_API_KEY`; `typesafe`: `TYPESAFE_API_KEY` or a `typesafe` entry in `auth.json`). `auditNow` keeps its existing per-attempt "no API key" notice (text updated) but never emits the migration warning, to avoid nagging every audit.

**5. Default `apiKeyEnvVar = TYPESAFE_API_KEY` needs no special case.** When the endpoint is TypeSafe direct and `TYPESAFE_API_KEY` is set, Pi's provider env lookup returns it first → `source: "pi"`, no warning. On OpenRouter or older Pi builds it arrives via fallback and warns only if the provider is registered.

## Risks / Trade-offs

- [Pi key silently overrides a different config key after upgrade] → Documented precedence change in README; the key Pi returns is the one the user already configured for that provider in Pi.
- [`typesafe` provider absent in older Pi builds] → `getProvider` check makes it a plain fallback with no warning; behavior equals today.
- [`/login` may not offer `typesafe`] → Warning text for `typesafe` names env var / `auth.json`, not `/login`.
- [Registry method missing or throws in some host/test context] → Optional chaining + try/catch; treated as "Pi resolved nothing".

## Migration Plan

No user action required; existing configs keep working. Users who see the migration warning move the key into Pi (`/login`, provider env var, or `auth.json`) and may then delete `apiKey` from `jev-todo-audit.json`. Rollback = revert the change; config format is unchanged.
