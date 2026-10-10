# Design

## Context

See `proposal.md` for the motivation and user-visible scope. The repository currently contains design documents but no package manifest, source tree, executable entry, or tests. The implementation must establish a stable application-service boundary so CLI, future MCP tools, Skill adapters, and report rendering do not duplicate validation or storage rules.

The existing design calls for TypeScript/Node.js, local JSON snapshots, offline HTML, optional CodeGraph cooperation, no built-in model API calls, and clear separation between code facts, design intent, inference, and unknowns. The implementation must run on Windows, macOS, and Linux without relying on shell-specific commands.

## Goals / Non-Goals

**Goals:**

- Deliver an installable npm CLI with a working `zhusi init` first and the remaining core commands behind the same application services.
- Create a durable `.zhusi/` workspace with schema validation, immutable snapshots, optimistic revision checks, idempotent request IDs, locking, atomic publication, and explicit repair.
- Generate a self-contained offline report and persist existing-project architecture explanations with code provenance and stale detection.
- Provide a platform-neutral runtime boundary and automated tests for paths, encodings, locks, reports, and command behavior.
- Leave a clean application-service API for later MCP/Skill work without pretending that model calls or code indexing are implemented here.

**Non-Goals:**

- No cloud synchronization, accounts, team permissions, database, vector index, or automatic multi-model orchestration.
- No automatic source-code modification, dependency installation, shell execution, deployment, or complete code graph implementation.
- No claim that a generated explanation proves runtime behavior; unsupported or unobserved conclusions remain unknown or inferred.
- No requirement to publish to npm during this change; local packing and install smoke tests are required, while credentials and release administration remain outside the implementation.

## Decisions

### 1. Use a layered TypeScript application with one application-service boundary

Use `src/cli` only for argument parsing and presentation; put use cases in `src/services`; put schemas and invariants in `src/domain`; put filesystem details in `src/storage`; put HTML generation in `src/report`; and put explanation normalization in `src/explain`. CLI commands and the future MCP adapter call the same services.

**Why:** this prevents CLI/MCP validation drift and makes most behavior testable without spawning a process.

**Alternative rejected:** placing business logic in command handlers would be faster initially but would duplicate rules when MCP is added.

### 2. Use Node.js built-in filesystem/path primitives and a small CLI parser

Use Node runtime APIs for path resolution, file URLs, atomic rename, process signals, and platform detection. Select one mature argument parser during implementation and lock the version. The package exposes `dist/cli/index.js` through the npm `bin` field.

**Why:** Node is already the planned common runtime and avoids requiring bash, PowerShell, Python, or platform-specific binaries.

**Alternative rejected:** shell scripts and separate platform launchers would create divergent behavior and complicate npm/npx distribution.

### 3. Store JSON snapshots as the authority

Use `.zhusi/config.json`, `.zhusi/state.json`, `.zhusi/revisions/NNNNNN.json`, `.zhusi/architecture-explanations/NNNNNN.json`, `.zhusi/reports/`, and `.zhusi/lock/`. A write creates a temporary file in the same directory, flushes/ closes it, renames it into place, then updates the state pointer. Keep request IDs and revision metadata in the snapshot/state data.

**Why:** small local projects benefit from Git-readable files and simple recovery; a database would add migration and packaging complexity before usage proves it necessary.

**Alternative rejected:** SQLite for the first CLI because it reduces human reviewability and does not remove the need for file locking and migrations.

### 4. Use optimistic concurrency plus a project-local lock

Every mutation takes `expectedRevision` and `requestId`. The lock is created using an exclusive filesystem operation, records owner and timestamp, has a bounded timeout, and is released in `finally`/signal cleanup. A stale lock is never deleted blindly; repair must verify age and ownership rules.

**Why:** this covers same-machine concurrent AI clients while preserving explicit conflict behavior. Network filesystem guarantees are out of scope.

**Alternative rejected:** last-write-wins because it can silently destroy another AI's design update.

### 5. Treat architecture explanations as provenance-bearing data, not source copies

The explanation normalizer accepts structured code-tool observations and generated text, validates the shape, attaches `sourceSnapshot`, evidence references, confidence, and classification, then persists only the explanation and compact file-list metadata. The first CLI can accept a structured input file or a documented adapter payload; it must not invent a code index or execute arbitrary commands to discover one.

**Why:** this keeps the trust boundary explicit and allows CodeGraph/MCP integrations to evolve independently.

**Alternative rejected:** scanning every file directly in the CLI, which would make the tool a code-indexer and create security, performance, and cross-language scope problems.

### 6. Generate a self-contained report

Render escaped text and structured SVG/HTML from validated data. Inline required CSS/JS/assets so `file://` opening works. Use text content/escaping rather than injecting model-provided HTML, and allow only safe link protocols.

**Why:** the report must work offline and remain safe when AI-generated data contains markup.

**Alternative rejected:** runtime CDN assets or fetching JSON from a local server, which fail under offline/file URL constraints.

### 7. Test the package at three levels

Use unit tests for domain/storage/report logic, process-level CLI tests for stdout/stderr/exit codes and filesystem effects, and a cross-platform smoke script for packed installation and core commands. CI matrix configuration should cover Windows, macOS, and Linux on supported Node architectures available in the CI provider.

**Why:** unit tests catch invariants, process tests catch CLI contract regressions, and matrix smoke tests catch path/permission/line-ending differences.

## Risks / Trade-offs

- [Risk] Windows file sharing and antivirus tools may keep files open during atomic replacement → Mitigation: retry bounded rename operations, surface a retryable busy error, and test locked-file behavior.
- [Risk] Directory fingerprints may be expensive or unstable on large/non-Git projects → Mitigation: bound file count/size, exclude `.git` and `.zhusi`, normalize relative paths, and report the fingerprint scope.
- [Risk] A generated explanation can sound authoritative despite incomplete evidence → Mitigation: require classification/evidence fields and display limitations and confidence in status/report output.
- [Risk] npm global bin configuration differs by package manager → Mitigation: document `npx` as the fallback, provide actionable diagnostics, and test both local packed install and global-style invocation.
- [Risk] Static report content could create HTML injection → Mitigation: validate structured input, escape all text, reject unsafe URLs, and test script-closing and `javascript:` payloads.
- [Risk] The first implementation may overreach into MCP/model integration → Mitigation: implement only an executable launch boundary and shared services; track full MCP tools as a separate change unless the current specs are expanded.

## Migration Plan

1. Add the package and source tree without changing existing documents' meaning.
2. Run unit/process tests, build `dist`, and execute `npm pack` into a temporary directory.
3. Install the packed tarball with `npx`/local npm and run init/status/validate/report smoke tests.
4. For an existing repository, run `zhusi init` only when no `.zhusi/` exists; never overwrite design data.
5. If implementation must be rolled back, remove the package/build artifacts while preserving any user-created `.zhusi/` workspace and snapshots.

## Open Questions

None that should block the task breakdown. The exact CLI parser package and minimum supported Node.js LTS patch version can be locked during setup as long as the public behavior and supported-platform matrix remain unchanged.
