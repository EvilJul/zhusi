# Tasks

## 1. Shared services

- [x] 1.1 Split `explainExisting` into a payload-taking `saveExplanation` service and keep JSON file reading in the `explain` CLI adapter; verify the CLI explain flow still passes its process tests.
- [x] 1.2 Confirm every MCP tool has a matching service with no direct workspace access; verify no tool handler imports storage internals.

## 2. MCP server

- [x] 2.1 Implement `createZhusiServer(projectRoot)` building an `McpServer` with tool registrations and return the server instance.
- [x] 2.2 Register `zhusi_status`, `zhusi_read_design`, `zhusi_submit_design`, `zhusi_validate`, `zhusi_render_report`, and `zhusi_save_explanation` with descriptions and input schemas.
- [x] 2.3 Translate `ZhusiError` and Zod failures into `isError` tool results carrying `code`, `message`, `retryable`, and `latestRevision`; verify the process survives a failing call.
- [x] 2.4 Implement `serveZhusiMcp(projectRoot)` that validates the workspace, connects a `StdioServerTransport`, and writes startup diagnostics to stderr only.

## 3. CLI wiring

- [x] 3.1 Replace the `mcp` command stub with the server launcher, keeping `--project` with a current-directory default.
- [x] 3.2 Verify the command writes nothing to stdout outside the protocol and exits non-zero with an actionable stderr message when the workspace is missing.

## 4. Tests

- [x] 4.1 Add an in-process test that connects a client transport to the server, lists tools, and asserts the expected names and schemas.
- [x] 4.2 Add tool tests for read design, submit revision, stale submission conflict, idempotent retry, validate, report rendering, and explanation saving.
- [x] 4.3 Add a process-level test that spawns `zhusi mcp`, performs an initialize and list-tools handshake over stdio, and asserts stdout contains only protocol frames.
- [x] 4.4 Extend the packed-package smoke test to perform a handshake against the installed tarball.

## 5. Documentation and integration

- [x] 5.1 Update README with MCP setup, the tool list, and a client configuration example.
- [x] 5.2 Update the manual testing guide with a handshake scenario and how to inspect the tool list.
- [x] 5.3 Update the release-readiness summary to record the MCP capability and what remains (host validation, prompts/resources).
- [x] 5.4 Run `npm run typecheck`, `npm test`, `npm run smoke`, `npm pack --dry-run`, and `openspec validate "add-mcp-tool-server" --strict`; verify all pass.
