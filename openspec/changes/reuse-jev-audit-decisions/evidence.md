# Implementation evidence

Offline evidence only. No live JEV request, reload, commit or release was performed.

## 1.1 Baseline and runtime identity (2026-09-29)

- Source baseline: `master@6b5de48` (`fix(audit): recognize live max_tokens_exceeded overflow contract`). The predecessor `ground-audits-in-visible-context` is implemented in this source and not yet synced to main specs.
- `bun test test/limits.test.ts`: 19 pass / 0 fail. The exact live body `{"detail":{"error_type":"max_tokens_exceeded"}}` is recognized by `isContextOverflow` and triggers the single existing recovery.
- The existing recovery has two terminal failure shapes: protected-only context (`reduceContext` returns `undefined`, one request, the first 400 is final) and a still-oversized reduced request (exactly two requests, the second 400 is final). Each audit emits at most one `failed:` warning.
- Loaded runtime identity:
  - `~/.pi/agent/settings.json` lists `git:github.com/xz-dev/pi-jev-todo-audit`; its checkout `~/.pi/agent/git/github.com/xz-dev/pi-jev-todo-audit` is at `6b5de48`.
  - Project `.pi/settings.json` (git-ignored) lists `packages: [".."]`, i.e. this local checkout.
  - Pi's `docs/packages.md` identifies git packages by repository URL and local packages by resolved path, so these two declarations have different identities and are not deduplicated by that rule.
