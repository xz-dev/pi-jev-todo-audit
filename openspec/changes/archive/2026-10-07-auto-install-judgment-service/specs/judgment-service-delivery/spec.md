## Purpose

Provide the judgment service automatically as an independently managed Pi package, so users receive service updates without an audit release while retaining control of package sources, resource filters, and configuration.

## ADDED Requirements

### Requirement: First eligible load registers an unpinned independent service

When a persistent managed audit installation has its provisioning resource enabled, the process is eligible to own audit work, and no existing service selection applies, its first normal load SHALL use Pi's native installation machinery to install and register `git:github.com/xz-dev/pi-llm-as-jev` as an independent package. The audit project SHALL NOT constrain that newly created source to a commit, tag, branch, or package version, or supply an audit-owned archive or lockfile pin for the service. The user SHALL NOT need a separate service-install command. Installation and backend readiness SHALL remain distinct outcomes.

#### Scenario: Fresh managed installation
- **WHEN** a user installs audit and starts a normal session with provisioning enabled and no existing service selection
- **THEN** the service is installed and added once to Pi's package list using the unqualified Git source, without a second user-issued installation command

#### Scenario: Upgrade from an audit installation without service delivery
- **WHEN** a user updates an older audit installation and performs its normal reload with no existing service selection
- **THEN** that load automatically installs and registers the independent service rather than requiring manual dependency repair

#### Scenario: Older candidate contains a nested service copy
- **WHEN** an audit version containing the superseded pinned nested dependency is replaced by the revised implementation
- **THEN** the revised audit no longer declares, loads, or restores that nested copy, and provisions or reuses the independent service without deleting unrelated user installations or configuration

### Requirement: Loaded audit resources keep their commands discoverable

When the corresponding resource is loaded in an eligible process, `/jev-audit` and the provisioning entry's `/jev-audit-service` SHALL remain registered independently of the audit business `enabled` setting. Invoking `/jev-audit` while business audits are disabled SHALL report that state and SHALL NOT start judgment work, create advice or write audit receipts. `/jev-audit-service` SHALL be read-only: it SHALL report current service availability without installing packages, saving settings, resolving credentials or dispatching inference.

Provisioning SHALL derive its persistent installation scope from its own command's public package-source metadata, matched to its own resource path and command identity. The main audit command SHALL NOT be required as a provenance anchor. Explicit resource filters and inherited process-ownership suppression SHALL remain effective; business disablement alone SHALL NOT disable an otherwise eligible provisioning resource.

#### Scenario: Disabled audit remains inspectable
- **WHEN** business `enabled` is false and both audit resources are loaded in an eligible process
- **THEN** both commands remain discoverable, a manual audit reports disablement without inference, and the service-status command remains read-only

#### Scenario: Main audit resource filtered out
- **WHEN** the main audit resource is excluded but the provisioning resource is enabled in a persistent user or trusted-project installation with no selected service
- **THEN** the provisioning command supplies its own correct scope and the service is registered there without requiring `/jev-audit` to exist

#### Scenario: Inspection does not cause provisioning
- **WHEN** `/jev-audit-service` is invoked before startup provisioning or while the service is unavailable
- **THEN** it reports availability without invoking installation, changing package settings or starting inference

#### Scenario: Resource and ownership gates still apply
- **WHEN** the provisioning resource is explicitly excluded or the process inherits another audit owner
- **THEN** stable command registration does not re-enable that excluded/suppressed resource or cause service provisioning

### Requirement: Native service updates are independent of audit revisions

An automatically registered service SHALL be a normal target of `pi update --extensions`. When a newer service revision is available and a native update succeeds, the service checkout SHALL advance even if audit has not changed. The next normal reload or restart SHALL use that updated service. Audit SHALL NOT restore an older service revision, require an audit release or lockfile change, or run its own recurring update mechanism. Explicit source constraints created by the user remain the user's responsibility and SHALL NOT be removed by audit.

