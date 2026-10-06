## Context

See `proposal.md` for motivation and `specs/jev-todo-audit/spec.md` for the presentation contract. The user selected main-agent messages only, not backend JEV inputs/outputs, and confirmed creation of this planning change. Acceptance examples below are proposed for review, not claims of implemented or accepted behavior.

Current source already sends the same visible `content` through three `pi.sendMessage` sites in `index.ts`. `PLUGIN_ADVISORY` supplies a long prefix; `verdict.ts::decide` supplies another heading and closing acknowledgment disclaimer. Pi's default renderer supplies an additional custom-type label. An ordinary correction can also produce a `correction injected` notification. The installed audit checkout has the same relevant message source as this repository.

The relevant watchdog precedent is `pi-continue-watchdog/src/commands.ts::createWatchdogEventMessageRenderer`: render stored content, not a reconstructed summary. Its control protocol and inquiry folding are unrelated to this change. Pi converts custom content to user-role text in the inspected host; a colored box or `customType` alone cannot communicate plugin origin to the model.

Include this conditional design artifact because formatting crosses `index.ts` and `verdict.ts`, must preserve authority semantics, and needs a deliberate choice between raw-body display and a second summary. It does not justify a new messaging framework.

## Goals / Non-Goals

**Goals:** One source of message text; full task-specific default visibility with the shared footer available on expansion; short, action-first wording; unchanged delivery decisions; original historical text on replay.

**Non-Goals:** New event schemas, UI inspectors, collapsible protocol dumps, translation settings, timestamps, model-generated rewrites, new persistent state, watchdog integration or changes to service packaging. Keep existing English production wording; the exploration's Chinese example was illustrative, not a localization request.

## Decisions

### 1. Compose once at delivery; keep decisions where they are

Use a small shared formatter local to `index.ts` for the heading and one common advisory boundary. Have all three existing delivery sites pass their already-determined business text through it and existing redaction before `sendMessage`. Keep the existing custom type and `details.auditKeys`. Do not add a parallel `displayText`, reconstruct the body from details, or introduce a generic event/publisher abstraction.

`verdict.ts` continues to own the task suggestions and action-specific scope, including board-only restrictions and reported-versus-verified evidence. Remove its redundant generic heading/footer while preserving correction membership, ordering, source excerpts, uncertainty annotations, keys, `bookkeeping`, `execution` and `mayWake`. The formatter must not infer authority by parsing prose. Existing `deliverAs: "steer"` and conditional `triggerTurn` decisions stay at their current call sites.

**Alternative:** Separate human and model templates would drift and contradict the selected goal. Moving all verdict logic into a renderer would mix presentation and authority. Reuse the existing delivery seam instead.

### 2. Collapse only the shared footer; expansion shows the original

After inspecting real rendered examples, the user explicitly selected default-hidden, expandable shared footer. This supersedes the initial full-default-display choice, not the canonical body or its authority safeguards.

Keep the existing footer bytes in one local constant used by the formatter and renderer. The renderer uses Pi's native expansion flag and `Box`/`Text`: when collapsed, remove only an exact terminal match for that footer from a recognized canonical advisory. When expanded, display `message.content` unchanged. Do not search for arbitrary disclaimer-like paragraphs, strip matching evidence inside the body, add persisted display metadata, or create a second template. The three delivery sites and sent body remain unchanged.

Unknown historical endings, including an older footer or one changed by redaction, stay fully displayed. Preserve the host fallback for non-string historical content. Suggestions, evidence, question/report IDs, board-only restrictions and factual recovery limits are never folded. Add no new widget, command, summary, label or generated timestamp; use the native expand control. Rendering remains independent from review and headless delivery.

**Alternatives:** Permanent hiding would weaken the original transparency goal. Heuristic paragraph removal could hide actual instructions or evidence. Exact known-suffix folding is the smallest way to honor the user's readability choice while preserving complete inspection on expansion.

### 3. Shorten repeated prose, not safeguards or factual scope

Use this order for new bodies:

1. One heading naming the plugin and advisory kind.
2. Specific suggestion or limitation, followed by the affected tasks/questions and sanitized evidence.
3. Only the applicable action/recovery restriction.
4. One shared advisory boundary covering non-user origin, no new authorization, existing scope/waits, no interruption solely due to the notice, and no separate acknowledgment.

A board-only body remains explicit that the agent should reconcile the board and return control, not execute blocked tasks. Continuation wording preserves existing authorization rather than granting permission or asking for the same permission again. Normal progress can still explain a mistaken finding; no mandatory reply is introduced.

For Choice overflow, retain affected question IDs/counts, the limit including fallback, local withholding with no judgment/attempt, genuine applicability guidance and independently usable findings. For factual incompleteness, retain affected tasks, failed admission after progressing recovery, retained completed work and eligible public report IDs. Keep the optional brief shape usable and its source/coverage limitations intact. Combine related warnings into compact sentences instead of dropping them or promising that another identical brief will fix admission. No new arbitrary line, character, finding or report-ID cap.

Illustrative ordinary body, with final wording reviewed against the requirements rather than frozen as a byte-for-byte fixture:

```text
pi-jev-todo-audit | board update

Suggestion: Mark #5 "Parser" completed if its agreed scope is done.
Evidence [report-42] (assistant): "All agreed parser checks passed."
Basis: main-agent report, not independent execution verification.

Plugin reference feedback, not a user message, instruction or new authorization.
Consider at a natural checkpoint if still applicable; do not interrupt or switch tasks solely for this notice. Respect the user's latest scope, permissions and waits. No separate reply is needed.
```

