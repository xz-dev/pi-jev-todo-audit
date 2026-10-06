## Context

See `proposal.md` and `specs/judgment-service-delivery/spec.md`. On 2026-10-06 the user rejected all audit-imposed service pins, selected automatic registration of an independent Pi package rather than changes to Pi itself, and confirmed revision of these four planning artifacts. This supersedes the earlier nested-dependency delivery design; it does not approve the paused implementation or its verification claims.

The relevant update code was checked against the installed Pi `1.0.3-xz.264.1.g000c8b4e` source commit, not the repository's development SDK `0.85.1`:

- `DefaultPackageManager.update()` enumerates configured packages. For a Git package whose HEAD is unchanged, `ensureGitRef()` repairs missing dependencies but does not refresh existing nested dependencies. Merely removing a commit from the nested dependency URL would not satisfy independent updates.
- Pi publicly exports `DefaultPackageManager`, `SettingsManager`, and `getAgentDir`. The package manager exposes `installAndPersist`, `listConfiguredPackages`, `getInstalledPath`, and resource resolution. Installation followed by native settings registration is already implemented; audit must not recreate it.
- `SettingsManager.create` accepts `projectTrusted`, while its default is permissive. Pass the actual `ctx.isProjectTrusted()` result explicitly. Its queued writes require `flush()` and error inspection before claiming registration success.
- Loaded command `sourceInfo` supplies installation provenance/scope. Service commands register before service `session_start`, so bound startup can recognize an already selected service in either load order.
- Pi snapshots event handlers before dispatch. A service first installed during startup is not automatically part of that dispatch or the already discovered resource set. A first-load bridge must initialize it once; the next reload discovers its independent package normally.

## Goals / Non-Goals

**Goals:**

- Let Pi own the service's checkout, package declaration, dependency installation, and subsequent updates.
- Make first-load provisioning a small integration with public host APIs, separately disableable and honest about network/settings side effects.
- Preserve existing source choices and startup/lifecycle safety without keeping a second service copy inside audit.
- Prove the critical behavior with audit held constant while only the service source advances.

**Non-Goals:**

- No Pi/core or service-repository patch, custom Git updater, dependency graph framework, npm lifecycle hook, or recurring update timer.
- No audit-owned commit/tag/branch/version constraint or service archive in either production or development dependencies.
- No changing credentials, backend/model selection, trust decisions, user-selected service constraints, or unrelated package settings.
- No guessed persistent registration for temporary/direct-file developer loads. No live installed-user rollout, publication, or paid inference during implementation verification.

## Decisions

### 1. Use one unqualified, independently managed Git source

The source created by audit is exactly `git:github.com/xz-dev/pi-llm-as-jev`. Omit any ref suffix. Pi resolves its normal default source and owns the resulting checkout. A checked-out SHA or a test receipt records what actually ran; it is not an audit-imposed version policy and must never be fed back as a pin.

Remove the paused candidate's `dependencies.pi-llm-as-jev` and associated audit lockfile entries. Do not retain a nested fallback, archive URL, dev dependency, or automatic rollback to an older service. Keep host-provided Pi modules as peers and avoid unrelated dependency upgrades.

An independently configured source naturally participates in `pi update --extensions`, even when audit's HEAD is unchanged or audit is not loaded. Normal reload/restart activates new files; audit does not hot-swap an already running service or update it on each startup.

Alternative rejected: an unqualified nested Git dependency. Pi's unchanged-audit path does not update an already present nested checkout. Alternative rejected: expanding Pi's updater; the user chose independent registration instead.

### 2. Reuse Pi's native installer and settings persistence

Keep a separately filterable root `judgment-service.ts` provisioning entry. On its first eligible `session_start`, apply process ownership and offline checks before native installation or service imports. The only automatic installation target is the fixed unqualified service source, and only when no existing selection applies.

Use the host-exported public operations underlying `installAndPersist`: `install`, a fresh configured-selection check after download, then `addSourceToSettings` and `flush`. Keeping these boundaries separate preserves selections made during a slow download and distinguishes installation from persistence failure. Obtain the actual agent directory from the host rather than a hardcoded home path. Build its settings view with the current working directory and an explicit, actual project-trust decision. Check initial settings errors; after registration, await queued persistence and inspect errors. A clone without durable registration is not delivery success.

Determine user/project scope from the provisioning resource's own `/jev-audit-service` command metadata: match the command identity, package origin and canonical path of the current `judgment-service.ts`, not an arbitrary same-named command or the main audit entry. Register this read-only command during activation after the process-ownership gate. It reports current review-service availability without installing, saving settings, reading credentials or running inference. Main-entry filtering and business `enabled: false` do not remove the provisioning resource's provenance. A project install must stay in its trusted project scope. If provenance or required public APIs are unavailable, stop that provisioning attempt with a diagnostic; do not default to global scope, force trust, read untrusted project settings, or use private manager methods.

