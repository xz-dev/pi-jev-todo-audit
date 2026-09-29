## Why

Jev is also offered through OpenRouter (`typesafe/jev-1.13`), billed to an OpenRouter account. Pointing `apiUrl` at OpenRouter already sends the right request, because its System One API implements TypeSafe's request and response shapes. Two things do not work yet:

- OpenRouter reports context overflow as `error.metadata.error_type: "context_length_exceeded"`. The client does not recognise it, so an oversized request would fail instead of being subdivided.
- OpenRouter has no built-in capacity entry, so the extension cannot pre-split for it.

OpenRouter also returns the actual USD charge (`usage.cost`), which is useful spend evidence. The maintainers do not use OpenRouter. This change only adds support, verified against the docs and offline tests.

## What Changes

- Add the published OpenRouter System One endpoint `https://openrouter.ai/api/v1/systemone` to the built-in channel limits. The model page lists one 32K context and no separate per-question limit, so 32k bounds both the request-wide and the state-plus-longest-question dimensions.
- Recognise OpenRouter's typed `error.metadata.error_type: "context_length_exceeded"` as an explicit context overflow. Other typed errors (`invalid_request`, `payload_too_large`, `token_limit_exceeded`, `string_too_long`, `payment_required`, `rate_limit_exceeded`, …) stay ordinary failures.
- Record a provider-reported charge (`usage.cost`, USD) per attempt and in the audit total. Channels that report no charge record none. A total is `unknown` if any attempt on a charging channel lacks it.
- README: document OpenRouter configuration and the pre-split behaviour added by the previous change.

## Capabilities

### New Capabilities

### Modified Capabilities
- `jev-todo-audit`: provider-limit handling recognises OpenRouter's overflow contract and publishes its limits; cost observations include a provider-reported charge when available.

## Impact

- Code: `capacity.ts` (limits entry), `typesafe.ts` (overflow recognition, cost observation), `ledger.ts` (cost in diagnostics), README.
- No new dependency, config key or request field. The judgment version is unchanged.
- There were no live OpenRouter calls.
