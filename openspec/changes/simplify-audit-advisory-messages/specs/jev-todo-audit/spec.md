## ADDED Requirements

### Requirement: One visible body for each main-agent advisory

Every ordinary correction, Choice-context clarification and factual-context clarification sent to the main agent SHALL have one canonical textual body. The default transcript view SHALL show all task-specific content and collapse only the positively recognized shared generic advisory footer. Expansion SHALL reveal the complete original body, identical to the main-agent content at the plugin delivery boundary apart from styling and wrapping. The extension SHALL NOT collapse suggestions, evidence, task/question/source scope, board-only restrictions or recovery limits; reconstruct a human summary; or modify delivered content to implement folding. Unrecognized historical wording SHALL remain fully displayed rather than being heuristically shortened. Backend JEV requests and responses SHALL remain outside this presentation contract.

#### Scenario: User reads an ordinary correction
- **WHEN** an audit sends a suggestion about task #5 to the main agent
- **THEN** one visible advisory shows the complete suggestion and evidence without requiring expansion
- **AND** only its recognized shared footer starts collapsed, with any board-only restriction still visible

#### Scenario: User reads either incomplete-context advisory
- **WHEN** the plugin sends a Choice-context or factual-context clarification to the main agent
- **THEN** its affected scope, limits and source guidance remain fully visible by default
- **AND** the display does not substitute a generic warning for the actual clarification

#### Scenario: User expands an advisory
- **WHEN** the user expands a message whose shared footer was collapsed
- **THEN** the complete stored body including that footer is displayed without regeneration
- **AND** the main-agent message content and delivery options remain unchanged

#### Scenario: Similar wording appears in task evidence
- **WHEN** an advisory quotes footer-like wording in its task-specific body
- **THEN** that evidence remains visible; only a recognized terminal shared footer can be collapsed
- **AND** an unrecognized or changed ending remains fully displayed

#### Scenario: No interactive UI is available
- **WHEN** an eligible advisory is delivered in a non-interactive session
- **THEN** its content and delivery behavior remain independent of interactive rendering
- **AND** no extra model request is made to produce presentation text

### Requirement: Concise advisories preserve source and authority

New advisories SHALL use one plugin-attributed heading, followed by the concrete suggestion or limitation and its affected task/source scope. Generic source, authority and acknowledgment guidance SHALL be stated once rather than repeated in multiple wrappers. The body SHALL identify its origin as the pi-jev-todo-audit plugin and state that it is reference feedback, not a user message, instruction or new authorization, even when transported under a user role. It SHALL preserve the user's latest scope and wait conditions, discourage interruption or task switching solely because the advisory arrived, and require no separate reply. A general statement about not granting new authorization SHALL NOT revoke existing user permission.

Corrections SHALL retain task identifiers and sanitized source evidence, distinguish reported outcomes from independent execution verification, and remain open to being disregarded if mistaken or already satisfied. Concision SHALL NOT silently truncate additional applicable findings or necessary limits. Terminal board-only reconciliation SHALL explicitly restrict work to updating the board and returning control, without executing blocked tasks or bypassing a wait. Suggestions concerning continued execution SHALL remain limited to already-authorized actionable work. Existing delivery eligibility, freshness, repeat suppression and wake conditions SHALL remain unchanged.

#### Scenario: A reported completion needs a board update
- **WHEN** a supplied main-agent report supports reconciling task #5 as completed
- **THEN** the advisory identifies #5 and the sanitized source, labels completion as reported rather than independently verified, and presents the suggestion before its generic boundary guidance
- **AND** duplicate plugin headings and repeated generic disclaimers are absent

#### Scenario: Only bookkeeping is allowed at terminal stop
- **WHEN** a supported board mismatch warrants a board-only terminal turn while task execution remains blocked
- **THEN** the advisory directs the agent to reconcile only the board if still applicable and then return control
- **AND** it grants no permission to execute the task or bypass the blocker

#### Scenario: Prior permission exists or a wait remains unresolved
- **WHEN** an advisory reaches the main agent with an existing user authorization or an unresolved wait condition
- **THEN** its wording neither resets the existing permission nor supplies the missing permission or input
- **AND** arrival of the advisory alone does not justify interrupting or switching the current task

