## Why

Overflow recovery only learns a request is too large after the provider rejects it. In the live smoke test (forked real session), 7 of 15 attempts were `max_tokens_exceeded` rejections carrying about 747 KB, versus about 330 KB in the 8 accepted attempts. Direct TypeSafe billing for rejected requests is undocumented. Either way, each rejection costs a round trip, and it can cost money too. A byte estimate calibrated against provider-reported usage (mean 2.03 bytes/token, densest 1.77, CV 8.4%) separates all 7 rejected envelopes from all 8 accepted ones.

## What Changes

- Before sending, estimate the miss envelope's tokens as `bytes × tokens-per-byte`. The ratio is the densest ratio observed from provider-reported usage on this channel, or 1/1.75 until the first observation.
- Check the estimate against the **channel's own** published limits, checking both separately so no admitted capacity is wasted. TypeSafe direct: state + all questions ≤ 64k and state + longest question ≤ 32k. Unknown channels use only learned rejections unless limits are configured.
- Remember actual rejected sizes per channel (endpoint + requested model). Pre-split any envelope that is at least as large as a known rejection in both dimensions.
- A predicted overflow reuses the existing subdivision path: state pieces when state dominates, question batches when only the request-wide limit is exceeded. It is not a provider attempt, and it is not persisted as a rejected envelope.
- The estimate never declares a unit irreducible. A single record/fragment with a single question that is still predicted too large is sent, and server admission decides.
- Learning is restored from the existing per-audit diagnostics on the active branch. No new store.
- Diagnostics report pre-splits separately from real overflow rejections.

## Capabilities

### New Capabilities

### Modified Capabilities
- `jev-todo-audit`: provider-limit handling gains an estimated, per-channel pre-split before server admission, and cost observations separate predicted splits from actual rejections.

## Impact

- `typesafe.ts` (preflight in the cache-aware evaluate path, attempt size fields), `rolling.ts` (predicted overflow flag), `ledger.ts` (diagnostic channel/sizes, learning restore), `index.ts` (per-session capacity profile), `config.ts` (optional per-channel limit override).
- There is no API or dependency change. The judgment version is unchanged, because question text and answer meaning are the same; only request partitioning differs, and it already goes through the per-question cache.
