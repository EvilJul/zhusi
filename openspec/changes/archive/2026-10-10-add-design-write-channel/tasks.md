# Tasks

## 1. Submission schema and domain contracts

- [x] 1.1 Add `DesignSubmissionSchema` covering optional `expectedRevision`, optional `requestId`, optional `actor`, defaulted design collections, and the architecture structure; verify a minimal payload parses and that server-managed keys such as `revision` and `projectId` are rejected.
- [x] 1.2 Export a template builder that produces a schema-valid skeleton for a given expected revision, including a fresh `requestId`; verify the skeleton parses with no further edits.
- [x] 1.3 Implement the ready-stage check as a pure predicate over a parsed revision; verify it flags unresolved `blocker` questions and ignores resolved ones and non-blocker priorities.

## 2. Authoring service

- [x] 2.1 Implement `readDesign` returning the current revision, `expectedRevision`, and project id, and reporting the empty state when no revision exists; verify it is read-only.
- [x] 2.2 Implement `submitDesign` that parses the envelope, assigns server-managed fields, runs schema and ready checks, and delegates to `Workspace.commitRevision`; verify a valid payload advances the revision by exactly one.
- [x] 2.3 Resolve the expected revision from the payload or the explicit option and reject the submission when neither is present; verify the error is actionable and no file changes.
- [x] 2.4 Wire stdin and file input plus `--dry-run` so that dry runs perform every check but create no revision and do not move the state pointer.
- [x] 2.5 Reuse `requestId` idempotency and surface revision conflicts with the latest revision; verify a retry does not create a second revision and a stale write is rejected.

## 3. CLI commands

- [x] 3.1 Add the `design show` subcommand with human and `--json` output, keeping stdout for results and stderr for diagnostics.
- [x] 3.2 Add the `design template` subcommand that prints to stdout by default and writes to a path with `--out`.
- [x] 3.3 Add the `design submit` subcommand with `--input`, `--expected-revision`, `--dry-run`, `--project`, and `--json`; verify invalid input maps to the invalid-input exit code and unmet stage maps to the unmet-stage code.
- [x] 3.4 Confirm the handlers stay limited to parsing, service calls, and presentation, and update `--help` so the new commands are discoverable.

## 4. Tests

- [x] 4.1 Add unit tests for the submission schema, template builder, and ready-stage predicate.
- [x] 4.2 Add service tests for the read → modify → submit round trip, stale-write conflict, and `requestId` idempotency.
- [x] 4.3 Add process-level CLI tests for `design show`, `design template`, `design submit`, stdin input, `--dry-run`, and the error envelopes with their exit codes.
- [x] 4.4 Verify the generated report reflects a submitted revision, so the write channel and the report renderer are proven to connect.

## 5. Documentation and integration

- [x] 5.1 Update README with the read → modify → submit loop, the exit codes involved, and an example payload.
- [x] 5.2 Update the manual testing guide with a repeatable authoring scenario that ends in a rendered report.
- [x] 5.3 Update the release-readiness summary to record the new capability and the remaining MCP/Skill follow-up scope.
- [x] 5.4 Run `npm run typecheck`, `npm test`, `npm run smoke`, `npm pack --dry-run`, and `openspec validate "add-design-write-channel" --strict`; verify all pass from a clean checkout.
