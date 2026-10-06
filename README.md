# pi-jev-todo-audit

A [Pi](https://pi.dev) extension that checks whether the [`@juicesharp/rpiv-todo`](https://www.npmjs.com/package/@juicesharp/rpiv-todo) board matches the work visible in the conversation. It builds task-specific Choice questions and obtains accepted judgments through [pi-llm-as-jev](https://github.com/xz-dev/pi-llm-as-jev)'s `reviewVersion: 1` service, using its selected native classifier or discrete LLM backend.

jev acts as a **macro-level engineering lead, not a worker**: it sees goals, task definitions, reported outcomes, broad progress, user decisions and open questions, not execution detail. The extension is advisory. It replays persisted `todo` snapshots, never mutates tasks directly, and asks the main agent to make any justified update.

The design goal is to avoid paying again for unchanged judgments without hiding required facts. Audit owns business questions, source projection, scheduling, receipts and safe advice; the shared service owns backend selection, native policy, raw cache, capacity/recovery and attempt accounting. Pi owns authentication and transport. Reports, advisory opinions and processing progress remain separate. Persistence uses non-context Pi `appendEntry` records; there is no database or summarizer model. Offline reuse checks do not guarantee lower live billing.

## Install

```sh
pi install git:github.com/xz-dev/pi-jev-todo-audit
```

On the first normal load of a persistent managed installation, the separately
filterable `judgment-service.ts` entry installs and registers
`git:github.com/xz-dev/pi-llm-as-jev` through Pi's native package manager if no
service is already selected. No second manual service-install command is needed.
This can access the network and adds one independent package declaration in the
audit installation's user scope or trusted-project scope. Unknown/direct-file
scope, untrusted project loading, offline mode and inherited-owner suppression
never authorize a guessed global registration.

The new source has **no audit-imposed commit, tag, branch or version pin**.
Existing service sources, user pins and resource filters take precedence, even
if the selected service is missing, disabled, incompatible or failing. Audit does
not replace it, re-enable it or fall back to a nested copy. An already-selected
extension that fails in Pi's native loader can stop startup before audit runs;
repair that selection through Pi's normal package management.

### Update and resource controls

```sh
pi update --extensions
```

The independently registered service participates even when audit has no new
commit or no audit session is active. Use the normal reload/restart to activate
updated code. Audit neither fetches updates on every startup nor resets the
service to an older revision. A newly provisioned compatible service is usable
in the first startup; subsequent reloads let Pi load it directly.

To disable only automatic provisioning, exclude `judgment-service.ts` from the
audit package's extension resources while retaining `index.ts`. For the
unqualified Git source, the package selection is:

```json
{"source":"git:github.com/xz-dev/pi-jev-todo-audit","extensions":["index.ts"]}
```

Keep your actual source/ref and unrelated settings when changing resource
selections. This does **not** disable a service already registered independently;
its own package resource controls apply separately (for example, `extensions: []`
on its existing selection). Removing audit does not automatically remove that
shared service, its configuration or credentials.

Business `enabled: false` does not turn off provisioning or hide commands:
`/jev-audit` reports disablement without judgment/advice/receipts, and
`/jev-audit-service` reports service capability availability without installing,
saving settings, resolving credentials or running inference. Each command exists
only when its corresponding resource is loaded in an eligible process; explicit
filters and child-owner suppression still apply. The provisioning entry uses its
own provenance even when `index.ts` is filtered out.

### Installation is not backend readiness

Requires a loaded **pi-llm-as-jev service with `version: 1`, `reviewVersion: 1` and `review()`**. Native reviews use the xz-dev fork's released classifier API and public `fetch` option; no private Pi observation patch is required. Configure model selection in the shared service and credentials/endpoints in Pi (see [Configuration](#configuration)). An already-loaded extension continues running its old code until reloaded/restarted; updating files alone does not validate the running process.

Startup diagnostics distinguish installation, registration and activation failures.
A successful clone alone is not durable registration or backend readiness. Audit
makes at most one provisioning attempt per activation, never installs from an
audit callback, and does not switch authentication methods on failure. Later
normal loading can retry an unregistered attempt; registered selections remain
under Pi's ordinary repair/update handling.

Discovery happens at each eligible audit. If the service is absent or older, automatic auditing skips with a bounded dependency notice and manual auditing reports a clear error. Audit-owned provisioning failures do not disable ordinary TODO/main-agent work or send a readiness probe; there is no direct-HTTP fallback. Loading the compatible service later permits the next normally scheduled/manual audit.

## Main processes only

The extension owns its process through `PI_JEV_TODO_AUDIT_OWNER_PID`, using Node.js `process.env` and `process.pid`:

- An unset or empty marker is set to the current PID. Independently started Pi processes each own themselves; no subagent framework flag is required.
- The same PID stays eligible on `/reload`, session replacement, and in-process main-agent forks. Session shutdown does not clear the marker.
- A different or malformed nonempty marker skips the extension before configuration, credentials, event handlers, or commands are registered. Inherited child and grandchild processes therefore have **no automatic or manual JEV audit**, including `/jev-audit full`.

Do not put this runtime marker in shell profiles, machine settings, or project config. Normal OS/Node environment inheritance passes it to descendants; the extension does not modify the launching shell. Existing children started before the owner claimed the marker are not retroactively marked.

This is an inheritance convention, not a security boundary or universal agent-role detector. Same-process SDK children, processes whose launcher strips the environment, and remote/container PID namespaces cannot be reliably classified this way. Same-process child launches must exclude JEV; explicitly loading it into such a child is not protected by a PID comparison. Headless main sessions remain eligible. The guard uses APIs shared by Windows and POSIX systems, not `/proc`, process commands, or shell parsing; platform execution is checked separately below.

## When it audits

- **Periodic:** every 10 completed loops by default, except when at most 10 loops have elapsed since the latest user message. A skipped audit is not deferred.
- **Manual:** `/jev-audit` bypasses interval and cooldown but still reuses stored results and reviews only new input; an unchanged repeat makes no request. `/jev-audit full` forces a fresh reassessment of the whole projected history (still without tool arguments or bodies). If a forced review fails partway, retrying `full` in the same extension load reuses its fresh-review token and completed parts; a new load does not retain that in-memory token. After success it becomes the ordinary baseline; the next `full` starts a new fresh review. Any other argument prints usage and sends nothing.
- **Optional terminal check:** consumes `user-ready` on `pi:semantic-hook:v1` when [pi-continue-watchdog](https://github.com/xz-dev/pi-continue-watchdog) publishes an autonomous stop (`AI_UNLOCK`, `ERROR_UNLOCK`, `EXHAUSTED`, `DECISION_FAILED`). An empty/all-finished board needs no terminal check. Without that producer, periodic/manual audits still work; no watchdog dependency is imported. Human-abort kinds are not accepted.

Stop metadata is evidence, not proof of completion or permission to resume. Rewording a stop reason is not new work. New user decisions, work results or board changes can permit a new audit under the same stop reason.

A TODO snapshot change starts a new state segment for review, but **does not trigger a paid call by itself**; cadence and cooldown are unchanged.

The service writes validated answers before checkpoint references. Audit advances its business frontier only from acknowledged durable progress and a successful, still-current business receipt append. If persistence fails, valid final choices can still support advice, but no durable frontier is claimed and a reload may need new provider work. Failed/aborted reviews have empty final answers; already committed earlier stages remain historical progress, not permission to act.

## What jev receives

The collector uses Pi's public, compaction-aware `buildContextEntries()` and keeps chronology and source identities:

- **Visible text:** every user, assistant and visible custom message, in order. Text-only analysis counts as possible work, not inactivity. When the main agent answers or rebuts earlier jev advice, the reply and the advice it answers are both sent, so the reply can revise jev's conclusion. jev advice with no later reply is dropped from the input and never becomes evidence.
- **Tools and shell as events:** only `{tool, call, status}` with status `returned`/`error`/`cancelled`/`pending`/`unknown`. Arguments, commands, file contents and result/log bodies are **never** sent, in ordinary or `full` review. Unknown tools need no adapter. A returned call does not establish that a task is complete.
- **Task supplement:** the current board and full visible task records (description, owner, dependencies, metadata), plus each task's trajectory: `firstActive` (the turn it first became `in_progress`), `revisionCount`, and the latest five revision turns (derived from the branch alone, so an unchanged repeat stays a cache hit). Every revision still appears in order as a projected `todo` tool event. Updates, pauses and resumptions do not reset `firstActive`; granularity is judged from that origin to the latest turn.
- **Summaries:** host compaction/branch summaries are labelled derived material, not execution evidence.

If the host lacks the effective-context API, the visible branch is used with an explicit incomplete-global-context marker; global-context-dependent splitting is disabled. Abandoned branches are not replayed.

### Reported facts and remembered conclusions

Processed input is represented by a **rolling result** that keeps three things separate:

- **Reported work:** permitted user decisions, the latest host summary and non-advice main-agent/custom reports from the processed range, re-sent as authored and labelled `retained from processed range`, plus current task records. User constraints are never silently dropped. A 4,000-character allowance, an old selected primary or a `covers` list does not establish that another report is dispensable. Reports with uncertain primary eligibility stay available, including the original permitted body after fragment processing. This can grow the required floor until admission is impossible; the diagnostic preserves completed work and discloses the incomplete scope rather than silently cropping it.
- **jev opinions:** the latest validated answers, sent as `rolling.opinions` (derived and revisable).
- **Progress:** the reviewed frontier `processedThrough`, stored as a receipt.

Here "summary" means these stored typed answers and retained reports. It is **not** a free-form prose generation call: nothing asks jev or another model to write a summary.

The service caches raw answers by selected backend/model/effective thinking/transport, exact fixed facts and individual question, ordered evidence/metadata/genuine bounds, prior opinions and finality. A changed fact or reference cannot inherit an answer merely because labels or a cursor match. Adding independent C need not repay unchanged A/B; changing native thresholds only rechecks raw values. Service judgments/checkpoints and audit business receipts are non-context, active-branch records. Old audit receipts remain readable, but old audit evaluations are never relabeled as new service cache data. A compatible checkpoint can seed advisory opinions for new input; necessary factual sources must still be supplied. Missing original material after compaction remains a gap, not a fact rebuilt from opinions.

### Optional current task account

Ordinary task descriptions and public reports remain useful without a new field. To expose a current account, the main agent can include `metadata.auditBrief` in a public TODO record:

```json
{
  "metadata": {
    "auditBrief": {
      "text": "Parser acceptance checks are reported passed; rollout still awaits user approval.",
      "sources": ["acceptance-report-id", "user-decision-id"],
      "covers": ["investigation-report-id"]
    }
  }
}
```

Use actual permitted source IDs from the active history or audit feedback, not the example placeholders or invented origins. The containing task provides object scope. `sources` lists supporting references, **not an exclusive evidence allowlist**; `covers` declares earlier main-agent reports represented by the account, **not that their primary eligibility has expired**. The body is serialized once in the task supplement. Its factual index preserves original source roles and reference gaps.

The internal `factualMaterial.valid` means shape/reference validity only, not truth or semantic completeness. Missing, unsupported or unverifiable origins remain explicit. A brief is reported data, never independently verified execution or new user permission; a task supplement alone cannot anchor completion. Later user decisions and other tasks' needed facts remain protected.

A legal brief can clarify facts and relationships, but does not automatically shrink state or bound candidates. If 260 reports may still be needed as primary sources, merely listing them in `covers` cannot make that evidence Choice usable. Repeating the same account does not guarantee admission or recovery.

### Privacy and missing information

Hidden thinking, private custom entries, raw images/binary content, and known credential fields/forms are excluded. Recognizable authorization headers, private keys and common token forms are redacted; legacy keys already read from allowed configuration layers are retained **only for redaction**, including ignored trusted-project file keys. Unsupported content, redaction and serialization gaps are disclosed. Required missing user/task evidence prevents a correction; unrelated tasks can still receive independently supported corrections.

The extension does not read credential stores or export system prompts, skill catalogs or private agent state to enrich evidence. Visible conversation text crosses the selected service backend's provider boundary; tool arguments and result bodies do not. Heuristic redaction cannot discover every unknown secret embedded in arbitrary prose. Unrecorded dialogs/widgets and out-of-band decisions are unavailable evidence, never inferred approval.

## How corrections are selected

Every unfinished task has its own lifecycle, evidence-anchor and board-reconciliation questions. Every active task also has its own granularity question. Alignment, matching, drift, interaction state and current-work evidence share the same state; `board_warranted` is asked only when nothing is active.

Audit consumes the service's accepted final choices and does **not** numerically re-gate them. For native classifiers, `confidenceThreshold` (default 0.5) is passed to the service, which validates native numerical fields and drops answers below policy. Ordinary LLMs choose discrete outcomes, never self-rated percentages; compatibility confidence numbers do not authorize advice. An evidence anchor must reference a complete supplied non-advice source. Missing/unknown answers or sources cannot authorize an action. Explicit local withholding for one task does not suppress a supported independent sibling; a provider response missing required answers fails the review with empty final answers.

- **Completed:** reconcile that task only. A user decision or a main-agent report can anchor it; a report is described as *reported, not independently verified*. A tool/shell event, a summary, a task record, an error result or jev's own advice cannot.
- **Cancelled:** needs a non-assistant decision (e.g. the user); a main-agent report alone cannot cancel scope.
- **Blocked/deferred:** update only a concrete missing/incorrect board representation. A description or arbitrary metadata can already represent the wait; no designated key is necessary.
- **Ongoing:** unfinished, not permission to resume.
- **Actionable now:** a supported authorized next action, with no unresolved input/dependencies. A matching task ID alone is never enough to claim or continue it, and an assistant report is never new user permission.
- **Future/unclear:** do not infer that the agent should start it.

Completed, cancelled, deferred, blocked or future tasks cannot simultaneously receive claim/continue/split instructions. New user scope takes precedence over an older board plan. Drift corrections name supported actionable work rather than blindly choosing the next pending task. Empty/all-done boards with trivial or idle activity do not create busywork.

Advice reviews supplied reports and board state, not independently verified execution. Mistaken or already satisfied suggestions can be disregarded. No separate reply is needed; explanations in normal task progress can inform the next review.

### Engineering-grounded task size

Granularity follows established practice, not a fixed size score:

1. Match the item's level and authorized purpose: feature/story, implementation/investigation task, or waiting item.
2. Identify evidence that would establish completion of its scope.
3. Check that a concrete next action is known; distinguish uncertainty from waiting for permission.
4. Look for useful progress, feedback or handoff checkpoints.
5. Split only when evidenced outcomes/checkpoints improve verification or coordination without losing coherent value or duplicating existing tasks.

A multi-file vertical slice with many tests can be one coherent outcome. One large goal can still need smaller verifiable checkpoints. Unclear completion criteria or next actions call for clarification, not automatic subdivision. Multiple simultaneous active tasks are not themselves an error. The granularity question covers the task from its first `in_progress` turn to the latest turn.

Age beyond `staleAuditSpans × interval` is **diagnostic only** (a boolean flag). It never forces splitting, even on an otherwise aligned board. Loop age is not task effort, an industry-standard timebox, or a calibrated service-level expectation.

Practice references: [Wake's INVEST and SMART tasks](https://xp123.com/invest-in-good-stories-and-smart-tasks/), [Humanizing Work's story-splitting guide](https://www.humanizingwork.com/the-humanizing-work-guide-to-splitting-user-stories/), [Allen's next-action guidance](https://gettingthingsdone.com/2011/02/how-is-a-next-action-list-different-from-a-to-do-list/), and [The Kanban Guide](https://kanbanguides.org/english/).

### Waiting, repetition and stale results

Ordinary corrections, `CHOICE CONTEXT INCOMPLETE` and `FACTUAL CONTEXT INCOMPLETE` advisories share one persisted body between the main agent and the user transcript. The default view hides only the recognized shared generic footer; expand the message to see the complete original text. Suggestions, evidence, task/source scope, board-only restrictions and recovery limits always remain visible. There is no separate summary or extra plugin label. Styling and wrapping may differ; reopening or redrawing preserves the stored wording, and unrecognized historical endings remain fully displayed rather than being guessed or rewritten.

Each new body starts with one `pi-jev-todo-audit` heading, followed by its concrete suggestion or limitation and task/source scope. One common boundary identifies it as plugin reference feedback, not a user message, instruction or new authorization. Consider it at a natural checkpoint without interrupting or switching tasks solely for the notice; the user's latest scope, existing permissions and wait conditions still apply. No separate reply is needed. Steer delivery and terminal-wakeup gates remain unchanged.

The visible advisory is its own delivery feedback: no extra `correction injected` notification is emitted. Dependency, uncertainty, failure, recovery and optional aligned notifications remain UI-only status, not main-agent instructions. An audit can send a clarification and subsequently report failure; that failure does not mean no message was sent. Backend JEV request/response traffic is not exposed by this presentation.

A supported correction includes task IDs and sanitized source excerpts, delivered through the existing custom-message steer path. Terminal execution needs explicit actionable-now evidence; merely unfinished work never wakes the agent. A concrete missing board annotation may permit **one board-only turn**, expressly instructing the agent to reconcile the board and return control without executing the blocked task. Split/clarification advice alone does not trigger a terminal restart.

Persisted correction keys suppress unchanged task/issue demands across reloads. Loop count, reworded stop reasons, previous audit messages and ordinary assistant acknowledgments do not re-arm them. Recording a requested blocker is reconciliation, not a reason to repeat it. New user/work evidence and meaningful task changes permit reconsideration.

Results invalidated by user, board, branch or session changes while a request is in flight are discarded. New stop evidence queued after invalidating an older request still receives its own check.

These gates validate supplied judgments and prevent deterministic contradictions. A real source citation does **not** prove the model interpreted that source correctly. The main agent remains responsible for acting within the user's authorization.

## Provider limits, not application quotas

### Choice definitions: at most 255 options

Every outbound Choice is checked at the shared unresolved-question boundary and on direct calls, including automatic, manual and `full` paths. The 255 count includes all fallback entries: **254 candidates + one fallback is eligible; 255 + one is withheld locally**. Board matching follows the same rule; no task identities are silently removed to fit it.

Per-finding manifests use supplied sources and explicit applicability. Known other-task supplements can be scoped out when there is no source/dependency relation; uncertain public report associations remain candidates. No keyword/title filtering, first/newest-254 crop, source-selection model call or probability-preserving paging is used.

An over-limit question is not sent, tested with an admission probe or recorded as a context rejection. It gets no fabricated answer, confidence, token usage or successful affected receipt. Compatible exact cached answers and valid independent corrections remain usable; if no unresolved questions can be sent, there is no empty request.

The existing steer channel reports `CHOICE CONTEXT INCOMPLETE` once for unchanged input, names the affected questions/counts and does not wake task execution. It asks for genuine scope information when available, not the deletion of necessary sources. A structurally valid account alone may be insufficient; repeating it is not promised to unlock the finding. The scope remains incomplete if a complete necessary candidate set still cannot be safely bounded.

### Token admission and recovery

The shared service, not audit, owns these mechanisms. Review recognizes
TypeSafe-direct Jev's 64k request-wide / 32k state-plus-longest-question profile
and OpenRouter System One's 32k / 32k profile at known endpoints. Other routes
use the selected model's context window; exact per-model overrides belong in
`llm-as-jev.json`. Audit `contextLimits` and `apiUrl` no longer affect admission
or routing. No local character quota, fixed record cap or summarizer call is
introduced.

The service measures the actual serialized unanswered envelope, including
advisory state and metadata, and learns tokens/byte within a transport-specific
channel. Missing usage is unknown, not zero; later usable lower-density successes
can correct estimates, including after reload. Predictions and pre-splits are
not provider attempts or actual rejections. A fixed-state overestimate gets one
useful admission of the unanswered batch, rather than multiplying work by every
record and question. Exact known rejections remain protected even when size
hints are corrected.

Recovery reduces the constrained dimension: ordered evidence, Unicode-safe
fragments with genuine bounds, or independent question batches sharing the same
frozen prior opinions. The service retains valid partial members and completed
stages; retries send only compatible unresolved work. Audit advances a whole-
source frontier only at its completed final fragment. Required retained facts
remain fixed. If they cannot fit with an irreducible fragment/question, the
scope stops with `FACTUAL CONTEXT INCOMPLETE`, not a Cartesian traversal or a
silent crop. A current task account can clarify facts but does not erase their
source obligations or guarantee admission.

**Traversal is not factual completeness.** A final view still containing a
partial public source may lack an earlier constraint and cannot authorize a
completion or continuation. The current collector supplies no trustworthy
other-task scope for such public text; it must not infer independence from a
title, selected answer or remembered opinion. This differs from explicit local
Choice withholding, where complete source-backed sibling findings remain usable.
Complete-source controls and adversarial missing-early-constraint cases are
checked separately.

Ordinary validation, authentication, rate/quota, generic payload-size and unknown
errors never authorize context subdivision. Pi owns bounded native transport
retries. LLM review disables SDK retries; audit owns neither retry policy nor a
fallback client. A successfully recovered review reports recovery rather than
treating its initial overflow as the final failure.

## Cost diagnostics

Each audit writes a non-context `jev-todo-audit-ledger` business diagnostic:
audit id/label, question hits/misses, processed range, outcome, local withholding,
and the service's authoritative `ReviewDiagnostics`. Service attempt ids identify
newly owned provider work; neither logical review calls nor `reuse.sent` (question
count) establishes HTTP count. Predictions/rejected-envelope reuse are separate.

Check `service.observationCoverage` first. `unavailable` is an isolated accounting
failure, **not evidence of zero expense**. For observed attempts, `phase: start`
means unfinished at settlement; retries, malformed responses and overflows remain
accounted. Each provider usage field has `knownSum` and `missing`; absent values
remain unknown and incomplete totals are lower bounds. Reported `costUsd` is
separate from optional `catalogCostUsd` estimates. Native reported charges do not
imply a catalog estimate exists. Cache hits and joined callers add no new owner
charge. The legacy flat diagnostic view is compatibility data; use the nested
service coverage and presence fields to interpret it.

Diagnostics contain no transcript bodies, credentials or raw provider extras,
and do not trigger inference. Bytes describe serialized shape, not tokens or
billing. Late events cannot mutate returned accounting or write on a new branch.

## Configuration

### Selection and credentials move out of audit

Configure native/LLM selection, thinking and capacity in the shared service's
`<PI_CODING_AGENT_DIR>/llm-as-jev.json` (default `~/.pi/agent/llm-as-jev.json`):

```json
{
  "mode": "classifier",
  "classifierModel": "typesafe/jev-1.13",
  "model": "anthropic/claude-sonnet-4-5",
  "thinkingLevel": "low",
  "contextLimits": {
    "typesafe/jev-1.13": { "request": 64000, "stateAndLongestQuestion": 32000 }
  }
}
```

Choose actual model ids available in your Pi registry. `classifierModel` and the
LLM `model`/`thinkingLevel` are independent; neither inherits the main agent's
model. Model references split at the first slash. `auto` falls back only for
initial native unavailability, never after dispatch/error; forced modes never
switch. Configure provider endpoints and credentials through Pi (for example,
Pi's TypeSafe or OpenRouter provider auth), not through audit.

**Breaking configuration migration:** explicitly present audit `model`, `apiUrl`,
`apiKey`, `apiKeyEnvVar` and `contextLimits` are load-compatible but ignored. A
bounded notice lists field **names only**, including ignored fields in a trusted
project. There is no credential fallback, import, automatic rewrite or migration
probe. Read legacy file keys and the configured legacy environment value remain
redaction inputs only. They are never service authentication options. Move desired
settings deliberately; leaving an old audit model field does not select that model.

### Audit business settings

Layers remain defaults → `<agentDir>/jev-todo-audit.json` →
`<repo>/.pi/jev-todo-audit.json` **only for trusted projects**. Untrusted project
files are not read. Project files cannot override credential fields; known file
keys read from trusted layers are still redacted. Missing/malformed files fall
back safely. The old `~/.config/jev-todo-audit/config.json` only produces a move
notice and is not loaded.

| Setting | Meaning | Default |
| --- | --- | --- |
| `enabled` | Disable automatic auditing when false | `true` |
| `interval` | Audit every Nth completed loop | `10` |
| `cooldownLoops` | Skip periodic audit at or below this distance from the latest user message; independent of interval | `10` |
| `confidenceThreshold` | Native service gate only; never substitutes for evidence checks or gates LLM choices | `0.5` |
| `timeoutMs` | Whole service-review budget, not a fresh timeout for each retry | `30000` |
| `activityBudgetChars` | Deprecated and ignored; explicit values produce a bounded notice | no budget |
| `notifyOnAligned` | Also notify on aligned audits | `false` |
| `staleAuditSpans` | Diagnostic age threshold in audit intervals, not a split rule | `3` |

A loop is a finalized assistant message on the branch. Counters are replayed on
session start, compaction and tree changes; finalized user messages reset cooldown.
Headless main sessions still persist custom messages; notices require host UI
support. Suppressed child processes exit before loading this configuration.

## Verification and limitations

```sh
bun test
bun run typecheck
node "test/fixtures/node ownership.mjs"
openspec validate prevent-audit-request-amplification --strict
openspec validate improve-audit-context-fidelity --strict
```

Tests separate **business-port contracts** (explicit scripted public replies, no transport/cache/recovery engine) from **real offline owner integration**. Historical engine comparisons live only under `test/legacy/`, are labelled as such and are excluded from the package; their passing counts are not shared-service evidence. The real suites use audit activation and/or its projection adapter, the actual service, and Pi adapters using public fetch hooks with fake transport. They require explicit source roots, never an unconditional sibling dependency:

```sh
PI_JUDGMENT_SOURCE="/path/to/pi-llm-as-jev" \
PI_CLASSIFIER_SOURCE="/path/to/pi-with-released-classifier-api" \
bun test test/shared-service.integration.test.ts \
  test/shared-service-boundary.integration.test.ts \
  test/shared-service-llm.integration.test.ts \
  test/shared-service-corpus.integration.test.ts \
  test/shared-service-ownership.integration.test.ts \
  test/shared-service-accounting.integration.test.ts
```

The opt-in delivery tests use a real Pi executable with isolated HOME, agent,
Git/npm/XDG settings and local Git URL rewrites. They exercise both installer
routes, actual command/TUI dispatch, independent updates, supported reload and
failure recovery. Supply the real `rpiv-todo` **package directory** to execute
create/update/list through the native agent/tool runner using an offline scripted
chat provider; tool-name registration alone is not this business check. The real
service case copies the supplied working source, not merely its last commit.

```sh
JEV_NATIVE_DELIVERY=1 JEV_NATIVE_REAL_SERVICE=1 \
JEV_PI_BIN="/path/to/pi" \
PI_JUDGMENT_SOURCE="/path/to/pi-llm-as-jev" \
PI_TODO_SOURCE="/path/to/rpiv-mono/packages/rpiv-todo" \
bun test test/service-delivery.test.ts
```

These target-native checks were exercised on Pi `1.0.4-xz.265.1.g02d10232`.
Without the opt-in flags they skip; required acceptance must enable them and
provide the source paths. Evidence stays under `/var/tmp/jev-native-*`, including
source/binary identities, raw RPC/TUI output, Git operations and assertions.
They do not update installed user plugins or prove live-provider accuracy.

Run tests as their own main process: remove an inherited `PI_JEV_TODO_AUDIT_OWNER_PID` **only from the test subprocess environment**, never from production child suppression. Without both source variables, optional integration cases skip; ordinary green tests are not evidence that those cases ran. The suites capture real serialized request bodies, adapter starts/ends, missing/zero usage, rejected/partial recovery, reload/repeat, source continuity and privacy. The difficult retained-facts corpus case deliberately remains incomplete: finding markers in attempted packets is not completed review coverage.

Ownership tests also drive the native Node parent/child/grandchild fixture. CI's Linux/Windows configuration and historical predecessor runs do not establish that this migration candidate has executed on Windows. See [the regression map](openspec/changes/use-shared-judgment-service/regression-map.md) for original-assertion ownership and bounded evidence.

`PI_JUDGMENT_SOURCE=... PI_CLASSIFIER_SOURCE=... bun test/compare-workloads.ts` uses the actual owner path. `bun test/compare-workloads.ts --baseline` reads the committed historical core/corpus without checkout; it is not a full historical build. Serialization/byte accounting differs, so neither those measurements nor synthetic model answers prove token savings, live billing, model accuracy, installed activation or publication. These offline suites perform no live inference; installed-host validation is recorded separately.

API/serialization/consumer failures remain isolated from the agent loop. The extension neither guarantees that the main agent obeys a steer nor provides a hard tool blocker. The current rpiv-todo persistence shape is the only private-data adapter; incompatible snapshots cannot be treated as authoritative task state.

## License

MIT — see [LICENSE](LICENSE).