**Alternative:** Deleting every disclaimer would shorten more, but lose source attribution after provider role conversion and weaken the previously agreed authority boundary. Moving those disclaimers to a separate hidden model message would violate parity. Consolidate them once instead.

### 4. Remove only duplicate delivery feedback

Delete the ordinary correction's `correction injected` notification branch. Preserve distinct dependency, uncertainty, failure, recovery and optional aligned notices with their current eligibility and UI-only delivery. Do not add a success heartbeat or make every audit produce conversation content.

Do not append `no message sent` to a generic failure path: Choice or factual clarification may already have been sent in that audit. An operational notice can describe its actual outcome without introducing delivery-tracking state. `notifyOnAligned` keeps its documented aligned-status purpose; it is not repurposed into a verbosity setting.

**Alternative:** Converting all notifications to custom messages would add model traffic and potentially affect idle/wake behavior. Removing every accompanying notification would hide distinct failures. Only receipt duplication is removed.

### 5. Verify at existing external seams, without live inference

Reuse Bun's existing `test/index.test.ts` scripted shared-service port and captured `sendMessage`/`ui.notify` effects, plus `test/verdict.test.ts` for existing safety coverage. Extend the harness to capture registered message rendering and render the actual sent body with native TUI components. Compare expanded content modulo styling/wrapping, not a second expected formatter. Use narrow and ordinary widths to check source IDs, multiline evidence and Unicode remain visible. Test stored old bodies directly, not regenerated current fixtures.

| Example | Observable acceptance evidence |
| --- | --- |
| A1: Ordinary #5 completion suggestion | One heading, task content fully visible by default, only the shared footer collapsed; expansion equals the complete sent body; source attribution/evidence retained, no duplicate receipt with `notifyOnAligned` either true or false. |
| A2: Terminal board-only and execution-eligible controls | Board-only text returns control without execution authority; already-authorized continuation retains its qualifier. Captured wake options and rejected planning-only restart match existing behavior. |
| A3: 256-option Choice and a supported sibling | Full question/count/limit and local-withholding clarification remains visible; genuine scope guidance does not authorize truncation; independently supported correction is not lost. |
| A4: Irreducible factual context | Full affected-task, public report-ID and source-obligation guidance; empty origins stay empty; no recovery promise, invented completion or new permission. |
| A5: UI-only failure and mixed outcome | Missing service sends no advisory; factual clarification followed by failure does not produce a false no-delivery statement; operational notices remain UI-only. |
| A6: Replay, resize and no UI | Old and new stored text survive rendering without regeneration; headless delivery is unchanged; reload alone does not re-arm a demand. |
| A7: Sanitization and semantic isolation | Existing redaction removes secrets from both readers; no extra review for rendering; same scripted inputs retain verdict actions, keys and delivery eligibility. |

Parity and several authority gates already pass in current source: label those checks as characterization. Demonstrate the genuinely unmet behavior with repeated headings/generic guidance or the duplicate receipt before implementing its slice. Prefer semantic assertions for required boundaries over pinning the entire old disclaimer. Reuse existing boundary/recovery tests instead of duplicating the review engine suite or introducing another test framework.

Run focused tests, `bun run typecheck`, `bun test` and the native Node ownership fixture during implementation. Test processes must not inherit production child-suppression ownership accidentally; isolate any override to the test subprocess. Optional cross-repository tests require explicit roots and must be reported as skipped when absent. Existing CI is `.github/workflows/test.yml` on Linux and Windows; do not claim those jobs passed without an actual run for the candidate. No paid provider call or installed-session mutation is needed for acceptance fixtures. Human review decides readability and final acceptance; a green suite alone does not.

## Risks / Trade-offs

- **Shorter prose changes authority meaning** -> Preserve board-only and existing-permission examples; verify text independently from unchanged wake gates.
- **Folding accidentally conceals task-specific instructions** -> Only the exact recognized shared footer may collapse; retain all business content and verify expansion against the captured sent body.
- **Historical entries or mocks assume the old prefix** -> Keep content/custom type/keys compatible, render old text verbatim, and replace brittle prefix assertions with the intended contract.
- **Full messages remain long for many genuine findings or report IDs** -> Remove wrapper duplication, not necessary content; no speculative clipping policy or inspector.
- **Other host extensions/provider transforms alter context later** -> Scope parity to this plugin's content/delivery boundary; do not claim provider-byte identity or that the model consumed a queued steer.
- **Unrelated installation work is already in the worktree** -> Do not change service entrypoints, dependency pins, packaging or that change's artifacts as part of this work.

## Migration Plan

1. Review this proposal, delta and examples. A new apply request is required; no implementation begins in this planning workflow.
2. Implement one message slice through the current delivery/rendering seam, prove its unmet and then satisfied behavior, and extend the same formatting to the two incomplete-context branches. Keep safety and transport checks intact throughout.
3. Update README presentation notes, run the listed offline checks and inspect the actual rendered examples. Report human readability acceptance, optional skipped checks and observed CI evidence separately.
4. No session/config migration is needed. Rollback restores prior code for newly generated messages; stored bodies and audit keys remain readable in either direction. Publishing, installing or restarting the user's active plugin is not included in this plan's execution authorization.
