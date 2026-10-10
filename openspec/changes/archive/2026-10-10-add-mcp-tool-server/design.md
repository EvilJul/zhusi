# Design

## Context

See `proposal.md`. `zhusi mcp` currently validates the bound project and exits with a diagnostic; it implements no protocol. The repository already depends on `@modelcontextprotocol/sdk`, whose `McpServer` + `StdioServerTransport` cover the protocol, and every use case the tools need already exists as an application service (`getStatus`, `readDesign`, `submitDesign`, `validateProject`, `createReport`, `explainExisting`).

The product has no model integration and this change adds none: the server only exposes deterministic tools over the local workspace.

## Goals / Non-Goals

**Goals:**

- A working stdio MCP session with discoverable tools and input schemas.
- One project root per server process, fixed at startup.
- Tools that reuse the CLI's services so validation, locking, idempotency, and the ready gate cannot drift.
- Protocol-safe stdio: stdout carries frames only.

**Non-Goals:**

- No HTTP/SSE transport, no authentication, no multi-project routing.
- No prompts, resources, or sampling features beyond tools.
- No model calls and no autonomous content generation.
- No new write path: submissions still go through `Workspace.commitRevision`.

## Decisions

### 1. Use the official SDK's high-level server

Instantiate `McpServer` with the package name and version, register tools with `registerTool`, and connect a `StdioServerTransport`.

**Why:** hand-rolling JSON-RPC framing and capability negotiation is exactly what the dependency exists to avoid, and it keeps the protocol current as the spec evolves.

**Alternative rejected:** implementing JSON-RPC over stdin/stdout directly, which would need its own framing, version negotiation, and error model.

### 2. Bind one project root at startup; no per-call project parameter

`--project` resolves once when the server starts, defaults to the current working directory, and must already contain a readable `.zhusi/` workspace. Tools never accept a project path.

**Why:** a per-call path would let a client reach outside the project the user launched the server for, and would make every tool's safety depend on the client.

**Alternative rejected:** accepting a project per call for flexibility, which trades a security boundary for convenience.

### 3. Every tool delegates to an existing application service

| Tool | Service |
|---|---|
| `zhusi_status` | `getStatus` |
| `zhusi_read_design` | `readDesign` |
| `zhusi_submit_design` | `submitDesign` |
| `zhusi_validate` | `validateProject` |
| `zhusi_render_report` | `createReport` |
| `zhusi_save_explanation` | new `saveExplanation` service, reused by the `explain` CLI command |

**Why:** the CLI and MCP must enforce identical rules; a second implementation would eventually disagree with the first.

**Alternative rejected:** tool handlers that touch the workspace directly, which duplicates locking and schema rules.

### 4. Refactor `explainExisting` into a payload-taking service

The CLI reads a JSON file today; MCP clients send an object. Split the service into `saveExplanation({ project, existing, payload })` and keep the file-reading in the CLI adapter.

**Why:** the service should not care how the payload arrived, and both adapters then share one normalization path.

**Alternative rejected:** having the MCP tool write a temporary file to reuse the CLI function, which adds filesystem side effects for no reason.

### 5. Errors become tool results, not crashes

Tool handlers catch `ZhusiError` and Zod failures and return `{ isError: true, content: [text(JSON)] }` carrying `code`, `message`, `retryable`, and `latestRevision` when present. Unexpected errors are reported the same way but with the runtime-error code.

**Why:** a client should be able to retry or re-read after a conflict without the server dying, and structured codes are what let it decide.

**Alternative rejected:** letting exceptions propagate to the transport, which ends the session and loses the session state.

### 6. JSON text content for results

Tool results return a single JSON text block rather than `structuredContent` with `outputSchema`.

**Why:** it works with every client version and keeps the contract readable, while schemas on inputs still give clients discoverability.

**Alternative rejected:** declaring output schemas everywhere, which adds maintenance for little gain in this first iteration.

### 7. Strip stdout from the CLI's normal presentation helpers

The `mcp` command must not call `emit` or `human`. It writes diagnostics to stderr only, and the SDK owns stdout.

**Why:** a single stray log line on stdout corrupts the JSON-RPC stream and desynchronises the client.

**Alternative rejected:** relying on logging discipline alone; the command is structured so no shared output helper is reachable.

## Risks / Trade-offs

- [Risk] A stray write to stdout breaks the session → Mitigation: the command never uses the shared output helpers, and tests assert stdout parses as protocol frames only.
- [Risk] A long-running server holds a stale view of the project → Mitigation: every tool reads through the storage layer at call time; only the root binding is fixed.
- [Risk] Concurrent CLI and MCP writers collide → Mitigation: both go through the same lock and `expectedRevision` check, so one gets a conflict result rather than corrupting data.
- [Risk] Tool output grows past client limits for large projects → Mitigation: read-result payloads are the same documents the CLI already bounds by the 5 MiB snapshot limit.
- [Risk] SDK upgrades change behaviour → Mitigation: the version is pinned in the lockfile and the smoke test performs a real handshake.

## Migration Plan

1. Split the explanation service so both adapters share it.
2. Implement the server module and register the tools.
3. Replace the `mcp` command stub with the server launcher and keep startup validation.
4. Cover handshake, tool listing, each tool's happy path, and error results with tests; extend the packed smoke test.
5. Rollback removes the server module and restores the stub; no on-disk format changes.

## Open Questions

None that block the breakdown. Whether to add prompts or resources is deferred until a host adapter proves the need.
