# Project Workspace Specification

## Purpose

定义本地 `.zhusi/` 工作空间及其快照生命周期，保证设计资料可恢复、可审阅、可并发保护，并为 CLI、MCP 和报告共享同一数据规则。

## ADDED Requirements

### Requirement: The workspace SHALL use versioned immutable snapshots

The workspace MUST store configuration and state separately from immutable revision files. Each accepted write MUST create or reference a complete snapshot containing schema version, project ID, revision, timestamp, actor metadata, and design data. Markdown exports MUST NOT become a second authoritative store.

#### Scenario: Read the current revision

- **WHEN** the current state points to revision 3
- **THEN** reading the project returns the complete revision 3 snapshot and its metadata

#### Scenario: Preserve history

- **WHEN** a valid design update is accepted
- **THEN** the previous revision remains readable and unchanged

### Requirement: Writes SHALL be validated, locked, and atomic

Every mutating operation MUST validate input and references, acquire a project-local lock, re-check the expected revision, write a temporary snapshot, atomically publish it, and update the current-state pointer only after the snapshot is complete.

#### Scenario: Concurrent stale write

- **WHEN** a writer submits an expected revision older than the current revision
- **THEN** the operation returns a revision-conflict error with the latest revision and does not overwrite data

#### Scenario: Crash before pointer update

- **WHEN** a process stops after writing a snapshot but before updating the state pointer
- **THEN** the current project remains readable and validation reports the unreferenced snapshot for explicit repair

### Requirement: Writes SHALL be idempotent by request ID

A mutating request with a previously committed `requestId` MUST return the prior result or an equivalent idempotent response and MUST NOT create another logical submission.

#### Scenario: Retry the same request

- **WHEN** a client retries a request with the same request ID after an uncertain connection
- **THEN** the CLI returns the prior outcome and the revision count does not increase twice

### Requirement: The workspace SHALL reject unsafe and unsupported input

The workspace MUST reject unsupported schema major versions, invalid JSON, path traversal outside the bound project root, symlink escapes where applicable, oversized fields/files, and unsafe report links or markup.

#### Scenario: Unsupported schema

- **WHEN** a project contains a newer unsupported schema major version
- **THEN** reads and writes fail explicitly with an upgrade-required error and do not substitute empty data

#### Scenario: Project path escape

- **WHEN** a command resolves a path outside the bound project root
- **THEN** the command rejects it before reading or writing
