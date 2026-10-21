## MODIFIED Requirements

### Requirement: A newly registered service is usable without duplicate activation

After successful first-load installation and registration of a compatible service, audit delivery SHALL make its ordinary service commands and judgment capability available by the end of that startup, without a second reload or an inference-based readiness probe. On later loads, Pi's normal resource discovery SHALL own the independent service. An already loaded service SHALL take precedence regardless of package order; delivery SHALL NOT add duplicate commands, providers, or service handles. Compatibility is `version: 2` with `judge()`; an incompatible latest service — including one exposing version one or the retired review protocol — SHALL produce an explicit diagnostic, not an automatic downgrade or compatibility facade.

#### Scenario: First provisioning reaches readiness
- **WHEN** the independent compatible service is installed and registered during audit's first eligible startup
- **THEN** its configuration commands are visible in the interactive command interface and dispatch correctly after that startup, and the first eligible audit can discover its version-two judgment capability

#### Scenario: Existing standalone service in either order
- **WHEN** the independently installed service and audit load together with either package first
- **THEN** audit reuses that service and adds no duplicate service commands, provider registration, or service instance

#### Scenario: Newest available service is incompatible
- **WHEN** native installation or update supplies a service that does not advertise version-two judgment capability
- **THEN** audit reports incompatibility, skips inference and advice, and neither pins nor downloads an older replacement

#### Scenario: User selected an old service
- **WHEN** a user's selected or pinned service exposes version one
- **THEN** audit reports incompatibility without replacing the source, removing the pin or installing a substitute behind the user's choice

#### Scenario: Service installed but backend unavailable
- **WHEN** service installation and activation succeed but no usable judgment backend is configured
- **THEN** service configuration commands remain available and backend diagnostics are distinguishable from missing-extension or installation errors

### Requirement: Failure reporting distinguishes install, registration, and activation

A failed download, package operation, persistence operation, or service startup SHALL NOT be described as successful service readiness. A successful clone without a persisted package declaration SHALL NOT be described as independently updatable. A startup failure after publication SHALL clean up only that activation's partial service so it cannot authorize audit inference. Existing bounded automatic notices, explicit manual dependency errors, no-direct-HTTP-fallback behavior, and continued main-agent/TODO availability SHALL remain. Authentication failures SHALL NOT trigger an alternate unauthorized access method. Retry SHALL be through a later normal load or explicit native package repair/update, not audit cadence or an unbounded background loop. A successful installation SHALL not be described as compatible readiness until version-two capability is actually observed.

#### Scenario: Download or registration fails
- **WHEN** native service installation fails, or installation succeeds but Pi cannot persist the package declaration
- **THEN** audit reports the failed stage, does not claim service readiness or future update participation, and does not rewrite unrelated settings or launch an alternative installer

#### Scenario: Initialization fails after publishing a handle
- **WHEN** the first-load service publishes a handle and a later startup operation fails
- **THEN** that partial activation is cleaned up immediately without removing another owner's handle, and audit cannot infer through the failed instance

#### Scenario: Installed service is version one
- **WHEN** first-load installation activates a service advertising version one
- **THEN** delivery reports the version incompatibility explicitly and does not describe the installation as ready for audit inference

#### Scenario: Authentication is required
- **WHEN** an installation attempt fails because access requires authentication
- **THEN** delivery reports the authentication problem and waits for user action rather than switching protocols, accounts, or credential sources

#### Scenario: Repair restores delivery
- **WHEN** the failed stage is repaired and the user performs a later normal load or native repair/update and reload
- **THEN** the service can become available without changing the audit enabled switch, duplicating its package declaration, or migrating credentials
