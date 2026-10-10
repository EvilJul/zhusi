# Design

## Context

See `proposal.md`. The CLI is already callable by any agent with shell access; the missing piece is discoverability. OpenSpec solves the same problem by writing per-host instruction and skill files into the project (`openspec init --tools codex` produced the `.agents/skills/openspec-*` tree in this repository). This change mirrors that approach for zhusi.

There is no model integration here and no change to `.zhusi/` data. The deliverable is distribution-layer registration plus one command.

## Goals / Non-Goals

**Goals:**

- One command that makes an agent aware of zhusi and its authoring rules.
- Per-host correctness: each host gets files in the location it actually reads.
- Safe repetition: running install twice never duplicates or clobbers local edits.
- Works from an installed npm package, not just from the repository.

**Non-Goals:**

- No MCP server registration; that is a separate change.
- No automatic modification of `.zhusi/` project data.
- No telemetry, no network access, no model calls.
- No attempt to register hosts that have no on-disk convention.

## Decisions

### 1. Ship the skill as a package file and resolve it relative to the module

`skills/zhusi/SKILL.md` is added to the npm `files` list. At runtime the service locates it relative to the compiled module (`dist/services/skill.js` → `../../skills/zhusi/SKILL.md`), which resolves correctly both in the repository and inside `node_modules/zhusi`.

**Why:** embedding the skill as a TypeScript string literal would bloat the source and make the skill harder to review and edit as documentation.

**Alternative rejected:** a build step that inlines the markdown, which adds tooling for no benefit.

### 2. A static host registry instead of per-command branching

Define hosts as data: id, label, project skill path, user skill path, instruction file path. `all` expands to every registry entry. Unknown ids fail with the supported list.

**Why:** adding a host should be a data edit, not a new branch in the command handler.

**Alternative rejected:** host-specific code paths in the CLI, which duplicate path and write logic three times.

### 3. Managed block with explicit markers for instruction files

Instruction files are shared with other tools, so zhusi only owns the region between `<!-- zhusi:start -->` and `<!-- zhusi:end -->`. Installation appends the block when absent and replaces it in place when present; everything outside is preserved byte-for-byte.

**Why:** `AGENTS.md` already carries user-owned instructions in many repositories; blind appends would duplicate on every run.

**Alternative rejected:** writing an entire `AGENTS.md` and asking the user to merge, which loses their content or blocks installation.

### 4. Non-destructive by default, `--force` to overwrite

An existing target file is compared by content: identical → `unchanged`, different → `skipped` unless `--force`. Skipping is reported but not an error, so repeat runs stay exit 0.

**Why:** the user may have adapted the skill locally; silently replacing it would destroy that work without them asking.

**Alternative rejected:** always overwriting to keep installs idempotent, which is only safe if nothing is ever edited locally.

### 5. Project scope by default, `--user` for global registration

Default installation targets the project so the registration can be reviewed and committed with the design data. `--user` writes to the host's user configuration directory so the agent discovers zhusi in any project.

**Why:** project scope matches how the design data itself is stored and reviewed; user scope is a deliberate opt-in that writes outside the project.

**Alternative rejected:** user scope by default, which silently modifies the machine outside the project the user invoked.

### 6. `--dry-run` reports the same plan the real run executes

The service computes the full action list first, then either returns it or applies it. Dry runs therefore exercise path resolution and content comparison without touching disk.

**Why:** the preview is only trustworthy if it shares the code path with the real operation.

**Alternative rejected:** a separate "describe" implementation, which would drift from the writer.

## Risks / Trade-offs

- [Risk] Host conventions change over time → Mitigation: the registry is data, and paths are documented per host; unknown hosts fail loudly rather than guessing.
- [Risk] Appending to `AGENTS.md` could surprise users → Mitigation: only a delimited block is added, it is reported in the output, and `--dry-run` previews it.
- [Risk] `--user` writes outside the project → Mitigation: it is never the default, the resolved paths are printed, and the docs mark it as an explicit choice.
- [Risk] A stale installed skill could mislead an agent after an upgrade → Mitigation: re-running install replaces the managed block and the skill file when `--force` is used; the reported `skipped` status makes drift visible.
- [Risk] Packed package could omit `skills/` → Mitigation: a smoke test installs the tarball and runs `install-skill`.

## Migration Plan

1. Add the skill content and the host registry; extend the npm `files` list.
2. Add the install service and the `install-skill` command.
3. Cover create, skip, force, managed-block replacement, user scope, dry-run, and unknown host with tests.
4. Extend the packed-package smoke test to install and register the skill.
5. Rollback deletes the command and the shipped skill; installed files in user projects are plain text and can be removed by the user.

## Open Questions

None that block the breakdown. Whether to also register an MCP server automatically is deferred to the MCP change.
