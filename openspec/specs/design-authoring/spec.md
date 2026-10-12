# design-authoring Specification

## Purpose
让用户与 AI 客户端能读取当前设计、生成可填写的提交骨架，并把修改后的完整 revision 安全地写回 `.zhusi/`，同时保留版本冲突检测、幂等提交与阶段完整性约束。

## Requirements

### Requirement: design show SHALL return the complete current revision

`zhusi design show` MUST return the current design revision together with the `expectedRevision` value that a subsequent submission must echo back. When the project has no revision yet, it MUST report that state explicitly instead of returning fabricated content. The command MUST be read-only.

#### Scenario: Read an existing revision

- **WHEN** the user runs `zhusi design show --json` in a project whose current revision is 3
- **THEN** stdout contains the complete revision 3 document plus `expectedRevision: 3`, and no file is modified

#### Scenario: Read a project without revisions

- **WHEN** the user runs `zhusi design show --json` in a freshly initialized project
- **THEN** the result reports `expectedRevision: 0` and a null or empty revision rather than an invented design

### Requirement: design template SHALL emit a fillable submission skeleton

`zhusi design template` MUST emit a submission skeleton that already satisfies the submission schema, including the current `expectedRevision`, a fresh `requestId`, and empty design collections. It MUST support writing to stdout by default and to a file when an output path is given.

#### Scenario: Generate a skeleton

- **WHEN** the user runs `zhusi design template --json` at revision 3
- **THEN** stdout contains a skeleton with `expectedRevision: 3`, a `requestId`, and empty `requirements`, `decisions`, `questions`, `reviews`, and `architecture` collections

#### Scenario: Write the skeleton to a file

- **WHEN** the user runs `zhusi design template --out design.json`
- **THEN** the skeleton is written to that path and the command reports the location

### Requirement: design submit SHALL validate and persist a new immutable revision

`zhusi design submit --input FILE` MUST parse the submission, validate it against the design schemas, and persist it as the next immutable revision through the existing locked, atomic publication path. Server-managed fields (`schemaVersion`, `projectId`, `revision`, `createdAt`) MUST be assigned by the tool and MUST NOT be taken from the submission. The command MUST support `--input -` to read from stdin.

#### Scenario: Submit a valid design

- **WHEN** the user submits a valid payload with `expectedRevision` equal to the current revision
- **THEN** a new revision is created, the state pointer advances by exactly one, and the previous revision file is unchanged

#### Scenario: Invalid submission

- **WHEN** the payload violates the design schema, for example a decision without a summary
- **THEN** the command exits with the invalid-input code, leaves the workspace unchanged, and reports the validation error

### Requirement: Submissions SHALL detect stale writes

A submission MUST carry an `expectedRevision` either in the payload or via an explicit option. If it does not match the current revision at commit time, the command MUST fail with a revision-conflict result that includes the latest revision, and MUST NOT overwrite existing data.

#### Scenario: Concurrent modification

- **WHEN** a client reads revision 3, another writer commits revision 4, and the first client then submits with `expectedRevision: 3`
- **THEN** the submission is rejected with a conflict and the latest revision 4

#### Scenario: Missing expected revision

- **WHEN** the payload omits `expectedRevision` and the command is not given an explicit expected revision
- **THEN** the command refuses to write and explains that an expected revision is required

### Requirement: Submissions SHALL be idempotent by requestId

A submission that carries a `requestId` previously committed MUST return the prior result and MUST NOT create another revision. When the payload omits `requestId`, the tool MUST generate one so the committed revision still records a stable identifier.

#### Scenario: Retry the same submission

- **WHEN** the same payload with the same `requestId` is submitted twice
- **THEN** the second call reports the already-committed revision and the revision count does not increase

### Requirement: Submissions SHALL reject an unsupported ready stage

A submission whose `stage` is `ready` MUST be rejected when the revision still contains unresolved questions with `blocker` priority. The rejection MUST use the unmet-stage exit code and MUST NOT write the revision.

#### Scenario: Ready with an open blocker

- **WHEN** a submission sets `stage: "ready"` while a question with priority `blocker` has no resolved status
- **THEN** the command fails with the unmet-stage code, reports the blocking question, and leaves the workspace unchanged

#### Scenario: Ready after blockers are resolved

- **WHEN** every `blocker` question is marked resolved and the submission sets `stage: "ready"`
- **THEN** the revision is accepted

### Requirement: design submit SHALL support non-mutating validation

`zhusi design submit --dry-run` MUST run the full parse, schema, expected-revision, and stage checks and report the outcome without creating a revision or changing the state pointer.

#### Scenario: Dry run a valid payload

- **WHEN** the user submits a valid payload with `--dry-run`
- **THEN** the command reports success and the workspace contains no new revision file

### Requirement: Authoring I/O SHALL be stream-safe and side-effect free

`design` commands MUST write structured results to stdout and diagnostics to stderr, MUST NOT execute shell commands, MUST NOT modify source code, and MUST NOT read or write outside the bound project root.

#### Scenario: Machine-readable failure

- **WHEN** a `design submit` fails with `--json`
- **THEN** stdout contains a valid JSON error envelope with `code`, `message`, `retryable`, and the latest revision when applicable, and stderr carries no structured result

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
