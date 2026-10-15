## ADDED Requirements

### Requirement: Designs SHALL record business flows and development order

A design revision MUST accept `businessFlows` (trigger, ordered steps, exception branches) and `developmentOrder` (named steps with dependencies, deliverables, and status). Revisions written before these fields existed MUST still load with empty defaults.

#### Scenario: Legacy revision

- **WHEN** a stored revision has no `businessFlows` or `developmentOrder`
- **THEN** it loads successfully with both fields as empty arrays

#### Scenario: Report rendering

- **WHEN** a revision contains flows, development steps, and reviews
- **THEN** the HTML report and Markdown export show flows with exception branches, development order with dependencies, and each review folded as issue → opinions → disposition

### Requirement: Review dispositions SHALL be written back as a new revision

Adding reviews and disposing them (accepted, rejected, deferred) MUST each produce a new immutable revision derived from the revision named by `expectedRevision`, preserving stale-write detection and `requestId` idempotency. Unknown review ids MUST be rejected without writing.

#### Scenario: Reject a review with a reason

- **WHEN** a disposition rejects a review with a reason against the current revision
- **THEN** a new revision records the decision, reason, actor, and revision number, and the previous revision is unchanged

#### Scenario: Stale disposition

- **WHEN** the `expectedRevision` is no longer current and the `requestId` is new
- **THEN** the command fails with a revision conflict carrying the latest revision
