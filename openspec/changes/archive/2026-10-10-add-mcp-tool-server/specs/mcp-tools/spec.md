# MCP Tools Specification

## Purpose

让 AI 客户端通过 stdio MCP 把筑思发现为一组原生工具，直接读写项目设计资料，而不需要拼 shell 命令或依赖 PATH。

## ADDED Requirements

### Requirement: zhusi mcp SHALL serve a stdio MCP session

`zhusi mcp --project PATH` MUST start a Model Context Protocol server over stdio, bound to a single project root for the lifetime of the process. It MUST advertise its tools through the protocol so clients can discover names and parameter schemas. `--project` MUST default to the current working directory.

#### Scenario: Client lists tools

- **WHEN** an MCP client connects and lists tools
- **THEN** the response contains the zhusi tools with their descriptions and input schemas

#### Scenario: Missing or uninitialized project

- **WHEN** the bound directory has no readable `.zhusi/` workspace
- **THEN** the server writes an actionable message to stderr, exits non-zero, and never writes protocol data to stdout

### Requirement: The server SHALL expose the design management tools

The server MUST expose tools for reading the current design, submitting a design revision, reporting project status, validating the workspace, rendering the offline report, and saving an existing-project architecture explanation. Every tool MUST call the same application services used by the CLI rather than reimplementing validation, locking, or storage rules.

#### Scenario: Read the current design

- **WHEN** a client calls the read-design tool
- **THEN** it receives the project id, the `expectedRevision`, and the current revision document, or an explicit empty state

#### Scenario: Submit a design revision

- **WHEN** a client calls the submit tool with a valid payload and a matching `expectedRevision`
- **THEN** a new immutable revision is committed and the result reports the new revision number

#### Scenario: Generate a report

- **WHEN** a client calls the report tool
- **THEN** the offline HTML report is written under the workspace and the tool returns its path

### Requirement: Submission tools SHALL preserve CLI guarantees

The submit tool MUST require an expected revision, MUST honour `requestId` idempotency, MUST reject stale writes with the latest revision, and MUST reject `stage: ready` while unresolved blocker questions remain. It MUST NOT accept server-managed fields from the client.

#### Scenario: Stale submission

- **WHEN** a client submits with an `expectedRevision` older than the current revision
- **THEN** the tool returns an error carrying the revision-conflict code and the latest revision, and no revision is written

#### Scenario: Idempotent retry

- **WHEN** the same `requestId` is submitted twice
- **THEN** the second call reports the existing revision and the revision count does not increase

### Requirement: Tool failures SHALL be returned as tool errors

A failing tool call MUST return a structured error result carrying the domain error code and message. The server process MUST remain alive and MUST NOT write diagnostics into the protocol stream.

#### Scenario: Invalid input

- **WHEN** a client calls submit with a payload that violates the schema
- **THEN** the tool returns an invalid-input error and the connection stays usable for subsequent calls

### Requirement: stdout SHALL carry protocol traffic only

The server MUST write only MCP protocol frames to stdout. All logging, warnings, and human-facing messages MUST go to stderr so a stdio client is never desynchronised.

#### Scenario: No log leakage

- **WHEN** the server handles a request while emitting diagnostics
- **THEN** stdout contains only valid protocol frames and the client can continue the session

### Requirement: The server SHALL be packaged and launchable

The published package MUST launch the server through `zhusi mcp`, and the packaged smoke test MUST confirm that a client handshake succeeds from an installed tarball.

#### Scenario: Handshake from an installed package

- **WHEN** an MCP client performs initialize and list-tools against `zhusi mcp` from an installed tarball
- **THEN** the handshake succeeds and the tool list is returned
