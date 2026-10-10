# Design

## Context

See `proposal.md` for motivation and user-visible scope. The previous change (`implement-cross-platform-cli`) shipped `Workspace.commitRevision`, which already performs schema validation, exclusive locking, `expectedRevision` conflict detection, `requestId` idempotency, and atomic same-directory publication. That path is currently reachable only from internal code and the test suite; `explain` is the only user-facing writer, and it writes architecture explanations rather than design content.

The product operates without built-in model calls: the host AI client produces structured design content, and Zhusi validates and stores it. This change therefore adds a CLI round trip rather than any model integration.

## Goals / Non-Goals

**Goals:**

- Give humans and AI clients a complete read → modify → submit loop against `.zhusi/`.
- Reuse the existing storage guarantees instead of writing a second mutation path.
- Keep the submission surface small: one envelope schema, three subcommands.
- Make failure modes explicit: invalid input, revision conflict, unmet stage, idempotent retry.

**Non-Goals:**

- No MCP server or tool set; that remains a separate follow-up change.
- No incremental field-level patch, merge, or diff commands; submissions carry a complete revision.
- No model calls, prompt templates, or automatic content generation.
- No change to the on-disk schema, file layout, or existing commands.

## Decisions

### 1. Reuse `Workspace.commitRevision` rather than adding a write path

`design submit` parses and validates the payload, then hands the assembled revision to the existing `commitRevision`. Locking, conflict detection, idempotency, size limits, and atomic publication stay in one place.

**Why:** a second mutation path would drift from the first and silently weaken the guarantees already covered by tests.

**Alternative rejected:** a dedicated `submit-design` writer in the service layer, which would duplicate locking and pointer updates.

### 2. One submission envelope schema with server-managed fields excluded

Define `DesignSubmissionSchema` for the payload: optional `expectedRevision`, optional `requestId`, optional `actor`, and the design collections with defaults. Fields the tool owns (`schemaVersion`, `projectId`, `revision`, `createdAt`) are not accepted from the payload; if present they are rejected as unknown keys.

**Why:** a caller that supplies `revision` or `projectId` is almost certainly confused, and accepting it would make conflict handling ambiguous.

**Alternative rejected:** accepting a full revision document and stripping the server-managed fields, which silently ignores caller mistakes.

### 3. Require an explicit expected revision before writing

The submission takes `expectedRevision` from the payload or from `--expected-revision`. If neither is present, the command refuses to write. `design show` and `design template` both surface the value so the round trip carries it naturally.

**Why:** defaulting to "whatever is current" would turn a stale concurrent write into a silent overwrite, defeating the optimistic-concurrency design.

**Alternative rejected:** defaulting to the current revision for convenience, which makes last-write-wins the accidental default.

### 4. Enforce the ready gate in the service, not the CLI

Before committing, the service rejects `stage: "ready"` when any question with priority `blocker` is not resolved, using the existing `STAGE_NOT_READY` exit code. The check lives in the service so any future adapter inherits it.

**Why:** the design already says important unresolved questions must not be marked ready; the exit code existed but nothing produced it.

**Alternative rejected:** warning only, which lets a report claim readiness it has not earned.

### 5. Keep the payload flat and stream-friendly

`design submit --input -` reads the payload from stdin so an AI client can pipe a document without writing a temporary file. `design template` writes to stdout by default and to a file with `--out`.

**Why:** piping avoids temporary files and works identically across shells and platforms.

**Alternative rejected:** requiring a file path for every operation, which forces callers to manage scratch files.

## Risks / Trade-offs

- [Risk] A client reads the design and submits a stale revision → Mitigation: conflict detection returns the latest revision and never overwrites; `design show` returns the value to echo back.
- [Risk] A retry after an uncertain failure creates a duplicate revision → Mitigation: `requestId` idempotency returns the previously committed revision.
- [Risk] A complete-revision submission can drop fields the caller forgot to copy → Mitigation: `design show` returns the full document and `design template` starts from the current revision number; field-level merging is explicitly out of scope for this change.
- [Risk] The ready gate blocks a user who considers the blocker acceptable → Mitigation: keep the revision in a non-ready stage; an explicit override is deliberately not added in this change.
- [Risk] Large payloads could exceed the workspace size limit → Mitigation: the existing 5 MiB snapshot limit reports a clear invalid-input error instead of truncating.

## Migration Plan

1. Add the submission schema and the authoring service without touching existing commands.
2. Add the `design` subcommands and route them through the shared output helpers.
3. Cover the read → modify → submit loop, conflict, idempotency, dry-run, and ready gate with tests.
4. Document the loop in README and the manual testing guide.
5. Rollback removes the `design` commands and the service; existing `.zhusi/` snapshots remain readable because no on-disk format changes.

## Open Questions

None that block the task breakdown. Whether to add MCP tools and a host Skill adapter on top of this channel is deferred to a separate change.
