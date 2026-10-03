## Context

See `proposal.md` for motivation and the delta spec for required behavior. This is a two-part follow-up to the reviewed `prevent-audit-request-amplification` candidate, not a rewrite of that change. The predecessor completed 25/25 tasks and delegated technical acceptance; its actual Linux/Windows evidence is Actions run 36973608562 on `ddd7f9a`. Those results do not establish platform acceptance of this new candidate.

### Implementation agreement

On 2026-10-02 the user explicitly selected “按现有约定实现” after being asked to confirm F1–F4, P1–P3, I1 and R1 and optional `metadata.auditBrief = { text, sources, covers }`. No corrections were requested. Implement against the existing Bun public audit invocation/capturing fake transport/receipt/correction seam. No additional model/store, paid experiment, broader context redesign, publication or rollout is authorized by that confirmation.

The user subsequently selected conservative primary retention on 2026-10-03 after independent cold/full review found a covers-only primary exclusion. Keep `text/sources/covers` unchanged: `sources` is not an exclusive allowlist and `covers` is not evidence dispensability. P2 promises usability only when the complete necessary candidate set can already be safely bounded; a structurally valid brief alone does not make 260 potentially needed reports eligible for one Choice.

### Evidence that bounds this design

- `rolling.ts::retainedFrom` keeps processed assistant reports newest-first within a 4,000 serialized-character allowance. Its current omission notes say reviewed content is reflected in opinions; the stored Choice classifications do not themselves contain the missing facts. An offline XML-versus-CSV packet experiment with approximately 2K-character old reports and identical supplied opinions lost that distinction after later reports filled the allowance. This establishes conditional projection loss, not measured JEV error; a shorter old-report probe retained the fact.
- `typesafe.ts::buildAuditRequest` gives `work_evidence` and each `task_evidence_<id>` the same pool of complete non-advice records. A synthetic user, 260 visible reports and one task supplement yielded 263 options per evidence question, nine questions and 44,548 state bytes. This was a local packet observation, not token usage or a server rejection.
- Official Choice documentation says a question accepts up to 255 options and recommends the full applicable list plus a fallback, not an arbitrary shortlist. Official state/jaggedness guidance recommends relevant named data and warns that irrelevant bulk and indirection can reduce accuracy. These support controlled scoping, not guessing which necessary evidence to delete.
- Same-state independent batching is documented and remains appropriate. Direct TypeSafe documents 64K total and 32K state-plus-longest-question; OpenRouter's effective split remains unconfirmed, so keep its existing conservative 32K policy. The inspected public contract provides no usable persistent-history, delta, discounted-prefix or token-preflight facility. That is an observation about published contracts, not proof that private features cannot exist.

## Goals / Non-Goals

**Goals:**

- Preserve needed reported facts independently of opinions and receipts, with explicit object/branch provenance and uncertainty.
- Let the main agent provide a compact current account through already-supported public task metadata; keep ordinary descriptions/reports useful without that field.
- Enforce structural Choice limits at the shared outbound seam without changing capacity learning or buying source-selection/preflight calls.
- Reuse the existing context, branch storage, per-question cache, diagnostics and correction delivery seams.

**Non-Goals:**

- No semantic fact extractor, extra summarizer/model, embeddings/RAG, tokenizer, new database, keyword relevance classifier or general provenance framework.
- No transport-wide migration from the current labelled text/JSON state to an object API, question hierarchy/beam search, new confidence policy, model switch, cadence reduction or raw tool-payload restoration.
- No claim that this design is optimal, semantically lossless, cheaper in live billing or more accurate in JEV. Only supplied material and mechanically checked identities can be conserved; an author's brief is still a report.

## Decisions

### D1. Use an authored current brief, not extracted pseudo-memory