#### Scenario: Only the service advances
- **WHEN** audit remains at commit A, the independently registered service's default source advances from S1 to S2, and the user successfully runs `pi update --extensions`
- **THEN** audit remains at A, the service advances to S2, and the next normal reload uses S2 without an audit-manifest or lockfile change

#### Scenario: Audit is not loaded during the update
- **WHEN** the service has already been registered and the user runs the native package-update command without an active audit session
- **THEN** the service still participates in the update as an independent configured Pi package

#### Scenario: Normal startup after registration
- **WHEN** the configured service is already installed and the user starts or reloads a session without requesting an update
- **THEN** audit does not reinstall it, fetch its latest revision, or reset its checkout as a startup side effect

### Requirement: Registration is scoped and preserves user choices

Automatic registration SHALL follow the persistent audit installation's user or trusted-project scope. Its permitted settings mutation SHALL be limited to adding the previously absent service package declaration through Pi. It SHALL preserve unrelated fields, existing package declarations, service sources and user pins, resource filters, model configuration, credentials, and trust decisions. Unknown or temporary installation scope SHALL NOT be guessed as user scope. An existing configured service that is disabled, filtered out, incompatible, or failing SHALL NOT be replaced or re-enabled automatically.

#### Scenario: User-scoped provisioning
- **WHEN** a user-scoped audit installation provisions a missing service
- **THEN** Pi registers the unpinned service once in user scope and leaves project settings and unrelated user settings unchanged

#### Scenario: Trusted project-scoped provisioning
- **WHEN** a project-scoped audit installation provisions a missing service in a trusted project
- **THEN** installation and registration remain in that project scope and no global service declaration is created

#### Scenario: Existing source or user pin
- **WHEN** a service selection already exists, including a user-selected pinned source or a different supported installation path
- **THEN** audit preserves that selection rather than overwriting it with its default Git source or adding a competing installation

#### Scenario: Existing service is explicitly filtered out
- **WHEN** a configured service exists but the user's effective resource choices exclude its extension
- **THEN** audit does not add an unfiltered duplicate, activate the excluded extension through a bootstrap path, or rewrite the filter; its ordinary dependency diagnostic remains available

#### Scenario: Scope cannot safely be determined
- **WHEN** provisioning is reached from a temporary/direct-file load or a host that cannot supply trustworthy persistent scope information
- **THEN** audit makes no guessed persistent registration and reports what is missing instead of silently writing global settings

### Requirement: A newly registered service is usable without duplicate activation

After successful first-load installation and registration of a compatible service, audit delivery SHALL make its ordinary service commands and review capability available by the end of that startup, without a second reload or an inference-based readiness probe. On later loads, Pi's normal resource discovery SHALL own the independent service. An already loaded service SHALL take precedence regardless of package order; delivery SHALL NOT add duplicate commands, providers, or service handles. Compatibility remains `version: 1`, `reviewVersion: 1`, and `review()`; an incompatible latest service SHALL produce an explicit diagnostic, not an automatic downgrade.

#### Scenario: First provisioning reaches readiness
- **WHEN** the independent compatible service is installed and registered during audit's first eligible startup
- **THEN** its configuration commands are visible in the interactive command interface and dispatch correctly after that startup, and the first eligible audit can discover its review capability

#### Scenario: Existing standalone service in either order
- **WHEN** the independently installed service and audit load together with either package first
- **THEN** audit reuses that service and adds no duplicate service commands, provider registration, or service instance

#### Scenario: Newest available service is incompatible
- **WHEN** native installation or update supplies a service that lacks the required review capability
- **THEN** audit reports incompatibility, skips inference and advice, and neither pins nor downloads an older replacement

#### Scenario: Service installed but backend unavailable
- **WHEN** service installation and activation succeed but no usable judgment backend is configured
- **THEN** service configuration commands remain available and backend diagnostics are distinguishable from missing-extension or installation errors

### Requirement: Provisioning respects lifecycle, trust, and process ownership

