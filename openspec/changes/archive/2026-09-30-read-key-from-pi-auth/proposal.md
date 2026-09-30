## Why

Pi now ships built-in `typesafe` and `openrouter` providers and resolves their keys from `auth.json` (including `!command` secret-manager keys), `models.json`, and environment variables. The extension keeps a second copy of the same secret in `~/.pi/agent/jev-todo-audit.json`, so users configure and rotate one key in two places.

## What Changes

- Resolve the audit API key from Pi first: map the configured `apiUrl` to a Pi provider (`https://api.typesafe.ai/v1/systemone` → `typesafe`, `https://openrouter.ai/api/v1/systemone` → `openrouter`) and use the key Pi resolves for that provider.
- Keep the existing extension key sources (`apiKeyEnvVar` environment variable, then global `apiKey`) as a fallback when Pi resolves no key or the endpoint has no Pi provider. Existing configurations keep working.
- When a mapped endpoint's key comes from the extension fallback, warn once per session that the key should move into Pi auth, naming the provider-specific way to do so.
- Update the "no API key" warning to point at Pi auth first.
- Custom `apiUrl` endpoints behave as today: extension config only, no migration warning.
- Precedence change: when both Pi and the extension config hold a key for a mapped endpoint, Pi's key now wins (previously only the extension's sources were consulted).

## Capabilities

### New Capabilities

### Modified Capabilities
- `jev-todo-audit`: the Configuration requirement's API key source and precedence change to Pi-first with extension fallback and a migration warning.

## Impact

- `config.ts` (key resolution), `index.ts` (async key resolution per audit and at session start, warnings, redaction secret list), tests in `test/config.test.ts` / `test/index.test.ts`, README configuration section.
- Relies on Pi's extension API `ctx.modelRegistry.getApiKeyForProvider()` / `getProvider()`; absent or failing calls degrade to the existing fallback.
- No new dependencies. No change to request shape, endpoints, or project-layer secret restrictions.
