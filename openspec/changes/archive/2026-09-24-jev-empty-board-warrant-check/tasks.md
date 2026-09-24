# Tasks

## 1. Config path migration

- [x] 1.1 Update `config.ts`: replace `configPath()` with `agentConfigPath()` using `PI_CODING_AGENT_DIR` (fallback `~/.pi/agent`) + `jev-todo-audit.json`; add `projectConfigPath(cwd)` using `CONFIG_DIR_NAME`. Verify: `npm run typecheck` passes.
- [x] 1.2 Refactor `loadConfig` signature to `loadConfig({ globalPath, projectPath?, projectTrusted })`. Whitelist `PROJECT_ALLOWED_KEYS` (excludes `apiKey`/`apiKeyEnvVar`); filter project layer at parse time. Verify: `test/config.test.ts` new cases for project-override-trusted, untrusted-ignored, project-apiKey-dropped all pass.
- [x] 1.3 In `index.ts`, defer project-layer merge to first `session_start` (ctx provides cwd + `isProjectTrusted()`); store merged config on closure. Add one-shot warning when legacy `~/.config/jev-todo-audit/config.json` exists. Verify: `test/index.test.ts` covers trusted/untrusted branches.
- [x] 1.4 Update `README.md` config section to new path + project override + apiKey-scope rule. Verify: `grep "jev-todo-audit.json" README.md` hits both locations.

## 2. Warrant question on empty board

- [x] 2.1 In `typesafe.ts`: extend `AuditAnswers` with `board_warranted?: ChoiceAnswer`; in `buildAuditRequest`, add the `board_warranted` Choice question iff `visibleTasks(board).length === 0`. Verify: `test/typesafe.test.ts` asserts presence on empty board and absence on non-empty.
- [x] 2.2 In `verdict.ts`: on `no_in_progress_task`, check `answers.board_warranted` — `trivial`/`idle` → silent; `warranted` → existing inject path; missing (non-empty board) → existing inject path; low-confidence → notify. Verify: `test/verdict.test.ts` covers all four branches.

## 3. Regression

- [x] 3.1 Run `npm test` — all existing + new tests pass.
- [x] 3.2 Run `npm run typecheck` — clean.