- Observed user report (session `01a0eafc…`, entry `0b9fcf2e`): two identical `[jev audit @ loop 40] failed: HTTP 400: {"detail":{"error_type":"max_tokens_exceeded"}}` lines. Because one audit emits one warning and each loaded instance keeps its own loop counter, two identical lines at the same loop label are consistent with two loaded extension instances each failing once, not with two retries of one audit. This is an inference from source and settings; no audit/attempt identity was captured at the time, so it is not proven. Task 7.1 adds attempt identity so a future occurrence can be distinguished.
- Whatever the instance count, both failure shapes above leave the review unrecovered; that is the behaviour this change replaces.
- Cost implication, not a code task: if both instances load in this project, every eligible audit here is paid twice. Per-question caching cannot merge them (separate in-memory maps; both fire on the same `turn_end` before either can see the other's `appendEntry`). The user can check or fix this separately, e.g. by removing `".."` from the project `.pi/settings.json`. No settings change or reload was made.

## 1.2 Baseline replay corpus (master@6b5de48 behaviour)

Harness: `test/corpus.ts` drives the real extension through `/jev-audit` with a mock endpoint. `MOCK_CAPACITY` = 24,000 JSON bytes of state + longest question — an explicit test contract, not the provider tokenizer or its 32k/64k token limits. Answers are neutral valid choices so no correction is delivered. `textSeen/textTotal` counts distinct visible text markers that reached any request; `toolBodyLeaks` counts tool argument/output marker occurrences in request bodies.

| case | requests | rejected (mock overflow) | bytes | state bytes | question bytes | questions | text seen | tool-body leaks |
|---|---|---|---|---|---|---|---|---|
| tool-heavy (3 audits) | 5 | 2 | 132,702 | 94,900 | 30,939 | 45 | 3/3 | 78 |
| text-only + reply to JEV (3 audits, last unchanged) | 3 | 0 | 28,693 | 10,637 | 16,521 | 27 | 2/8 | 0 |
| short (2 audits, unchanged) | 2 | 0 | 15,742 | 3,906 | 10,954 | 18 | 1/1 | 0 |
| TODO revisions (3 audits) | 3 | 0 | 24,281 | 7,387 | 15,375 | 27 | 3/4 | 0 |
| mixed cached/new (partial answers, then full) | 2 | 0 | 20,868 | 4,336 | 15,436 | 24 | 1/1 | 0 |
| failed later chunk (oversized text, not ordinary) | 2 | 0 | 25,838 | 13,760 | 11,020 | 18 | 2/12 | 0 |
| **aggregate ordinary (first five)** | **15** | 2 | **222,286** | 121,166 | 89,225 | 141 | | |

Observations: unchanged repeats (short, text-only third audit) are fully re-paid; tool arguments/outputs dominate tool-heavy state and trigger mock overflow; the current collector drops most text-only analysis (2/8, 2/12) because it keeps only recent/linked groups; a partial response causes every question to be asked again. Byte counts are request-shape evidence only, not tokens or dollars.

Comparison rule for 4.3: judge on cases whose context changes between audits (tool-heavy, text-only, TODO revisions) and report unchanged-repeat cache hits separately, so zero-call repeats do not flatter the result.

## 4.1/4.2 Rolling conclusions (2026-09-29)

- `rolling.ts` `reviewRolling`: each stage sends retained reported work (user decisions, latest host summary, latest non-advice main-agent report, as authored, labelled `retained from processed range`) + current task supplements (once) + the unprocessed piece, and `context.rolling` = `{opinions, reportNote?, progress:{processedThrough, final}}`. Reports, opinions and progress are separate fields. A main-agent report over `REPORT_RETAIN_CHARS` is not repeated; a note asks for a concise current account instead of inventing prose.
- Ledger receipt = the `Rolling` object (single shape): restored only if all `answerKeys` are recorded and `through` is on the active branch; otherwise a full review. Progress advances only when `appendEntry` succeeds; intermediate receipts carry `<inputKey>:partial` and never reach `decide()`.
- Omissions inside already processed ranges are not resent. The per-tool "execution detail excluded" omission was removed: the header already states the projection and it grew with every call.
- `test/rolling.test.ts` 6/6: blocker + user decision survive a later opinion update; task body serialized once; old raw ranges not re-appended; oversized report → clarification note; unchanged input → 0 requests; failed write → frontier unchanged and next run 0 requests (cached); chunk-3 failure keeps chunks 1/2 and resumption sends only chunk 3; partial answers → no receipt, retry sends only the missing question; host failure → no advice, retry sends only unreviewed input.

## 4.3 Economics checkpoint (offline mock bytes, not tokens or dollars)

Same `test/corpus.ts` harness run against `6b5de48` (temporary worktree) and the candidate. `resent` = bytes of non-task records that were already part of an earlier *answered* request of the same case (resending after a rejection is not counted as re-buying). `rolling` = bytes of the opinions/progress block.

| case | req base→new | bytes base→new | state base→new | resent base→new | question bytes base→new | rolling | text seen base→new |
|---|---|---|---|---|---|---|---|
| tool-heavy | 5→3 | 132,702→37,741 | 94,900→15,477 | 23,180→162 | 30,939→18,626 | 1,247 | 3/3→3/3 |
| text-only + reply | 3→2 | 28,693→25,487 | 10,637→12,477 | 1,214→988 | 16,521→11,856 | 656 | 2/8→8/8 |
| TODO revisions | 3→3 | 24,281→26,120 | 7,387→8,225 | 80→97 | 15,375→15,955 | 1,227 | 3/4→4/4 |
| **changed-context sum** | **11→8** | **185,676→89,348 (−52%)** | 112,924→36,179 | **24,474→1,247 (−95%)** | 62,835→46,437 | 3,130 | 8/15→15/15 |

Reported separately (identical repeats, cache hits): short 2→1 requests (second audit answered locally, 15,742→8,004 bytes); text-only third (unchanged) audit 0 requests. mixed-cached 20,868→15,845 (partial answers: only missing questions re-asked).

Findings:
- Repeated processed input is reduced (−95% resent bytes), so the plan continues; no simplification pause is required by the 4.3 rule.
- TODO revisions is +7.6% bytes: rolling overhead (1,227) and task trajectories, while now also carrying the text the baseline dropped (4/4 vs 3/4). Short context: first audit ≈ baseline size; rolling adds 65 bytes.
- **Remaining cost is now mostly fixed question framing**: 46,437 of 89,348 changed-context bytes (52%). Instructions/criteria are resent on every cache-miss audit. Reducing them is not in tasks.md; it is recorded here as a user decision, not implemented.
- failed-later-chunk (not ordinary): see section 5 below.
- Byte counts are request shape only; live token/dollar savings need separately authorized replay.

## 5.x Resumable capacity recovery (offline mock, not tokens or dollars)

- Overflow order in `rolling.ts` `stage()`: context first — ordered halves at record boundaries, then ordered labelled fragments of a single text record (`fragment:{of,start,end,total}`, `FRAGMENT_MIN_CHARS`=1000, never splits a surrogate pair). Question batches (`evaluateBatched`, halving over one frozen state) only when question bytes exceed state bytes or the context piece cannot shrink. Irreducible scope → `context overflow: … ask the main agent for a concise current report of this task`, no receipt, no advice.
- `reduceContext` (crop once, then give up) was removed; its tests were replaced by `test/capacity.test.ts` (8/8 at the time; 10 after the 7.3 regression tests).
- Rejected exact envelopes (`envelopeKey` = rules, endpoint, model, state, asked questions) are kept in `cache.rejected`, persisted as ledger `{kind:"rejected"}` and restored: an identical envelope is never resent, including after reload (test: second host run sends 0 requests).
- A record is processed only after its last fragment; mid-record fragments are not receipts, so resuming rebuilds identical fragment stages that hit the cache (test: no completed stage state is paid twice after a later-fragment failure).
- Ordinary 401/413/422/429/503 errors still make exactly one call and never subdivide (`test/limits.test.ts`); transient retries stay in `runAudit` and are not applied to overflow.
- Host reports `context overflow recovered by subdivision` and no `failed` warning when subdivision completes.

Corpus `failed-later-chunk` (12 × ~4 KB texts, mock capacity 24,000 bytes; step `failNext:3` injects one 422):

| | requests | mock overflow 400 | injected 422 | bytes | resent (after answer) | text covered |
|---|---|---|---|---|---|---|
| baseline 6b5de48 | 2 | 0 | 0 | 25,838 | 4,126 | 2/12 (silently cropped) |
| candidate | 8 | 3 | 1 | 220,799 | 204 | 12/12 |

This is newly recovered coverage, not a saving: the baseline was cheap because it dropped 10/12 texts. Rejected requests account for 3 of 8 requests and roughly 90 KB of the bytes; whether rejected requests are billed is unknown. Ordinary aggregate (first five cases) is 11 requests / 113,197 bytes vs baseline 15 / 222,286.

## 6.1 Leader evidence contract (verdict.ts)

- Completion anchors: a main-agent report (`assistant` record) can support `actually_completed`; the advice text says “the supplied main-agent report states its completion scope (reported, not independently verified)”. A compact tool/shell event (`tool_call`/`tool_result`/`shell`), a summary, a supplement, an error or JEV's own advice cannot. Cancellation still requires a non-assistant decision.
- Header: “Leader review of the supplied reports and board (macro level; not independent verification of execution)”. Footer invites the main agent to reply with the reason when a point is mistaken; that reply is new input (context/ledger tests from 3.x).
- Kept: confidence floor, source-role checks, independent per-task handling, current-input freshness, execution permission only from user authority, unchanged-demand suppression.
- Tests: `test/verdict.test.ts` "leader evidence contract" (3 tests) and the unusable-source loop now covering tool_result/shell/summary/supplement; 56/56.

## 6.2 Manual modes (index.ts, typesafe.ts)

- `/jev-audit` → cache and rolling receipt; an unchanged repeat sends 0 requests and no duplicate message.
- `/jev-audit full` → no rolling receipt (whole projected history) and `evaluate(..., fresh: token)`: answers produced by this forced review are reused if a later stage fails and the command is retried; a new token is minted after a successful final outcome. Tool arguments/bodies stay absent (test asserts SECRET_COMMAND/SECRET_OUTPUT are not in the request).
- Unknown arguments → `Usage: /jev-audit [full] …` warning, 0 requests.
- Tests: index.test “manual modes …”, “an interrupted full review resumes …”; cache.test “within one forced review …”. The existing cadence/cooldown/terminal tests are unchanged and pass. Full suite 194/0; typecheck clean.
- The first index-test failure came from the fixture: it did not answer drift/task_board_5/task_granularity_5, so a repeat correctly asked only those 3 missing questions. The fixture now answers every question.

## 7.1 Diagnostics and corpus rerun (offline mock; bytes are not tokens or dollars)

- Every audit appends one non-context ledger record `{kind:"diag", diag}` (`ledger.ts` `diagnose`): audit id `session:seq`, label (`manual`, `manual full`, periodic, terminal-stop), `hits` (cache + joined) / `misses` (sent questions), processed `range {from,to}`, `outcome` (`unchanged`/`completed`/`recovered`/`incomplete`/`failed`), and one row per actual provider attempt (including retries, overflow rejections and later-stale responses) with outcome, status, model, `stateBytes`, `questionBytes`, `inputTokens`/`outputTokens`. Usage the provider did not report is `"unknown"`, and so is any total containing such an attempt; it is never zero.
- Diag records contain no transcript text and no credential (ledger.test asserts both). They are never replayed as evidence or cache (`restoreLedger` ignores `diag`) and they trigger no evaluation.
- Cache hit: an unchanged repeat records `outcome:"unchanged", misses:0, attempts:[]` and usage 0/0, so original usage is not counted again (ledger.test).
- Recovered overflow: attempt 1 `overflow/400/unknown`, later attempts `answered`, outcome `recovered`, and total input usage `unknown` because one attempt had none (ledger.test).

Corpus rerun after section 6 (identical to 4.3 / 5.x; section 6 changed no request shapes):

| case | requests | bytes | resent processed | text covered | tool-body leaks |
|---|---|---|---|---|---|
| tool-heavy | 3 | 37,741 | 162 | 3/3 | 0 |
| text-only+reply | 2 (+1 audit with 0) | 25,487 | 988 | 8/8 | 0 |
| short | 1 (+1 audit with 0) | 8,004 | 0 | 1/1 | 0 |
| todo-revisions | 3 | 26,120 | 97 | 4/4 | 0 |
| mixed-cached | 2 | 15,845 | 153 | 1/1 | 0 |
| **ordinary aggregate** | **11** (baseline 15) | **113,197** (baseline 222,286) | | | |
| failed-later-chunk (recovered coverage, not a saving) | 8 (3 overflow, 1 injected 422) | 220,799 (baseline 25,838 at 2/12 coverage) | 204 | 12/12 | 0 |

Comparable changed-context reduction, identical-repeat cache hits and recovered oversized coverage are reported separately, as in 4.3 and 5.x. Live tokens and dollars remain unmeasured (no authorization for live JEV calls).

## 7.2 README

Rewritten sections: overview (macro leader, spend goal, appendEntry persistence), When it audits (manual default/full/usage, TODO segment without paid call), What jev receives (visible text + replies, tools-as-events in both modes, task trajectory/firstActive), Remembered conclusions (three-part rolling result; "summary" = stored typed answers + retained reports, not a prose-generation call; per-question cache identity; same-session only), completion-anchor contract (report can anchor completion as "reported, not independently verified"; tool events/summaries cannot; cancellation needs non-assistant decision), Provider limits (32k/64k are provider limits, no 30k/character budget; subdivision order, rejected-envelope memory, irreducible diagnostic), Cost diagnostics, Verification (validate command now names this change; corpus bytes are not tokens/dollars). Each claim was checked against context.ts, rolling.ts, typesafe.ts, verdict.ts, index.ts, board.ts and ledger.ts, and against the captured-request tests.

## 7.3 Checks and deliberate breaks

- `bun test` 195/0; `npm run typecheck` clean; `git diff --check` clean (one blank line at EOF in test/context.test.ts fixed); `openspec validate reuse-jev-audit-decisions --strict` valid.
- Temporary mutations, each restored immediately (suite 195/0 afterwards):

| break | mutation | failing tests |
|---|---|---|
| cache hit | `typesafe.ts` never use a stored answer | 10 (cache reuse, partial answers, manual repeat, fragment resume …) |
| text-only | `context.ts` keep assistant text only when the message has a tool call | 28 (text-only turns, rebuttal re-evaluation, reported blocker survives …) |
| first-active | `board.ts` reset origin on every transition to in_progress | 2 (board origin through pending/resume; index turns 12/20/27/35) |
| resume | `rolling.ts` never commit a receipt | 10 (later-piece failure, fragment resume, reload, durable frontier …) |

## 7.3 Independent review (attempt 1: timed out, partial)

- A fresh-context `reviewer-final` ran read-only in a scratch copy and timed out after 30 min without a verdict. This is not an approval.
- Before timing out it reproduced the corpus numbers and the deliberate-break results exactly, and found one defect with a scratch repro:
  - **Defect (fixed):** `retainedFrom` applied its size guard only to the latest assistant report. A user or summary record that needed fragmenting was retained whole in every later audit. Repro: pass 2 made 5 requests, all 5 were 400s, and the whole huge user record was re-sent, ending in the irreducible diagnostic. Across audits, `processed` is rebuilt from the whole original records, so the fragment flag alone cannot detect this.
  - **Final fix:** the Rolling receipt carries `oversized`, the entry ids whose last fragment was committed. It is persisted in the ledger and restored on reload (a malformed list is dropped). `retainedFrom(processed, oversized)` excludes a user/summary record only when it was reviewed in fragments, and names it in `reportNote`. The latest main-agent report is still dropped when it is over `REPORT_RETAIN_CHARS` (4,000 chars) or fragmented. A long user constraint that fits is still retained. An intermediate version dropped every retained user/summary record over 4,000 chars; it was replaced before acceptance because it would have removed long user constraints after the first audit.
  - Tests: capacity.test "a fragmented huge user record is not re-sent whole…" (0 overflow requests, record absent from later states, `oversized: ["huge-user"]`) and "a long user constraint that fits is still retained on later audits" (~6,000-char constraint present in every later state); ledger.test "a receipt's oversized list survives reload…". Corpus unchanged (ordinary 11 requests / 113,197 bytes).

## 7.3 Independent review (attempt 2: completed)

- A fresh-context `reviewer-final`, read-only, returned **ACCEPT WITH FIXES**, with no blockers. It ran the full suite (198/0), typecheck and `git diff --check`, and verified the index.ts `full`/diag/commit paths, `evaluate` fresh semantics and cache identity, the verdict.ts 6.1 contract, the absence of tool-body leak paths, and README claims against source. It did not rerun the corpus or the break mutations; attempt 1 had reproduced both.
- Findings and disposition:
  1. minor, evidence.md stale after the fix was narrowed → fixed (the paragraphs above).
  2. minor, diag audit id `sid:seq` could repeat after reload → fixed: id is `sid:<load id>:seq`; test ledger.test "audit diagnostic ids stay unique across a reload…".
  3. minor, pre-existing (unchanged since 6b5de48): a host `summary` record can serve as the work source for execution readiness. Not introduced by this change; recorded as a follow-up for the user, not changed here.
  4. nit, untracked `.serena/` → not touched (local tool state; changing .gitignore is outside the tasks).
  5. nit, test-only seams (`RollingArgs.pieces`, `auditWithContext`, the `workVersion` fallback) → left; trimming is a follow-up.
- Final checks after fixes: see the task 7.3 completion line in tasks.md and the final report.
- Final checks: `bun test` 199/0, `npm run typecheck` clean, `git diff --check` clean, `openspec validate reuse-jev-audit-decisions --strict` valid.

## Review loop round 1 fixes

- **Cache identity:** `evaluationKey` now includes the question key, not only its definition — two identical question definitions under different keys no longer share one cached answer (test: cache.test "identical question definitions under different keys do not share a cached answer").
- **Branch-switch persistence:** every ledger write in auditNow (`onStore`, `onReject`, `commit`, `diag`) is gated on `current()`: not aborted, same session, and the entry the audit started on is still on the branch (`onSameBranch` — appended messages on the same branch keep the tip; a `session_tree`/`session_compact` switch removes it). Test: index.test "a late response after a branch switch appends no ledger entries to the active branch" (also verified it fails without the guard).
- **Incomplete final stage:** `RollingOutcome.complete` distinguishes "all pieces ran" (`final`) from "the last piece's required questions were answered" (`complete`). A missing answer no longer fails the result — it stays `ok` with `complete: false`, the range does not advance, the forced-review token is retained so a retry reuses completed answers, and the diag outcome is `incomplete`. Verdict still fails closed per missing answer, so a supported sibling correction is not suppressed (rolling.test "partial answers keep completed ones…" updated expectation unchanged).
- **Unique ids:** `/jev-audit full` and diag ids use `crypto.randomUUID()` instead of `Date.now()`; the ledger unique-id test no longer needs a wait.
- **inputKey:** now includes `JUDGMENT_VERSION` and `cfg.apiUrl`, so a completed receipt does not short-circuit after the endpoint or rules change (the in-memory cache already keys on both; this removes the receipt asymmetry).
- **Report retention (user decision):** `retainedFrom` keeps the most recent non-advice assistant reports newest-first within `REPORT_RETAIN_CHARS`, so a short reply like "Acknowledged." does not silently replace an earlier "…awaits security approval" report. A report over the budget alone is still dropped with the concise-account note; a fragmented record is never repeated whole. Tests: rolling.test "a short reply does not silently replace…", "only the reports that fit the compact budget are retained…".
- **Trajectory bound:** index.ts supplements serialize `revisionCount` plus only the last 5 segments; `firstActive` is unchanged. Test: board.test "task trajectory serializes at most the latest few segments…".
- **Interrupted-full test strengthened:** index.test "an interrupted full review…" now fails only the *second* stage after the first was admitted, so the retry provably pays only the failed stage.
- **README:** documents the always-retained user decisions (and the long-uncompacted-session ceiling with its concise-report diagnostic), and that a failed receipt write still delivers the correction while progress does not advance.

Checks: `bun test` 204/0, `npm run typecheck` clean, `git diff --check` clean, `openspec validate reuse-jev-audit-decisions --strict` valid. Corpus: ordinary aggregate 11 requests / 118,082 bytes (vs 113,197 before) — the delta is the `revisionCount` field and retaining more reports; bytes are not tokens or dollars.

## Review loop round 2 fixes

Round 2 reviewers (two fresh-context targeted reviewers on the round-1 diff) found three P1 defects in the round-1 fix blast radius, each with a scratch repro. Fixes and their revert checks:

- **P1-A — incomplete terminal review could still wake the agent (verdict.ts):** when the final stage was incomplete, `decide` ran with missing answers, and a missing `task_granularity_<id>` bypassed the "blocked" check so a terminal audit with `task_status=actionable_now` sent CONTINUE + `triggerTurn:true`. Fixed inside verdict.ts: for an in_progress task, CONTINUE now requires that task's granularity verdict to be present (pending tasks are never asked the question). Other missing answers already fail closed (`strong()`); independently supported board-only corrections are still delivered. Tests: verdict.test "an incomplete final piece cannot wake the agent…" (missing granularity → no CONTINUE; same with a supported sibling blocker → BOARD ONLY, no CONTINUE; granularity present → CONTINUE) and index.test "an incomplete terminal review cannot wake the agent for an active task" (host level: omits `task_granularity_5` from the response → nothing sent). Revert check: removed the guard, the scratch repro sends CONTINUE and both tests fail.
- **P1-B — retained report budget measured text only (rolling.ts):** `REPORT_RETAIN_CHARS` now bounds the serialized record (`safeJson` of the retained record, ~160 bytes of envelope per tiny report), not `r.text.length`. Newest-first selection and chronological output unchanged; omitted reports emit "N older main-agent reports omitted by the compact report budget" via the existing `reportNote`. Tests: capacity.test "many tiny retained reports are bounded by serialized record cost…" (160 tiny reports → second audit fits the 24,000-byte mock capacity with no overflow; newest kept, omission disclosed) and rolling.test "only the reports that fit the compact budget are retained…" updated for serialized sizing. Revert check: restored text-length budgeting, the capacity test's second audit overruns (400s) and fails.
- **P1-C — trajectory cap dropped unprocessed revisions (index.ts):** `revisions.slice(-5)` discarded ordered review of segments not yet processed (a TODO revision's tool event carries only name/status). `contextFor` now takes the actual `processed` set (receipt `through` on this branch): all revisions whose snapshot entry is unprocessed are kept in order; only already-processed history is bounded to the latest 5 segments; `firstActive`/`revisionCount` are unchanged. The computation moved into `auditNow` (after `processedEntries`), so `full` reviews see the whole history. Test: index.test "task trajectory keeps every unprocessed revision…" (9 unprocessed revisions → all supplied; after processing, processed tail bounded while new revisions all appear). board.test "task trajectory serializes at most the latest few segments…" replaced — it recomputed its own `slice(-5)` and passed even with the production cap removed. Revert check: restored `slice(-5)`, the test fails (segments `["e4"…"e8"]` instead of `["e1"…"e8"]`).

Owed tests landed:

- **T4** ledger.test "audit diagnostic ids stay unique…": the 2 ms wait is gone; `Date.now` is frozen to a constant across reload so a timestamp-based id collides (verified by mutating `LOAD_ID` to `L${Date.now()}` → `s:L1700000000000:1` twice; uuid passes).
- **T5** index.test "the processed frontier is scoped to its endpoint…": same branch audited to a durable receipt, then a host with a different `apiUrl` re-evaluates (requests 1→2 instead of an unchanged 0-request repeat).
- **T8** index.test "an interrupted full review…" now asserts the retry's question keys equal exactly the failed stage's misses (`toEqual`), not only a request count.

Checks: `bun test` 209/0, `npm run typecheck` clean, `git diff --check` clean, `openspec validate reuse-jev-audit-decisions --strict` valid. Corpus (`bun /tmp/corpus-run.ts`): ordinary aggregate 11 requests / 117,006 bytes (118,082 before round 2; the serialized-budget sizing shaves ~1 KB of retained-report overhead). bytes are not tokens or dollars; failed-later-chunk stays 12/12 recovered coverage reported separately.

## Review loop round 3 (final) fixes

Round 3 (one fresh-context targeted reviewer) confirmed P1-A, P1-B and T5 resolved, and found:

- **P1 — the round-2 trajectory rule re-bought unchanged work.** Making the supplement depend on the processed set meant a durable receipt changed the task record: an unchanged second `/jev-audit` re-asked all nine questions, and 1,000 unreviewed revisions made a protected supplement no subdivision could shrink (irreducible under the 24,000-byte mock). **User decision: return to a stable bound.** `contextFor` no longer takes `processed`; each supplement carries `firstActive`, `revisionCount` and the latest five revision turns, derived from the branch alone. Every revision still reaches jev in order as a projected `todo` tool event (name/call/status only). Test: index.test "task trajectory is bounded, stable across an unchanged repeat, and keeps its first-active origin" (8 revisions → segments e4–e8, origin e1, tool events e0–e8 in order; unchanged repeat after a durable receipt sends 0 requests; 1,000 revisions stay at five segments). Revert check: restoring the round-2 processed-set rule fails the test.
- **P2 — T4 froze the clock after the first load.** The freeze now spans both loads. Revert check: `LOAD_ID = String(Date.now())` fails the test.
- **P2 — T8 did not exercise a multi-stage forced review.** Replaced by capacity.test "host: an interrupted `full` review retries only its unfinished stages" (long text-only history under a 24,000-byte mock; the stage containing `TEXT_LG_11` fails with 422; the retry never resends a completed stage state and resumes past `TEXT_LG_0`). The old index.test variant was removed. Revert check: disabling fresh-token cache hits in `evaluate` fails the test.

Checks: `bun test` 209/0, `npm run typecheck` clean, `git diff --check` clean, `openspec validate reuse-jev-audit-decisions --strict` valid. Corpus: ordinary aggregate 11 requests / 117,006 bytes (mock request bytes, not tokens or dollars); failed-later-chunk 12/12 recovered coverage, reported separately.

## Live smoke (authorized, 2026-09-29)

Real Pi 0.87.1-xz in RPC mode, `-ne -e <repo> -na --offline`, on a `--fork` copy of a real 975 KB project session (source session file unchanged; copy under `/tmp/jev-smoke/sessions`). Two `/jev-audit` commands against the live TypeSafe endpoint (`jev-1.13.0`):

- Audit 1: 90 question misses, outcome `recovered`. 15 attempts: 8 answered (200), 7 context overflows (400, usage unknown). Answered attempts: 170,945 input tokens / 6,278 output tokens (provider-reported); state 310,756 bytes vs question 36,635 bytes (question framing ≈10.5% of answered bytes). Rejected attempts carried 746,994 bytes; whether overflow rejections are billed is unknown.
- Audit 2 (unchanged repeat): 0 requests, outcome `unchanged`.
- No advice was injected; no agent turn ran.

Observations: in a long real session the question-framing share is small (the 52% corpus figure reflects tiny mock histories). The dominant avoidable cost is overflow probing: subdivision starts from the full 211 KB state and halves, and later stages re-probe sizes above the largest already-admitted request (~43 KB state). The diag aggregate `usage` is `unknown` whenever any attempt lacks usage, even though answered attempts report tokens.