Register `/jev-audit` before the main entry's business-disabled return and put an explicit disabled response at the beginning of its handler. Keep audit hooks, judgment work and the existing advisory formatter inert when disabled. These commands remain predictable only when their respective resources are loaded and the process is eligible: resource filters and inherited-owner suppression are not bypassed. The user explicitly approved this registration-boundary exception to the otherwise protected advisory files.

Native installation owns repository transport, package-manager selection, peer suppression, and persisted package serialization. Do not add a shell-specific `pi` executable search, parse human CLI output for install paths, or hand-edit `settings.json`. The permission change is narrow: first-load native installation and addition of the service package entry are now allowed; arbitrary settings migration and installation from audit/inference callbacks remain forbidden.

### 3. Recognize existing selections before attempting registration

Use the existing shared handle, loaded service-command metadata, and the native configured-package view to distinguish an absent service from a selected but not loaded one. Recognize the service repository across the host-supported source forms used by this integration; inspect installed package identity for applicable local sources rather than treating every path as the default repository. Do not call private source-matching APIs or build a general package-source framework.

Existing loaded services win in either load order. Existing package declarations, including user pins and filter objects, also win: do not call `installAndPersist` on them to remove a ref, overwrite filters, refresh their checkout, or create a global duplicate of a project choice. Native `addSourceToSettings` can replace an equivalent source with a differently qualified one, so it is not a substitute for this precheck.

An existing configured-but-disabled service is intentionally unavailable, not permission to activate another copy. A configured service that fails to load remains a host/dependency error. Pi's ordinary package repair/update can repair it; audit does not secretly replace it. A manually loaded compatible local service need not be registered elsewhere by audit.

Keep the attempt idempotent within the current activation and refresh the native selection view before the permitted settings mutation. Do not create an unrelated lock/daemon system. Existing independent packages survive removal of audit because other consumers may use them. Disabling audit's provisioning entry prevents new provisioning, not an independently enabled service; document both resource controls.

### 4. Bootstrap only the service newly registered in this activation

Successful registration occurs after the host's original extension discovery. Use the native installed-path/resource-resolution results for the service just provisioned, respecting enabled flags and effective resource filters, and load only that selected service's extension resources. Do not guess a `node_modules` path, scrape CLI text, load unrelated extensions returned by a resolver, or invoke a raw-source resolver to bypass an existing filter. Resource discovery must skip unrelated missing packages rather than install them as a side effect.

For this initial activation only, invoke the newly installed service factory through the narrow public-API lifecycle bridge. Await its newly registered first-start handlers with the current event/context exactly once, and retain correct later event/unsubscribe/shutdown behavior. Its commands must become usable in that same startup, without asking for an extra reload. This bridge contains no service configuration, provider, or judgment logic of its own.

On the next normal reload, the independently persisted package is discovered by Pi. The audit provisioning entry observes that selection and does not initialize a second copy. All bootstrap state is per host activation; retired cleanup retains the service's identity check and cannot remove a replacement handle. If startup fails after publication, run only the partial activation's cleanup immediately, detach its pending work, and leave another owner untouched. Keep the successful independent package declaration so native repair/update remains possible; failed activation is not a reason to delete user package state.

Alternative rejected: register the service and require a second manual reload before first use. That would weaken the first-start readiness contract. If the public host APIs cannot support scoped registration, enabled-resource resolution, and first-start activation, stop at that evidence and request a design revision rather than patching Pi or dropping an acceptance condition.

### 5. Separate provisioning errors from service and backend errors

Report native installation progress and one bounded failure stage: installation, registration, activation, compatibility, or backend configuration. Do not log settings bodies, credentials, or conversation content. Failed/offline/authentication-blocked provisioning must leave main-agent/TODO work available and must not start another transport or credential path.

Limit automatic provisioning to one attempt per activation. No retries from audit cadence, background update timer, or inference readiness probe. A later ordinary load can retry an unregistered failed attempt; once a declaration exists, ordinary Pi loading/repair/update owns it. Compatibility checks remain checks of `version`, `reviewVersion`, and `review()`, not version pins. An incompatible newest service is diagnosed; audit does not fetch an older commit.

### 6. Replace stale acceptance evidence with a native update experiment

Reuse the existing Bun test structure and task-scoped fixtures under `/var/tmp/`; do not introduce a framework. The first complete vertical experiment is:

