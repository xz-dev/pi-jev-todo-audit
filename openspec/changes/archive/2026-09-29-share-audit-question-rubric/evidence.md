# Evidence

## Offline request size (bytes, not tokens)

Synthetic boards (active + pending tasks, n history entries), total request bytes before → after:

| board | n=5 | n=40 |
|---|---|---|
| 1 active | 8,911 → 8,751 (−1.8%) | 25,059 → 23,159 (−7.6%) |
| 1 active + 2 pending | 14,277 → 11,735 (−17.8%) | 33,295 → 27,273 (−18.1%) |
| 2 active + 2 pending | 18,862 → 13,921 (−26.2%) | 39,315 → 30,024 (−23.6%) |
| 3 active + 5 pending | 32,888 → 21,221 (−35.5%) | 59,081 → 39,584 (−33.0%) |

Real session prefixes (full unprocessed first audit), bytes:

| session prefix | questions | before | after |
|---|---|---|---|
| 09-25 (5 unfinished) | 21 | 91,314 | 76,798 (−15.9%) |
| 09-24 (4 unfinished) | 18 | 330,514 | 295,748 (−10.5%) |
| 09-26 (2 unfinished) | 12 | 166,740 | 155,617 (−6.7%) |

The longest single question drops from 1.7–12 KB to 0.6–5.4 KB, because the evidence-source labels shrink. This relaxes the 32k state-plus-longest-question limit.

## Paid A/B (authorized; TypeSafe direct, jev-latest, 2026-09-29)

The run used the real session `2026-09-26T12-18…` truncated to 214 entries: 2 unfinished tasks, 12 questions. Both arms had the same endpoint and model, a cold cache and the pre-split capacity path. Base arm A was commit 5cff520; arm B was this change. Each arm made one cold first audit.

| | A (old framing) | B (shared rubric) |
|---|---|---|
| attempts (all 200, pre-split 3) | 4 | 4 |
| question bytes per attempt | 12,810–14,841 | 6,995–7,856 |
| provider input tokens | 116,181 | 110,250 (**−5.1%**) |
| provider output tokens | 8,615 | 8,560 |

Answers (choice@confidence):

| question | A | B |
|---|---|---|
| alignment | aligned@0.71 | aligned@0.73 |
| current_match | 3@0.97 | 3@0.99 |
| drift | on_track@0.71 | on_track@0.73 |
| interaction | unclear@0.21 | unclear@0.56 |
| work_evidence | c59bcce8@0.85 | c59bcce8@0.89 |
| task_status_3 | still_ongoing@0.55 | still_ongoing@0.75 |
| task_status_4 | unclear@0.77 | unclear@0.55 |
| task_granularity_3 | appropriate@0.28 | appropriate@0.75 |
| task_board_3 | needs_reconciliation@0.60 | needs_reconciliation@0.24 |
| task_board_4 | unclear@0.05 | unclear@0.24 |
| task_evidence_3 | insufficient_evidence@0.45 | task:3@0.61 |
| task_evidence_4 | insufficient_evidence@0.67 | task:4@0.66 |

- 10 of 12 choices are identical.
- The two changed choices are evidence anchors. B picks each task's own `task:<id>` supplement where A answered `insufficient_evidence`.
- The verdict layer rejects a supplement anchor for completion and cancellation, and nothing in this run proposes either. The advice outcome is therefore the same: no correction, because both tasks are ongoing or unclear.
- `task_board_3` drops below the 0.5 threshold in B (0.60 → 0.24). In A it was not acted on either, because the task was not blocked or deferred.

**Caveats**
- This is one sample per arm and one session.
- Jev's run-to-run variance was not measured separately.
- The −5.1% applies to a request dominated by history. Multi-task boards save more (offline table above).

## Validation

220 Bun tests pass, typecheck is clean, `git diff --check` is clean, and `openspec validate --strict` passes.