Provisioning SHALL be independently disableable through Pi's audit-package resource controls. A suppressed child SHALL perform no audit-owned provisioning, registration, service activation, credential lookup, or inference. Project trust and offline restrictions SHALL NOT be bypassed. Within an activation, provisioning SHALL be bounded and idempotent; repeated events SHALL NOT multiply installation attempts, registrations, or handlers. Reload SHALL hand ownership to the normally discovered independent service, and retired cleanup SHALL NOT remove a replacement handle. No bootstrap SHALL run an audit or write judgment receipts solely to prove readiness.

#### Scenario: Provisioning entry disabled
- **WHEN** audit's provisioning entry is filtered out and no usable service is loaded
- **THEN** audit retains bounded missing-service behavior and does not install from an audit callback or re-enable the excluded entry

#### Scenario: Suppressed child or untrusted project
- **WHEN** a child inherits another process's audit owner, or a project-local audit declaration has not been trusted
- **THEN** that path performs no service installation, package registration, or audit-owned service activation

#### Scenario: Offline first load
- **WHEN** no service is installed and the first eligible load runs in offline mode
- **THEN** provisioning does not fetch or register a replacement and reports the unavailable dependency without blocking main-agent or TODO work

#### Scenario: Repeated startup and normal reload
- **WHEN** startup events repeat and the user subsequently reloads after successful registration
- **THEN** there is still one configured service source and one effective service owner, with no duplicate command set, repeated startup installation, or paid readiness probe

#### Scenario: Retired generation shuts down late
- **WHEN** the independent service is active after reload and a retired bootstrap generation's shutdown callback runs
- **THEN** the active replacement remains discoverable

### Requirement: Failure reporting distinguishes install, registration, and activation

A failed download, package operation, persistence operation, or service startup SHALL NOT be described as successful service readiness. A successful clone without a persisted package declaration SHALL NOT be described as independently updatable. A startup failure after publication SHALL clean up only that activation's partial service so it cannot authorize audit inference. Existing bounded automatic notices, explicit manual dependency errors, no-direct-HTTP-fallback behavior, and continued main-agent/TODO availability SHALL remain. Authentication failures SHALL NOT trigger an alternate unauthorized access method. Retry SHALL be through a later normal load or explicit native package repair/update, not audit cadence or an unbounded background loop.

#### Scenario: Download or registration fails
- **WHEN** native service installation fails, or installation succeeds but Pi cannot persist the package declaration
- **THEN** audit reports the failed stage, does not claim service readiness or future update participation, and does not rewrite unrelated settings or launch an alternative installer

#### Scenario: Initialization fails after publishing a handle
- **WHEN** the first-load service publishes a handle and a later startup operation fails
- **THEN** that partial activation is cleaned up immediately without removing another owner's handle, and audit cannot infer through the failed instance

#### Scenario: Authentication is required
- **WHEN** an installation attempt fails because access requires authentication
- **THEN** delivery reports the authentication problem and waits for user action rather than switching protocols, accounts, or credential sources

#### Scenario: Repair restores delivery
- **WHEN** the failed stage is repaired and the user performs a later normal load or native repair/update and reload
- **THEN** the service can become available without changing the audit enabled switch, duplicating its package declaration, or migrating credentials

### Requirement: Documentation explains the independent package lifecycle

Installation guidance SHALL describe first-load automatic registration, its scoped settings/network side effects, the unpinned Git source, `pi update --extensions`, normal reload/restart semantics, preservation of existing user choices, and separate backend configuration. It SHALL distinguish package installation from registration and activation, and explain how to disable provisioning. It SHALL NOT claim that the audit package ships a fixed service revision or that removing audit automatically removes a service other consumers may use.

#### Scenario: User follows the documented lifecycle
- **WHEN** a new user follows installation, first-load, and update instructions
- **THEN** no second manual service-install command is required, the service appears as an independent Pi package, and update instructions remain valid without a new audit commit