1. Keep an audit fixture at commit A. Expose service revision S1 through the normal unqualified source route in an isolated Git fixture.
2. Install only audit. Start the actual target Pi binary with isolated agent/project settings. Observe native service installation, one persisted service declaration, same-start command visibility/dispatch, and no judgment attempts.
3. Advance only the service fixture to S2. Keep audit A, its manifest, and its lockfile unchanged.
4. Run the actual `pi update --extensions` path outside the audit session. Assert success, audit still at A, independent service at S2, unchanged unqualified source declaration, and S2 observable after a supported reload/restart.
5. Repeat a normal start without an update request and assert no audit-triggered reinstall, service fetch, or duplicate registration.

Exercise the host's supported npm and embedded Bun installation routes, user and trusted-project scope, configured/loaded/filtered selections, disabled provisioning, temporary scope, suppressed children, offline/auth/persistence failure, incompatible service, and partial startup cleanup. Check the settings delta, not merely the presence of a directory: only the intended service declaration may be added. Use deterministic fake providers only when an eligible audit is required to prove consumption; provisioning must not dispatch inference.

Record actual binary path/version, audit and service fixture revisions, relevant file hashes, command exit status, and observable assertions. UI visibility needs real interactive evidence, not only RPC `get_commands`. Reload needs a successful supported reload path and generation/lifecycle evidence, not an RPC prompt that returns an API-key error. Backend diagnostics need the actual diagnostic, not merely successful command dispatch. Avoid sleep-based timing verdicts and fail if required observations never arrive.

## Risks / Trade-offs

- [First startup now performs network and scoped settings work] -> Make progress and failure visible; honor trust/offline/ownership/resource gates; use native installation only and preserve unrelated settings.
- [The latest service can introduce an incompatible API] -> Retain capability checks and bounded diagnostics; do not reintroduce a hidden pin or downgrade.
- [A configured but unloaded service can resemble an absent dependency] -> Inspect both loaded identity and configured selection; preserve filters and manual source choices before any native registration call.
- [First-load resource registration occurs after discovery] -> Reuse a minimal lifecycle bridge and prove current-session readiness plus native ownership after reload against the actual target binary.
- [Native settings writes are asynchronous and can fail] -> Await persistence, inspect native errors, and do not claim update participation for a clone alone.
- [Earlier tests proved the superseded delivery mechanism, sometimes with weak predicates] -> Reopen affected tasks and rebuild requirement-to-evidence mapping. Existing repairs are candidates for reuse, not proof of the independent-package contract.

## Migration Plan

1. The user subsequently selected implementation and closure of all three separately managed changes. This apply continues in this repository; it does not authorize live package registration, publication or rollout.
2. Verify the native public API/scope seam, remove the candidate's fixed nested dependency, and adapt the existing provisioning entry to the independent package path. Preserve unrelated work and predecessor artifacts.
3. Default managed users need only install/update audit and perform their normal first load. The service is then registered once; subsequent `pi update --extensions` treats it independently. Existing user-selected services are not rewritten.
4. Verify the unchanged-audit/S1-to-S2 scenario and all retained safety gates before updating README claims or completing tasks. The user remains the final acceptance authority.
5. For a future authorized rollback, restore the audit version and reload. Leave the independent service and its configuration registered unless the user explicitly chooses native removal; do not delete shared state or restore an old service revision automatically.

## Historical Candidate and Rejected Evidence

The earlier worker produced a fixed-archive candidate and a startup bridge. A recovery pass reported repairs for shutdown unsubscription and cleanup after partial publication; these may be reused after inspection. That pass did not establish the new independent-update contract, and independent final reviews did not run.

Historical checkpoints are under `/var/tmp/jev-auto-install/recovery-20261006-timeout/` and `/var/tmp/jev-auto-install/evidence/checkpoint-20261006.md`. Some old evidence is explicitly invalid: a failed RPC `/reload` response counted as success, RPC command enumeration substituted for interactive UI evidence, and a backend-diagnostic predicate was relaxed to dispatch success. Do not copy their pass counts into new acceptance results. Reported full-suite failures overlapping the separate `simplify-audit-advisory-messages` work also require independent attribution, not silent exclusion. No old implementation checkbox is carried forward except the confirmed user decision. Current checkmarks are backed by the newer receipts in `tasks.md`.

## Current Verification Status

The current local candidate passes 438 tests with all required native and offline
shared-service integrations enabled, zero failures/skips, typecheck, Node ownership
and strict validation of both audit changes. Native fixtures retain canonical Git
source rewrites, actual working-service hashes, real TUI/reload observations and
real rpiv-todo create/update/list toolResult snapshots across failure paths. The
scoped README and task ledger are synchronized. See the 2026-10-07 receipt in
`tasks.md` for exact commands and evidence locations. Final independent delivery
review approved the repaired candidate and closed its sole status-compatibility
finding. Advisory readability is already accepted; its remote Linux/Windows CI
remains a separate unobserved external gate. No publication or installed-user
rollout occurred.
