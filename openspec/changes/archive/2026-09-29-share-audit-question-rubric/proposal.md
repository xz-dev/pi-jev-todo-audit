## Why

Every request repeats the same long per-task instructions and option descriptions. The same lifecycle, evidence, board and granularity text is sent once per unfinished or active task. Each evidence question also repeats the full source list with a "kind; view view; source id" label that the records in state already carry. On real sessions this framing is 13–35% of the request bytes, and it grows with the number of tasks. The user's goal is lower JEV spend. They chose to do both a pure wording cut and a shared rubric moved into state, validated by a paid A/B test.

## What Changes

- Add one shared question rubric to state, only when there are unfinished tasks. It carries the full per-task rules: lifecycle meanings, evidence standard, board representation and the engineering granularity rubric.
- Each task question keeps its task scope (`ONLY #id "subject"`) and its full set of options, with short option descriptions and a pointer to the rubric.
- Evidence options keep the supplied source ids, labelled by kind only. The record in state has the rest.
- Bump the judgment version. Every cached answer is invalidated once, because the question definitions changed. The user accepted this migration cost now rather than later.

## Capabilities

### New Capabilities

### Modified Capabilities
- `jev-todo-audit`: audit request content states shared per-task rules once per request rather than once per task question.

## Impact

- Code: `typesafe.ts` (request builder, criteria text, judgment version). Tests assert that the rubric is present once in state and that questions stay scoped.
- No change to the answer schema, option keys, verdict logic, caching or capacity handling.
- Answer semantics can shift, because the model reads the rules from state instead of from each question. See evidence.md.
