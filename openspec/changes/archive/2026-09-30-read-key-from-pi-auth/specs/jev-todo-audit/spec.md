## MODIFIED Requirements

### Requirement: Configuration

The extension SHALL retain configurable audit interval (default 10), user-message cooldown (default 10), confidence threshold (default 0.5), model (default `jev-latest`), API key source, enable/disable switch, and `staleAuditSpans` (default 3). The age threshold SHALL control diagnostic review, not an unconditional splitting rule.

The deprecated `activityBudgetChars` field SHALL remain load-compatible but SHALL NOT constrain evidence below verified provider hard limits. An explicitly configured legacy value SHALL produce a one-time deprecation notice instead of silently restoring a character budget. No replacement cost-saving character cap, fixed record count, or context-allocation ratio SHALL be imposed.

Configuration SHALL retain its layered precedence: built-in defaults, global user configuration at `<PI_CODING_AGENT_DIR>/jev-todo-audit.json` (default `~/.pi/agent/jev-todo-audit.json`), then trusted-project configuration at `<cwd>/.pi/jev-todo-audit.json`. Project configuration SHALL be read only when the project is trusted.

The API key SHALL be resolved Pi-first. The configured `apiUrl` SHALL map to a Pi provider: `https://api.typesafe.ai/v1/systemone` to `typesafe` and `https://openrouter.ai/api/v1/systemone` to `openrouter`; any other URL has no Pi provider. When the endpoint maps to a provider registered in the running Pi, the key Pi resolves for that provider (its stored credentials, `models.json`, or provider environment variables, in Pi's own order) SHALL be used. When Pi resolves no nonblank key, the provider is not registered, the lookup is unavailable or fails, or the endpoint has no Pi provider, the extension SHALL fall back to its own sources: a nonblank value from the environment variable named by `apiKeyEnvVar`, then the global-layer `apiKey`.

`apiKey` and `apiKeyEnvVar` SHALL be honored only from the global layer. Blank values SHALL count as absent. When a mapped, registered provider's key comes from the extension fallback, session start SHALL warn once that the key should move into Pi auth, naming the provider-specific way (for `openrouter`: `/login` or `OPENROUTER_API_KEY`; for `typesafe`: `TYPESAFE_API_KEY` or a `typesafe` entry in Pi's `auth.json`); the audit SHALL still run with the fallback key. Endpoints without a registered Pi provider SHALL NOT produce this warning. Session start SHALL warn once when no key resolves from any source, naming Pi auth first and the extension fallback second. The resolved key SHALL remain excluded from evidence and diagnostics whichever source supplied it. Missing or malformed configuration SHALL fall back safely without failing extension load. The default cooldown SHALL remain one normal default audit cycle and explicit overrides SHALL remain independent of interval.

#### Scenario: Defaults apply when unconfigured
- **WHEN** the extension loads without configuration
- **THEN** interval 10, cooldown 10, threshold 0.5, model `jev-latest`, and age-review threshold 3 apply, without an application character cap

#### Scenario: Legacy budget configuration remains loadable
- **WHEN** an existing configuration contains `activityBudgetChars: 4000`
- **THEN** it loads with a one-time deprecation notice and does not truncate otherwise relevant, provider-compliant evidence at 4,000 characters

#### Scenario: Project override applies when trusted
- **WHEN** a trusted project's configuration sets `interval: 5`
- **THEN** the audit interval is five loops

#### Scenario: Project override ignored when untrusted
- **WHEN** an untrusted project contains audit configuration
- **THEN** that file is not read and global/default configuration applies

#### Scenario: Project cannot inject apiKey
- **WHEN** project configuration contains an API key and neither Pi nor the global layer has one
- **THEN** the project value is not used as a credential

#### Scenario: Pi key wins for TypeSafe direct
- **WHEN** `apiUrl` is the TypeSafe direct endpoint, Pi resolves a `typesafe` key, and the global config also has `apiKey`
- **THEN** the audit authenticates with Pi's key and no migration warning is shown

#### Scenario: Pi key used for OpenRouter
- **WHEN** `apiUrl` is the OpenRouter System One endpoint and the user signed in to `openrouter` through Pi
- **THEN** the audit authenticates with the key Pi resolves for `openrouter`

#### Scenario: Fallback key with migration warning
- **WHEN** `apiUrl` maps to a registered Pi provider, Pi resolves no key, and the global config has `apiKey`
- **THEN** the audit runs with the config key and session start warns once to move the key into Pi auth for that provider

#### Scenario: Provider not registered in this Pi
- **WHEN** `apiUrl` is the TypeSafe direct endpoint but the running Pi has no `typesafe` provider, and the global config has `apiKey`
- **THEN** the audit runs with the config key without a migration warning

#### Scenario: Custom endpoint uses extension config only
- **WHEN** `apiUrl` is a URL with no Pi provider mapping and the global config has `apiKey`
- **THEN** the audit runs with the config key, Pi is not consulted, and no migration warning is shown

#### Scenario: Pi lookup failure degrades to fallback
- **WHEN** Pi's key lookup throws or is unavailable
- **THEN** the extension uses its fallback sources without failing the audit or extension load

#### Scenario: No key anywhere
- **WHEN** no source yields a nonblank key
- **THEN** session start warns once, naming Pi auth first and the extension config second, and audits are skipped

#### Scenario: Cooldown can be overridden
- **WHEN** trusted configuration explicitly changes cooldown
- **THEN** the override is honored without changing the default elsewhere

#### Scenario: Disabled extension is inert
- **WHEN** the extension is disabled
- **THEN** periodic and terminal-stop auditing remain inactive and no counter state is maintained
