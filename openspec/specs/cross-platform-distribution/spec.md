# cross-platform-distribution Specification

## Purpose
让筑思以同一 npm 包在 Windows、macOS 和 Linux 的 x64/arm64 环境中安装、发现和运行，减少命令未找到、路径差异和 stdio 行为差异带来的使用障碍。

## Requirements

### Requirement: The package SHALL expose a portable executable entry

The published package MUST declare a `zhusi` executable entry and support both `npx zhusi <command>` and global-install invocation after `npm install --global zhusi`. The executable MUST use the same application behavior in both modes.

#### Scenario: Run without global installation

- **WHEN** a user runs `npx zhusi init` in a supported Node.js environment
- **THEN** the package resolves and runs the CLI without requiring the repository path in PATH

#### Scenario: Run after global installation

- **WHEN** a user installs the package globally and invokes `zhusi init`
- **THEN** the command resolves through the package manager's bin directory and initializes the selected project

### Requirement: The CLI SHALL be platform-neutral

The CLI MUST use runtime path and file APIs rather than shell-specific commands or hard-coded path separators. Behavior MUST remain equivalent across Windows PowerShell/cmd, macOS shells, Linux shells, and CI environments.

#### Scenario: Unicode and spaced path

- **WHEN** the project root contains spaces or Unicode characters
- **THEN** init, status, validate, report, and explain resolve the same project without truncating or corrupting paths

#### Scenario: Line-ending differences

- **WHEN** project files use CRLF or LF line endings
- **THEN** schema validation and report generation behave equivalently

### Requirement: Installation and runtime failures SHALL be actionable

When the command is unavailable, Node.js is unsupported, a global bin directory is not on PATH, or a permission problem occurs, documentation and CLI diagnostics MUST identify the likely cause and an actionable remedy without claiming the project operation failed.

#### Scenario: Command is not found

- **WHEN** a user types `zhusi` before installing the package or before PATH refresh
- **THEN** the installation guidance points to `npx zhusi` or package-manager PATH repair

### Requirement: Release validation SHALL cover the supported matrix

Before release, the project MUST verify installation, CLI commands, file locking, report opening, and MCP stdio launch on Windows, macOS, and Linux for supported x64/arm64 runtimes, with platform-specific failures recorded.

#### Scenario: Cross-platform smoke test

- **WHEN** the release smoke suite runs on a supported matrix entry
- **THEN** it installs the package, runs init/status/validate/report, opens the generated file, and exits without platform-specific assumptions
