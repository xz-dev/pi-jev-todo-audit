## MODIFIED Requirements

### Requirement: A newly registered service is usable without duplicate activation
After successful first-load installation and registration of a compatible service, audit delivery SHALL make its ordinary service commands and required generic judgment-execution capability available by the end of that startup, without a second reload or inference-based readiness probe. On later loads, Pi's normal resource discovery SHALL own the independent service. An already loaded service SHALL take precedence regardless of package order; delivery SHALL not add duplicate commands, providers or service handles.

Audit SHALL check the canonical consumer-cache and business-stage contract actually used by its adapter. The presence of legacy `reviewVersion: 1` alone SHALL not prove support for a newly added callback. Read-only service status SHALL use the same compatibility definition. An incompatible installed/latest service SHALL produce an explicit diagnostic, not an automatic downgrade, pin, competing instance or consumer implementation of missing transport/execution capability.

#### Scenario: First provisioning reaches readiness
- **WHEN** the independent compatible service is installed and registered during audit's first eligible startup
- **THEN** its configuration commands are available and the next eligible audit can discover the required execution contract without a paid probe

#### Scenario: Existing standalone service in either order
- **WHEN** the independent service and audit load with either package first
- **THEN** audit reuses that service without duplicate commands, provider registration or handles

#### Scenario: Newest available service is incompatible
- **WHEN** native installation or update supplies a service without a required callback/cache capability
- **THEN** audit reports the exact limitation and neither pins nor downloads an older replacement

#### Scenario: Service installed but backend unavailable
- **WHEN** service activation succeeds but no usable judgment backend is configured
- **THEN** configuration commands remain available and backend unavailability is distinguishable from extension/capability/installation failure

#### Scenario: Legacy service still serves another consumer
- **WHEN** the loaded service serves legacy consumers but lacks a contract required by the new audit adapter
- **THEN** audit leaves that service intact and reports its own limitation rather than replacing the handle or reviving the old checkpoint-coupled path
