## Context

Recovered feedback: the October 10 user reported that TODO audit appeared ineffective after the update. Earlier diagnosis proposed relaxing confidence and blamed rejected-envelope caching. Confidence/cursor behavior is a documented safety contract, not permission to skip uncertain history. This change instead addresses a separately reproduced liveness defect in the consumer's bounded overflow loop.

## Goals / Non-Goals

- Goal: reach an admissible complete-loop prefix within the existing retry budget for ordinary oversized segments, persist progress, and resume the remaining suffix.
- Non-goals: change confidence policy, advance uncertain scopes, discard anchors, split a loop, alter the judgment service, add health notifications, or claim that one fix resolves every historical incomplete audit.

## Decision

When `contextOverflow` is true and the segment has more than one loop, retain `floor(length / 2)` leading loops. This is nonempty, strictly smaller, contiguous, and contains the same first loop. Ordinary errors remain terminal. A single rejected loop still yields oversize without cursor advancement.

No learned-size cache or additional retry counter is needed. Existing packing is reused for later segments. Repeated conservative recovery can cost extra calls, but the current run limit remains authoritative and successful prefixes survive reload.

## Acceptance Examples

1. Given 41 complete loops and a service that rejects segments longer than two loops, the first run makes durable task/session progress within 32 calls. Reloaded state eventually reaches the final loop without relaxing confidence.
2. Given one rejected complete loop, the audit reports oversize and does not move its cursor.
3. Given low-confidence native answers, the cursor stays unchanged.
4. Given an ordinary non-context error, no subdivision is attempted.

## Risks / Verification Boundary

The regression uses a scripted service; it proves recovery/control flow, not live classifier accuracy. Genuine oversized fixed state, uncertain judgments, and provider/authentication failures can still prevent completion. No production session is replayed against a paid provider. User acceptance and installed-copy deployment remain separate from local verification.
