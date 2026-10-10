# Proposal

## Why

`zhusi` 已经是 PATH 上可执行的 CLI，任何能运行 shell 的 AI 客户端都能调用它。但"能调用"不等于"知道要调用"：目前没有任何东西告诉 agent 有这个工具、什么时候该用、提交时必须遵守什么规则。结果是用户每次都得手动交代一遍，agent 也不会主动维护设计资料。

OpenSpec 用 `openspec init --tools codex` 解决同类问题：它不是注册 MCP，而是按宿主把指令/Skill 文件写进项目（本仓库里的 `.agents/skills/openspec-*` 与 `.agents/skills/.openspec-target` 就是产物）。筑思的设计文档里也早已列出 `zhusi install-skill --host NAME`，但一直未实现。

本次变更实现该命令：随包发布一份 zhusi Skill，按宿主安装到 Skill 目录，并在宿主的指令文件里维护一段受管说明，使 agent 能自动发现并正确使用筑思。

## What Changes

- 新增随 npm 包发布的 Skill 内容 `skills/zhusi/SKILL.md`，说明何时使用筑思、读取→修改→提交回路、载荷规则与退出码处置。
- 新增 `zhusi install-skill` 命令，支持 `--host codex|claude|cursor|all`、`--user`、`--force`、`--dry-run`、`--json`。
- 默认在项目内安装：Codex 写 `.agents/skills/zhusi/`，Claude 写 `.claude/skills/zhusi/`，Cursor 写 `.cursor/rules/zhusi.mdc`。
- 在宿主指令文件中维护受管块（`AGENTS.md` / `CLAUDE.md`），用标记替换而非追加重复内容。
- `--user` 安装到用户级配置目录，使 agent 在任意项目都能发现筑思。
- 默认非破坏性：已存在且内容不同的文件不会被覆盖，除非显式 `--force`。
- `--dry-run` 只报告将要写入的路径，不做任何修改。

## Capabilities

### New Capabilities

- `skill-installation`: 按宿主安装 Skill 与指令文件的命令契约，含非破坏性语义、受管块、用户级安装与 dry-run。

### Modified Capabilities

无。既有命令与数据格式不变；本次只在分发层增加注册能力。

## Impact

- 新增 `skills/zhusi/SKILL.md`、`src/integrations/hosts.ts`（宿主注册表）与 `src/services/skill.ts`（安装用例），`src/cli` 增加 `install-skill` 命令。
- `package.json` 的 `files` 需要包含 `skills/`，否则安装后取不到 Skill 内容。
- `--user` 会写入用户主目录（如 `~/.codex/skills/`），属于显式选择，默认不启用。
- 不引入模型调用，不改变 `.zhusi/` 数据格式，不修改既有命令行为。