Proposed small convention: a task can publish `metadata.auditBrief = { text, sources, covers }`. `text` is the main agent's current account of goals/conditions, choices, reported outcomes, blockers and open questions as needed; `sources` names the supporting public source IDs; `covers` explicitly names earlier main-agent reports represented by this account. The containing task supplies object scope. Use genuine captured task changes and active-branch source identities, not a new timestamp on every read.

The projection validates shape and references against the existing permitted history, records unavailable/ambiguous references as gaps, and preserves original source roles. Source/coverage lists can be empty; the genuine public task snapshot is still the account's reported-data origin, not a substitute for missing cited evidence. When requesting an account, the existing feedback message can identify the permitted report IDs it asks the agent to cover; it must not require hidden identifiers or export excluded text. `covers` is an author's coverage declaration, not a proof of semantic completeness. It cannot cover user-authority records, tool bodies, host-generated summaries or JEV advice, and coverage for one task cannot erase facts needed by another.

Keep the brief body once in the current permitted task supplement; a factual view/index labels its role and references without copying the same text into every question or a second store. Public main-agent reports are the other factual inputs. JEV opinions and completed ranges remain separate. A brief alone does not become a valid completed-action anchor: retain the existing refusal to treat task supplements/host summaries as sole completion evidence. A correction needing public primary evidence must still have an eligible supplied source. Keep that permitted source body when it is still needed as a primary anchor, even if its factual content is covered by a brief; `covers` does not retire an evidence obligation.

**Alternatives:** automatically deriving facts from Choice labels is not supported; an extra summarizer adds cost and a new error surface; a mandatory metadata migration would unnecessarily break ordinary tasks. Optional authored data plus conservative fallback is the smallest compatible approach. Field naming is a proposed convention for review, not an already deployed interface.

### D2. Make report omission depend on factual coverage, not age

Uncovered public reports within an audited object's known or uncertain macro scope remain conservatively necessary. Only explicit applicable coverage/supersession or an established unrelated scope allows their removal as factual inputs. Keep protected user decisions independently; do not infer that newer routine acknowledgements supersede older outcomes or blockers. A brief must not silently authorize omission of another object's material.

The existing recent-report allowance cannot decide that a covered public report has lost primary eligibility. Without independent applicability information, keep such reports conservatively; coverage alone and an old selected primary do not establish that another report is dispensable. If the real required floor cannot fit after progressing recovery, preserve completed work and use the normal feedback path to disclose the missing bounded scope. A current account can expose decisions and gaps, but repeating the same account does not guarantee admission. Missing original text after host compaction remains a provenance gap, not a fact reconstructed from classifications.

This can increase legacy-context bytes until a brief is supplied. It deliberately chooses factual coverage over a falsely compact packet. Do not turn unknown scope into blanket refusal of otherwise supported findings or repeatedly ask an unchanged clarification; reuse the existing freshness and delivery/deduplication policy.

**Alternatives:** increasing the 4K constant only moves the loss boundary; unconditional retention of all branch text ignores relevance/privacy; regex/title filtering cannot establish object-level factual coverage.

### D3. Build scoped candidates and apply one hard outbound guard

For each evidence finding, construct a stable candidate manifest from supplied eligible sources and explicit task/brief/source associations. Include applicable user constraints and unresolved relationships; a candidate's scope and role must be visible, not guessed from its title. Current-work findings require their applicable user/work scope; a task's manifest must not borrow another task's coverage. Do not apply a generic top-N history crop.

At the shared evaluation boundary, before sending unresolved questions, count the final criteria keys of every Choice. The 255 limit includes all fallback options and also applies to board matching and direct/manual/full paths. Cached completed pairs remain reusable only under their exact unchanged identities. An over-limit unresolved question is locally withheld with a bounded scope/reason diagnostic, no confidence or cached fake answer, no provider attempt, no context-rejection hint and no subdivision of that invalid schema. If valid independent questions remain, use ordinary shared-state batching and existing per-finding safety checks; do not grant the affected scope a successful receipt.

