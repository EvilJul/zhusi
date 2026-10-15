## ADDED Requirements

### Requirement: New content SHALL be concise
New design and explanation submissions MUST limit summaries to 120 characters, item summaries to 80 characters and one line, and details to at most six lines of 120 characters each. Decision reasons MUST be at most 120 characters; choices and each alternative/tradeoff/revisit condition MUST be at most 80 characters with at most five items per list. Existing snapshots MUST remain readable without mutation. Invalid new content MUST be rejected before publication, without semantic auto-truncation.

#### Scenario: Reject a verbose submission
- **WHEN** CLI or MCP receives a new summary longer than 120 characters
- **THEN** validation fails and no revision is created

#### Scenario: Read an older long snapshot
- **WHEN** a saved revision contains long text accepted by an earlier version
- **THEN** it remains readable and its full text is available under a clearly labelled collapsed preview

### Requirement: Reports SHALL prioritize actionable content
HTML reports MUST hide empty sections and default details/history to collapsed. Unresolved blocker and important questions MUST remain listed, while resolved questions MUST be removed from unresolved counts and placed in history without an active blocker badge. Requirement status and explanation classification MUST be visible. The default report MUST avoid repeating an identical decision title and choice.

#### Scenario: A blocker was resolved
- **WHEN** a question has priority blocker and status resolved
- **THEN** the report includes it in collapsed history, excludes it from pending counts and does not show an active blocker badge for it

#### Scenario: Many important questions
- **WHEN** there are more than five unresolved important questions
- **THEN** all remain listed rather than being hidden behind the general item limit

### Requirement: Architecture flows SHALL follow the active module
The report MUST remain offline and script-free. Directed edges and labels MUST be hidden by default and shown only for the hovered module's direct incoming and outgoing dependencies. The arrows MUST preserve dependency direction. Hover MUST take precedence over keyboard focus; keyboard focus without hover and touch focus MUST provide access. Unrelated edges MUST stay hidden. Printing MUST show all edges and reduced-motion settings MUST disable flow animation.

#### Scenario: Hover the middle module
- **WHEN** dependencies include A → B, B → C and C → D and B is hovered
- **THEN** A → B and B → C are shown with incoming/outgoing styles while C → D remains hidden

#### Scenario: Pointer leaves a module
- **WHEN** the pointer leaves and there is no keyboard-active module
- **THEN** flow lines and labels return to their hidden state

### Requirement: Reports SHALL include scope and actionable next steps when supplied
Design submissions MUST accept optional scope.included, scope.excluded and nextSteps fields through both CLI and MCP. Each next step MUST have a stable id, concise summary and acceptance result; prerequisites are optional. Completed steps MUST move to collapsed history.

#### Scenario: Round trip planning fields
- **WHEN** a submission includes scope and a pending action with acceptance criteria
- **THEN** reading the revision returns those fields and the report displays them without fabricating missing information

### Requirement: Change summaries SHALL derive from saved revisions
Reports MUST compare the current and previous saved design revisions when available. Changes MUST identify added, updated, resolved and removed items by id, ignore object key order, and reflect summary, stage, scope and architecture changes. They MUST NOT invent a previous version.

#### Scenario: A question is resolved in the next revision
- **WHEN** a previously open question with the same id becomes resolved
- **THEN** the report records one resolved question in the change summary
