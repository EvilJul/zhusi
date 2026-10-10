# Tasks

## 1. Package and project foundation

- [x] 1.1 Create `package.json` with the `zhusi` bin entry, Node.js engine constraint, build/test scripts, and package files; verify `npm install` and `npm pack --dry-run` succeed.
- [x] 1.2 Create the TypeScript configuration and source layout for `cli`, `domain`, `services`, `storage`, `report`, `explain`, and `integrations`; verify the compiler emits the expected `dist` entry without errors.
- [x] 1.3 Select and lock the CLI parser, runtime schema validator, test runner, and MCP SDK dependency versions; verify a clean install from the lockfile reproduces the dependency tree.
- [x] 1.4 Add a cross-platform process entry that handles Windows and POSIX execution and prints actionable version/help output; verify `node dist/cli/index.js --help` exits 0 on the development host.

## 2. Domain schema and result contracts

- [x] 2.1 Define schemas for project config, state, design revision, architecture explanation, code snapshot, warnings, and errors; verify valid fixtures parse and invalid/unknown major versions are rejected.
- [x] 2.2 Define stable result and error envelopes plus exit-code mapping for success, runtime failure, invalid input, conflict/busy, and unmet-stage conditions; verify unit tests cover JSON and human-readable modes.
- [x] 2.3 Define path, size, count, URL, and untrusted-text validation rules; verify traversal, symlink escape, oversized input, unsafe protocol, and script-closing fixtures are rejected or escaped.

## 3. Workspace storage and recovery

- [x] 3.1 Implement project-root discovery and `.zhusi/` initialization with non-destructive repeat behavior; verify `init` creates the minimum workspace and a second run preserves file hashes.
- [x] 3.2 Implement immutable revision and explanation snapshot naming, state pointer reads, and atomic same-directory publication; verify a successful write leaves a complete readable snapshot and preserves the prior revision.
- [x] 3.3 Implement exclusive project locking with owner metadata, bounded acquisition timeout, safe release, and stale-lock diagnostics; verify parallel writers produce one success and one busy/conflict result without corruption.
- [x] 3.4 Implement expected-revision checks and request-ID idempotency; verify stale writes are rejected and retrying the same request does not create duplicate logical revisions.
- [x] 3.5 Implement validation and dry-run repair for malformed JSON, orphan snapshots, broken pointers, and recoverable stale locks; verify dry-run makes no filesystem changes and reports actionable repairs.

## 4. Core application services

- [x] 4.1 Implement the init service and project selection rules for current directory and explicit `--project PATH`; verify spaces, Unicode, relative paths, and absolute paths resolve to the same root.
- [x] 4.2 Implement status service with stage, revision, unresolved questions, stale report/explanation indicators, and warnings; verify stable human and `--json` outputs.
- [x] 4.3 Implement validate service over all workspace schemas and references; verify invalid projects return the documented exit code without mutation.
- [x] 4.4 Implement report service input model and export service for Markdown; verify reports contain source revision, warnings, unresolved high-priority items, and no unsafe HTML execution.
- [x] 4.5 Implement repair service with `--dry-run` default and explicit mutation confirmation; verify repair never silently guesses user intent or overwrites original snapshots.

## 5. Existing-project architecture explanation

- [x] 5.1 Implement code snapshot capture for Git commit or deterministic bounded directory fingerprint, including read scope and tool metadata; verify `.git` and `.zhusi` are excluded from the fingerprint.
- [x] 5.2 Implement structured explanation ingestion/normalization for summary, walkthrough, deep dive, evidence, classification, confidence, and limitations; verify missing evidence becomes inferred/unknown rather than confirmed fact.
- [x] 5.3 Implement `explain --existing PATH` service and CLI output that saves an immutable explanation snapshot without copying source files or executing shell commands; verify a fixture payload produces a retrievable explanation.
- [x] 5.4 Implement stale detection by comparing saved code snapshot with current commit/fingerprint; verify status and report mark changed-source explanations stale.
- [x] 5.5 Implement the optional comparison model between a design revision and existing implementation observations; verify differences are labeled consistent, divergent, unknown, or stale without automatically calling divergence a defect.

## 6. CLI adapters and offline report

- [x] 6.1 Implement command handlers for `init`, `status`, `validate`, `report`, `export`, `repair`, and `explain`, keeping handlers limited to parsing, service calls, and presentation; verify each command process test uses the shared services.
- [x] 6.2 Implement stdout/stderr discipline, `--json`, help/version, signal cleanup, and stable exit codes; verify stdout remains valid JSON and stderr contains diagnostics only.
- [x] 6.3 Implement self-contained HTML/CSS/SVG report rendering with escaped text, safe links, expandable sections, architecture explanation layers, and print styles; verify the output opens through `file://` without network access.
- [x] 6.4 Add an executable `mcp` launch boundary that binds a project root and does not pollute stdout, while leaving the complete MCP tool set to the follow-up MCP change; verify the boundary reports missing/invalid configuration clearly.

## 7. Cross-platform packaging and documentation

- [x] 7.1 Add README installation and usage instructions for `npx zhusi`, global npm installation, Windows PowerShell/cmd, macOS/Linux, and PATH repair; verify examples match the built package.
- [x] 7.2 Add packed-package smoke tests that install the tarball locally and run `init`, `status`, `validate`, `report`, and `explain`; verify no repository source path is required at runtime.
- [x] 7.3 Add CI matrix coverage for Windows, macOS, and Linux with supported Node.js architectures/runtimes available to CI; verify the smoke suite records platform-specific failures.
- [x] 7.4 Test Unicode paths, spaces, CRLF/LF, permission errors, file locks, symlink boundaries, and offline reports on each available platform; verify behavior remains equivalent or produces an explicit platform-specific diagnostic.
- [x] 7.5 Update project design/roadmap status to distinguish implemented CLI behavior from remaining MCP/Skill work; verify README no longer presents implemented commands as merely hypothetical after release.

## 8. Integration and release gate

- [x] 8.1 Run type checking, linting, unit tests, process-level CLI tests, and report security tests; verify all required checks pass from a clean checkout.
- [x] 8.2 Run `npm pack`, install the generated tarball in a temporary project, and execute the documented `npx` and global-style command paths; verify `zhusi init` succeeds and repeat initialization is non-destructive.
- [x] 8.3 Run `openspec validate --change "implement-cross-platform-cli" --strict` and reconcile any spec/task consistency errors; verify all planning artifacts and implementation references are complete.
- [x] 8.4 Produce a release-readiness summary listing supported Node/platform combinations, known limitations, test commands, and the separate follow-up scope for full MCP tools and Skill adapters.
