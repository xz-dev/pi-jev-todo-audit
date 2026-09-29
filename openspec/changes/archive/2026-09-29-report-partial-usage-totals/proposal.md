## Why

When any single attempt lacked usage, the audit diagnostics showed the total input and output as `"unknown"`. This happens, for example, on an overflow rejection. It threw away token counts that the provider did report for every other attempt. Cutting spend is the project's main goal, and the spend figures were lost exactly when a recovery happened.

## What Changes

- The audit usage total adds up what the provider reported. It also records `unreported` counts for each figure: input, output, and the charge where the channel reports one.
- When `unreported` is present, the total is explicitly a lower bound. Each attempt's row still records `"unknown"`, never zero.

## Capabilities

### New Capabilities

### Modified Capabilities
- `jev-todo-audit`: an observable cost total is the sum of reported usage plus unreported counts, instead of all-or-unknown.

## Impact

- Code: the usage shape in `ledger.ts` diagnostics, plus its tests and the README diagnostics paragraph.
- Ledger readers: `usage.inputTokens`, `usage.outputTokens` and `usage.costUsd` are always numbers. An optional `unreported` object marks an incomplete total. Evaluation, cache and verdict behaviour do not change.