If explicit associations still cannot bound a complete necessary set, request a scoped current account. Do not add a model-assisted relevance pass or split one Choice into pages and pretend their relative probabilities equal the original Choice. If there are no sendable unresolved questions, return local incomplete status without an empty provider request.

**Alternatives:** first/newest 254 loses coverage; paging/beam search introduces dependent evaluations and different semantics; an arbitrary request or record cap hides the underlying schema problem. One common guard is necessary even after candidate scoping.

### D4. Include factual meaning in identity, persistence and admission

Audit freshness and per-question evaluation identity must include canonical factual content, source/coverage definitions, scope/authority/gaps and actual Choice definitions—not only the previous classifications or a cursor. A no-op read or identical brief remains reusable. A changed fact or reference invalidates affected historical reuse and stale current delivery even when labels are unchanged. Preserve ordered user decisions rather than normalizing away chronology.

Use existing public TODO snapshots and branch/session records to restore material and verifiable lineage. No separate fact ledger or history rewrite is planned. Older entries remain readable; absent fields mean unavailable material, not fabricated compatibility. A restored brief with missing origins stays a qualified report and cannot acquire execution authority.

Measure the actual serialized brief, lineage and question definitions in the existing fixed-state/admission logic. Retain endpoint/requested-model isolation, the reviewed request-only and state-plus-question floor handling, latest usable density, exact rejected envelopes, rejected-single-question superset guards, non-context failure policy and unknown-usage accounting. A structural limit is not a token estimate and does not authorize a capacity retry.

**Alternatives:** storing only labels repeats the information loss; hashing text but ignoring reference/role changes can deliver stale conclusions; blanket cache invalidation needlessly rebills unchanged work.

### D5. Verify observable packets and effects without paid inference

The actor is the owning main agent; the user retains scope and final acceptance authority. The stable acceptance seam is an audit invocation with public task/session inputs, a capturing fake transport, durable receipts and emitted corrections—not a private retention helper alone. Reuse the repository's Bun tests and integration harness; no new framework. The examples below are proposed for review before implementation.

| ID | Concrete example | Expected external observation |
| --- | --- | --- |
| F1 | XML versus CSV old report, identical prior opinions, later reports exceed 4K; also valid authored-brief variant | Needed fact and lineage survive in the next actual packet; packets differ for the fact, not just an omission counter |
| F2 | New user says CSV/await approval; old brief says XML/ready; another task has its own facts | New decision wins; no execution from the old brief and no cross-task factual overwrite |
| F3 | Legacy description/plain blocker outside `auditBrief`; missing or unsupported source in a supplied brief | Valid existing reports remain usable; only unsupported findings stay uncertain, with no summary/supplement-only completion correction |
| F4 | Compaction/reload, failed later chunk and prior completed pairs | Applicable material/progress restore; unverifiable origins are marked; no false range completion or duplicate rebilling of identical pairs |
| P1 | 254 candidates + one fallback; 255 + one fallback; cold/full reproduction with 260 reports | 255 is eligible; 256 is withheld at zero attempts for that question; every actual Choice remains within the contract without silent loss |
| P2 | Explicit applicability establishes a complete bounded source set, with a valid current account and eligible public primary; cold/full 260 potentially needed reports even with a valid brief | Complete bounded sets remain usable; a legal brief alone does not bound uncertain primary eligibility. The 260-report case stays locally incomplete without truncation or invalid paid work |
| P3 | One blocked task/source Choice or oversized board-matching Choice; another supported independent finding | No unsupported correction/receipt; compatible valid work survives; local blocking is not usage or a context rejection |
| I1 | Same brief/no-op read versus changed fact, source, coverage or criteria | Unchanged pairs reuse with no new request; changed definitions and stale advice do not reuse the old answer |
| R1 | Prior admissible-prefix cases, with/without usage and request-only/stricter-request/two-tier limits; genuine overflow | Existing useful-batch, coverage, exact-guard and irreducible-stop invariants remain intact; privacy/ownership gates still hold |

