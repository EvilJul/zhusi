# Tasks

## 1. Skill content and host registry

- [x] 1.1 Write `skills/zhusi/SKILL.md` describing when to use zhusi, the read → modify → submit loop, the payload rules, and how to react to each exit code; verify the packaged description names the commands and the `expectedRevision` requirement.
- [x] 1.2 Add `skills/` to the npm `files` list; verify `npm pack --dry-run` lists the skill file.
- [x] 1.3 Implement a host registry covering `codex`, `claude`, and `cursor` with project and user skill paths plus the instruction file for each; verify an unknown host produces a message listing the supported values.
- [x] 1.4 Implement the instruction-file block content with `<!-- zhusi:start -->` / `<!-- zhusi:end -->` markers; verify the block is self-contained and names the authoring commands.

## 2. Install service

- [x] 2.1 Implement plan computation that resolves destinations, reads existing content, and classifies each action as created, updated, unchanged, or skipped; verify it runs without writing.
- [x] 2.2 Implement applying the plan with `--force` overwrite semantics; verify a differing file is skipped without `--force` and replaced with it.
- [x] 2.3 Implement managed-block merging so an existing instruction file keeps its surrounding content and the block is replaced in place on re-install; verify no duplicate block appears.
- [x] 2.4 Implement `--user` scope resolving to the host user configuration directory; verify project files are untouched and the destination is reported.
- [x] 2.5 Resolve the packaged skill path relative to the compiled module; verify it works both from the repository and from an installed package.

## 3. CLI command

- [x] 3.1 Add `install-skill` with `--host`, `--user`, `--force`, `--dry-run`, `--project`, and `--json`; verify `--help` documents them.
- [x] 3.2 Emit a human summary and a machine-readable action list on stdout, keeping diagnostics on stderr; verify `--json` output parses.
- [x] 3.3 Map failures to the documented exit codes: unknown host and unreadable destinations to invalid input, write failures to runtime error.

## 4. Tests

- [x] 4.1 Add unit tests for the registry, plan classification, and managed-block merge.
- [x] 4.2 Add service tests for create, skip, force, idempotent re-install, and user scope using temporary directories.
- [x] 4.3 Add process-level CLI tests for `--host codex`, `--host all`, `--dry-run`, unknown host, and `--json` output.
- [x] 4.4 Extend the packed-package smoke test to run `install-skill` from the installed tarball and assert the skill file lands on disk.

## 5. Documentation and integration

- [x] 5.1 Update README with the registration workflow, supported hosts, project versus user scope, and what the command writes.
- [x] 5.2 Update the manual testing guide with a registration scenario and what to verify afterwards.
- [x] 5.3 Update the release-readiness summary to record the new capability and the remaining MCP follow-up scope.
- [x] 5.4 Run `npm run typecheck`, `npm test`, `npm run smoke`, `npm pack --dry-run`, and `openspec validate "add-skill-install-adapters" --strict`; verify all pass.
