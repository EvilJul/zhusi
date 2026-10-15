# cli-commands Specification

## Purpose
定义筑思 CLI 的用户可见命令、输入输出、退出码和错误处理，使设计数据能够通过跨平台命令行被创建、检查、导出和报告。

## Requirements

### Requirement: CLI SHALL expose the core project commands

The installed `zhusi` command MUST expose `init`, `status`, `validate`, `report`, `export`, `repair`, and `explain` commands. The `explain` command MUST support `--existing PATH`; unknown commands MUST return a non-zero exit code and a concise usage hint.

#### Scenario: Show help without a project

- **WHEN** a user runs `zhusi --help` outside a Zhusi project
- **THEN** the CLI prints command and option help to stdout and exits with code 0

#### Scenario: Reject an unknown command

- **WHEN** a user runs an unknown command
- **THEN** the CLI prints an actionable error to stderr, includes the help command, and exits non-zero

### Requirement: init SHALL create a non-destructive project workspace

`zhusi init` MUST create a `.zhusi/` workspace in the selected project root without overwriting an existing valid workspace. It MUST support an explicit `--project PATH` option and default to the current working directory.

#### Scenario: Initialize a new directory

- **WHEN** the user runs `zhusi init` in a directory without `.zhusi/`
- **THEN** the CLI creates the minimum valid configuration and state files and exits 0

#### Scenario: Repeat initialization

- **WHEN** the user runs `zhusi init` where a valid `.zhusi/` already exists
- **THEN** the CLI leaves existing data unchanged, reports that the project is already initialized, and exits 0

### Requirement: read-only status and validate commands SHALL be safe

`status` and `validate` MUST NOT mutate project data. `status` MUST report stage, current revision, unresolved items, stale reports or explanations, and warnings. `--json` MUST produce machine-readable JSON on stdout.

#### Scenario: Status in a valid project

- **WHEN** the user runs `zhusi status --json` in an initialized project
- **THEN** the output contains a stable result shape with project ID, revision, stage, warnings, and stale indicators, and exits 0

#### Scenario: Validate malformed data

- **WHEN** the project contains malformed JSON or an unsupported schema version
- **THEN** `zhusi validate` reports the file and validation error, exits with the documented invalid-input code, and does not replace the file

### Requirement: report and export SHALL produce user-readable artifacts

`report` MUST generate an offline-openable HTML report under the project workspace. `export --format markdown` MUST generate a Markdown derivative with source revision and warning metadata. Neither command MUST silently omit unresolved high-priority items.

#### Scenario: Generate an offline report

- **WHEN** the user runs `zhusi report` in a valid project
- **THEN** the CLI generates a self-contained report that can be opened with a `file://` URL without a server or network connection

#### Scenario: Reject an unsupported export format

- **WHEN** the user requests an unsupported export format
- **THEN** the CLI reports supported formats and exits non-zero without modifying the project snapshot

### Requirement: repair SHALL be explicit and non-destructive by default

`repair --dry-run` MUST only report orphan snapshots, broken pointers, and recoverable stale locks. Any mutating repair MUST require an explicit option and MUST preserve the original files until the replacement is verified.

#### Scenario: Dry-run detects an orphan

- **WHEN** an unreferenced revision file exists and the user runs `zhusi repair --dry-run`
- **THEN** the CLI reports the orphan and makes no filesystem changes

### Requirement: CLI errors SHALL be stable and stream-safe

Structured results MUST be written to stdout, diagnostics and logs to stderr, and the CLI MUST use stable exit categories for success, runtime failure, invalid input, conflict/busy, and unmet design stage. The CLI MUST never write logs to stdout when used as an MCP stdio child.

#### Scenario: Machine-readable error

- **WHEN** a command fails with `--json`
- **THEN** stdout contains a valid JSON error envelope with code, message, retryable, and applicable latest revision fields

### Requirement: CLI SHALL provide review and disposition commands

`zhusi design review --input` MUST append reviews or opinions, and `zhusi design dispose` MUST accept either `--review/--decision/--reason` or a batch `--input`, with `--expected-revision`, `--request-id`, and `--dry-run`. Decisions accept `accept`, `reject`, and `defer`.

#### Scenario: Unknown decision

- **WHEN** `--decision` is not one of accept, reject, defer
- **THEN** the command exits with code 2 and writes nothing
