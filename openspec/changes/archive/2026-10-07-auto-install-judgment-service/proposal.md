## Why

Installing or updating `pi-jev-todo-audit` must not leave users to install its judgment service manually. The service must also follow ordinary `pi update --extensions` independently of audit releases; an audit-owned dependency pinned by a commit, tag, version, archive URL, or lockfile does not meet that requirement.

## What Changes

- On the first eligible load with no existing service selection, automatically install and register `git:github.com/xz-dev/pi-llm-as-jev` as an independent Pi package through Pi's native package installation machinery. Do not attach any commit, tag, branch, or version constraint.
- Register in the audit installation's user or trusted-project scope. The newly registered service becomes visible to Pi's normal package listing and update commands, including when audit itself has no new commit.
- Replace the candidate's pinned `package.json`/`package-lock.json` dependency and package-internal fallback with a separately filterable provisioning entry. Bootstrap the newly registered managed service for the current session; later loads use Pi's ordinary resource discovery.
- Preserve existing service sources, explicit user pins, resource filters, model configuration, and credentials. An existing incompatible or failed service is diagnosed, not silently replaced, re-enabled, or downgraded to a bundled copy.
- Preserve stable `/jev-audit` and read-only `/jev-audit-service` registration whenever their respective resources are loaded in an eligible process, including when audit business configuration is `enabled: false`. Disabled audit handlers report that state without inference; provisioning determines its scope from its own command metadata and remains independent of the business switch.
- Permit the narrowly scoped first-load installation and service-package registration selected by the user. Keep npm lifecycle installers, installation from audit/inference callbacks, recurring startup updates, unrelated settings edits, and paid readiness probes out of scope.
- Verify the defining update case: hold audit at the same commit, advance only the service source, run `pi update --extensions`, then reload and observe the new service without changing the audit package or its lockfile.

## Capabilities

### New Capabilities

- `judgment-service-delivery`: Automatic registration of an unpinned independently managed service, native updates independent of audit releases, scoped/idempotent startup, coexistence and resource-choice preservation, lifecycle safety, and honest failure reporting.

### Modified Capabilities

None. Audit business behavior and the unarchived `use-shared-judgment-service` integration contract remain unchanged. This revises the delivery capability proposed by this change, not a main specification.

## Impact

- Implementation remains in this repository: `package.json`, `package-lock.json`, the `judgment-service.ts` provisioning entry, the narrowly scoped command-registration/disabled-handler boundary in `index.ts`, focused tests under `test/`, and README installation/update guidance. Reuse the existing service client and process-ownership policy; preserve the separate advisory renderer and wording changes.
- Remove the audit-owned service dependency from the candidate manifests/lockfile. The external dependency becomes a native Pi Git-package declaration, not a nested package whose resolved version audit ships or updates.
- Use public host package-management, settings, scope/trust, and resource-discovery interfaces. No Pi or service-repository changes, custom dependency manager, copied provider implementation, or private host APIs.
- The expected persistent side effect is one service source added to the appropriate Pi package list after installation succeeds. Preserve unrelated settings and existing service declarations; do not edit credentials, model configuration, trust decisions, or other package selections.
- Supported automatic provisioning targets persistent managed audit installations. Temporary/direct-file developer loads must not infer a persistent destination or silently register a global package. Publication and live user-environment rollout remain separate from implementation verification.
- The user selected independent-service registration on 2026-10-06, superseding this change's earlier fixed-dependency/no-runtime-install design, then confirmed provisioning while audit is disabled, predictable command registration and implementation. Historical receipts remain candidate-specific, not acceptance of later revisions.