Mocked results prove projection, admission, resumption and delivery mechanics, not JEV factual correctness. Review must include positive ordinary cases so uncertainty handling does not replace useful auditing. Real semantic comparisons, if later desired, need separate authorization, fixtures and a cost/privacy boundary.

## Risks / Trade-offs

- **A brief can omit or misstate a fact** → retain reported status, explicit coverage and gaps; user precedence and source guards remain. Do not advertise semantic-losslessness.
- **Preserving uncovered legacy reports can grow fixed state/candidate sets** → offer the optional scoped brief and stop irreducible affected work honestly; no sibling-expansion or arbitrary cropping.
- **Unresolved relations can withhold some cold/full findings** → disclose the exact limitation once, preserve independent valid results, and retain a successful bounded-source control. Repeating the same legal brief cannot guarantee recovery; do not create a material-request loop or a global refusal by default.
- **Named views add indirection or duplicate text** → serialize bodies once with direct role/scope labels; avoid a new graph/store or deep reference chain.
- **Reported material may be mistaken for permission/proof** → keep original roles and current correction guards; never let metadata/source IDs themselves lift authority.
- **Docs do not settle OpenRouter limits/caching or model quality** → preserve current conservative capacity behavior; no undocumented facility or automatic paid probe is a dependency.

## Migration Plan

1. Present all four planning artifacts and the proposed examples/convention for user review; do not apply in this planning workflow.
2. On a subsequent implementation request, work against the reviewed anti-amplification source candidate. Deliver factual continuity and candidate safety as small verified slices; stop for a newly discovered material requirement rather than silently narrowing coverage.
3. Keep existing tasks/ledgers readable. Document optional brief publishing, reported-versus-verified meaning and the clarification fallback. No installed-plugin update, data migration or automatic task mutation is required.
4. Run offline acceptance/regression checks, full tests, typecheck and strict OpenSpec validation. Obtain independent functional review and actual GitHub Actions Linux/Windows E2E evidence. Record candidate/run identity and results; a configured Windows job is not a pass. Publication needed to run CI requires separate permission.
5. User acceptance and any later activation/publication/archive are distinct gates. Rollback changes code only, leaves historical data readable and optional metadata ignored by older readers, and reintroduces these context/Choice limitations; it must not roll back the anti-amplification fixes.

## Open Questions

These do not block the chosen bounded design: Jev's effective OpenRouter split limits; undocumented tokenizer/cache facilities; and whether named material/narrower candidate definitions improve real-model accuracy. Resolve only through vendor clarification or a separately authorized experiment, not as hidden implementation prerequisites.

## Sources

Official sources reviewed 2026-10-02:

- [Choice: up to 255 options, full applicable lists, structured option descriptions](https://docs.typesafe.ai/primitives/choice).
- [Models: direct 64K total and 32K state-plus-longest-question](https://docs.typesafe.ai/models).
- [State: named structured data](https://docs.typesafe.ai/concepts/state) and [building with TypeSafe: relevant state and atomic questions](https://docs.typesafe.ai/concepts/how-to-build-with-system-one).
- [Jev 1.13 jaggedness: irrelevant detail, indirection and adversarial-state caveats](https://docs.typesafe.ai/model-jaggedness/jev-1.13).
- [Primitives: independent same-state questions](https://docs.typesafe.ai/primitives), [fan-out](https://docs.typesafe.ai/patterns/fan-out), [confidence](https://docs.typesafe.ai/confidence), [public OpenAPI](https://api.typesafe.ai/openapi.json).
- Local current-source seams: `context.ts::collectContext`, `rolling.ts::retainedFrom` / `reviewRolling`, `typesafe.ts::buildAuditRequest` / `evaluate`, and `index.ts` snapshot/freshness/delivery flow. Packet observations above are offline findings, not provider evaluations.
