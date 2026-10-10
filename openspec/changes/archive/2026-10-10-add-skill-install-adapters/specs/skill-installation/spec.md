# Skill Installation Specification

## Purpose

让用户用一条命令把筑思注册给 AI 客户端：按宿主安装 Skill 内容并在指令文件中维护受管说明，使 agent 能自动发现 `zhusi`、理解读取→修改→提交的回路，并按规则调用它。

## ADDED Requirements

### Requirement: install-skill SHALL install a host-specific skill bundle

`zhusi install-skill --host HOST` MUST install the packaged skill content for the selected host. Supported hosts MUST include `codex`, `claude`, and `cursor`, plus `all` to install every host. Codex MUST install to `.agents/skills/zhusi/`, Claude to `.claude/skills/zhusi/`, and Cursor to `.cursor/rules/zhusi.mdc`. An unknown host MUST be rejected with a message listing the supported values.

#### Scenario: Install for Codex

- **WHEN** the user runs `zhusi install-skill --host codex` in a project directory
- **THEN** `.agents/skills/zhusi/SKILL.md` exists with the packaged skill content and the command exits 0

#### Scenario: Install for every host

- **WHEN** the user runs `zhusi install-skill --host all`
- **THEN** the Codex, Claude, and Cursor artifacts are all written

#### Scenario: Unknown host

- **WHEN** the user runs `zhusi install-skill --host vscode`
- **THEN** the command fails with the invalid-input exit code and lists `codex`, `claude`, `cursor`, and `all`

### Requirement: Installation SHALL be non-destructive by default

When a target file already exists with different content, `install-skill` MUST NOT overwrite it without `--force`. It MUST report the skipped path and still exit 0, so repeated runs are safe. With `--force`, the file MUST be replaced.

#### Scenario: Repeat installation

- **WHEN** the user runs `install-skill --host codex` twice
- **THEN** the second run reports that the file already matches or is skipped, and does not duplicate content

#### Scenario: Local edits preserved

- **WHEN** a target skill file was edited locally and `install-skill` runs without `--force`
- **THEN** the local file is left unchanged and the command reports the skip

### Requirement: Instruction files SHALL use a managed block

For hosts that use an instruction file (Codex `AGENTS.md`, Claude `CLAUDE.md`), installation MUST maintain a delimited managed block. Re-running MUST replace that block in place rather than appending a duplicate. Content outside the block MUST be preserved byte-for-byte.

#### Scenario: First install appends the block

- **WHEN** `AGENTS.md` exists without a zhusi block
- **THEN** the zhusi block is appended and all pre-existing content is preserved

#### Scenario: Re-install updates in place

- **WHEN** `install-skill` runs again with a newer packaged block
- **THEN** the block content is replaced and no second block is added

### Requirement: install-skill SHALL support a user-level scope

`install-skill --user` MUST install into the host's user configuration directory instead of the project, so the agent discovers the tool in any project. The command MUST report the resolved destination paths.

#### Scenario: User-level install

- **WHEN** the user runs `zhusi install-skill --host codex --user`
- **THEN** the skill is written under the user's Codex skill directory and the project is not modified

### Requirement: install-skill SHALL support non-mutating preview

`install-skill --dry-run` MUST report every action it would take, including created, updated, skipped, and unchanged paths, without creating or modifying any file.

#### Scenario: Dry run

- **WHEN** the user runs `install-skill --host all --dry-run`
- **THEN** stdout lists the planned actions and no file is created or changed

### Requirement: The installed skill SHALL document the authoring loop

The packaged skill content MUST describe when to use zhusi and the read → modify → submit loop, including that `expectedRevision` is required, that server-managed fields must not be supplied, that `requestId` provides idempotency, and that `stage: ready` is rejected while unresolved blocker questions remain.

#### Scenario: Skill content is actionable

- **WHEN** the installed `SKILL.md` is read by an agent
- **THEN** it names the commands to read, template, submit, and report, and states the submission rules above

### Requirement: The published package SHALL include the skill content

The npm package MUST ship the skill content so `install-skill` works from an installed tarball without the repository present. A packed-package smoke run MUST confirm the skill file is available at runtime.

#### Scenario: Install from a packed tarball

- **WHEN** the package is installed from an npm tarball in a temporary project
- **THEN** `zhusi install-skill --host codex` writes the skill file successfully

### Requirement: install-skill output SHALL be stream-safe

Structured results MUST go to stdout and diagnostics to stderr. `--json` MUST emit a machine-readable summary of created, updated, skipped, and unchanged paths.

#### Scenario: Machine-readable summary

- **WHEN** the user runs `install-skill --host codex --json`
- **THEN** stdout contains a JSON object listing each action with its path and status