#### Scenario: A clarification alone cannot restart work
- **WHEN** a terminal review has only a split or planning-clarification suggestion that does not qualify for a restart
- **THEN** the presentation change does not start a new work turn or promote the suggestion into execution authority

### Requirement: Incomplete-review messages retain actionable limits

Incomplete-review advisories SHALL lead with the affected scope, what prevented the finding and what genuine information can help. They SHALL preserve the distinction between local Choice withholding and factual admission failure. They SHALL NOT imply completion, continuation, new execution authority, a task-status change, guaranteed recovery from a brief, or permission to remove necessary sources. Existing completed work and independently supported findings SHALL remain qualified according to their existing scope rules.

A Choice-context message SHALL retain the affected question identifiers, actual option counts and the 255-option limit including fallback, and disclose that those questions had no model judgment or provider attempt. A factual-context message SHALL retain affected tasks, the fact that progressing recovery could not admit required material, and the permitted public report IDs available for declared coverage, or their absence. Where a task account or optional `metadata.auditBrief = { text, sources, covers }` is suggested, the message SHALL preserve that it is reported data rather than proof or permission, that `sources` is not an exclusive allowlist, that `covers` does not retire necessary primary evidence, and that repeating the account does not guarantee admission. Known credentials SHALL remain redacted before either delivery or display.

#### Scenario: A Choice has 256 options including fallback
- **WHEN** an affected evidence question is withheld locally at 256 options
- **THEN** the advisory names the question, its count and the 255 limit and states that it received no model judgment or provider attempt
- **AND** it requests genuine applicability information without suggesting candidate truncation or deletion of necessary tasks
- **AND** it does not withhold an independently supported sibling correction solely to simplify presentation

#### Scenario: Required factual material cannot fit
- **WHEN** factual recovery reaches an irreducible affected scope for #5 with public report IDs report-1 and report-2 available
- **THEN** the advisory identifies #5, the admission limitation and those report IDs
- **AND** a suggested current account preserves source obligations, user constraints and uncertainty instead of promising recovery or authorizing execution

#### Scenario: No eligible report origin exists
- **WHEN** a factual-context advisory has no permitted public report IDs
- **THEN** it states that no such origins are available rather than inventing coverage identifiers

### Requirement: Visible advisories do not produce duplicate delivery receipts

The extension SHALL NOT emit an additional notification merely to announce that an already-visible advisory was injected. Operational notifications such as dependency failures, review failures, recovery and optional aligned status SHALL remain distinct UI-only feedback, with their existing eligibility retained. They SHALL NOT be converted into agent messages to achieve presentation parity. Status wording SHALL NOT imply that advice was delivered when no advisory was sent; conversely, a failure status SHALL NOT claim that no message was sent when a clarification was delivered earlier in that audit. This requirement does not remove a distinct operational failure or recovery notice accompanying an advisory.

#### Scenario: An ordinary correction is visible
- **WHEN** the plugin delivers a visible correction, including with `notifyOnAligned` disabled
- **THEN** the transcript contains the correction without an additional `correction injected` receipt

#### Scenario: A dependency is unavailable
- **WHEN** the shared review service is unavailable and the audit is skipped
- **THEN** the user receives the existing eligible operational notice without any main-agent advisory or new work turn

#### Scenario: Failure follows a factual clarification
- **WHEN** an incomplete review delivers a factual-context clarification and reports the audit failure
- **THEN** the clarification remains the shared body and the failure notice remains UI-only
- **AND** the notice does not incorrectly claim that nothing was sent

### Requirement: Historical advisory bodies remain stable

Redraw, session reopening and later wording or configuration changes SHALL use the original stored advisory content rather than regenerate its text. Only a recognized shared footer can start collapsed; expansion SHALL show the original body in full. Earlier unrecognized verbose advisories SHALL remain fully displayed without a data migration or added new disclaimer. Presentation changes SHALL NOT turn an old advisory into fresh evidence or re-arm a previously suppressed demand.

#### Scenario: Reopen an earlier advisory after a wording update
- **WHEN** a session containing an older verbose advisory is reopened after this change
- **THEN** its original body remains visible without a new body wrapper, summary or rewrite
- **AND** reopening alone does not resend the advisory

#### Scenario: Redraw a new advisory
- **WHEN** the terminal width or theme changes after publication
- **THEN** styling or line wrapping can change while the stored and delivered body remains unchanged
