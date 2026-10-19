## Why

The incremental audit can spend its entire 32-call budget on overflow recovery without accepting any history. Recovery currently removes one trailing loop at a time. With 41 pending complete loops and a provider that only admits two at a time, every run stops before an admissible prefix, and the next run reconstructs the same oversized segment. This provides a deterministic mechanism for silent lack of audit progress after the incremental-state update.

## What Changes

- On an explicitly reported context overflow, retain the first half of the complete-loop segment instead of removing one loop.
- Preserve single-loop oversize reporting, confidence thresholds, source evidence, durable cursor advancement, and the existing per-run call budget.
- Add an offline regression covering budget-bounded progress, state reload, and eventual suffix coverage.
- Record the distinction between this reproduced recovery bug and low-confidence answers, which intentionally cannot advance a cursor.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `incremental-judgment-state`: reduce overflowing complete-loop prefixes geometrically so recovery does not repeatedly exhaust its budget before reaching an admissible prefix.

## Impact

- Production: `incremental.ts` only; no new dependency, configuration, cache schema, or service contract.
- Verification: `test/incremental.test.ts`, existing safety and offline lifecycle checks.
- No installed-copy update, global configuration change, live inference, commit, push, or release.
