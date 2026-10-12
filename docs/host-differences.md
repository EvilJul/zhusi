# 宿主差异说明（Codex / Claude Code / Cursor）

日期：2026-10-12

> **诚实声明**：本文根据 `src/integrations/hosts.ts`、`src/mcp/server.ts` 的代码和各客户端公开的配置约定整理，**没有**在三个客户端中由真人实际驾驶验证。协议层面的完整流程（需求→提案→评审→修订、第二客户端异步评审、冲突、重试、重启续作）由 `tests/e2e.test.mjs` 用两个真实 `zhusi mcp` stdio 子进程自动模拟。下表标注“待实测”的条目需要在真实客户端中确认后更新。

## Skill / 指令文件（`zhusi install-skill`）

| 维度 | Codex | Claude Code | Cursor |
|---|---|---|---|
| 项目级 Skill | `.agents/skills/zhusi/SKILL.md` | `.claude/skills/zhusi/SKILL.md` | 无（Cursor 不使用 Skill 文件） |
| 用户级 Skill | `~/.codex/skills/zhusi/SKILL.md` | `~/.claude/skills/zhusi/SKILL.md` | 无 |
| 项目级指令 | `AGENTS.md` 受管块 | `CLAUDE.md` 受管块 | `.cursor/rules/zhusi.mdc` |
| 用户级指令 | `~/.codex/AGENTS.md` | `~/.claude/CLAUDE.md` | `~/.cursor/rules/zhusi.mdc`（待实测：Cursor 是否读取用户目录下的规则文件） |
| 触发方式 | 读取 AGENTS.md 后按需打开 Skill | Skill 描述匹配时自动加载（待实测触发率） | 规则文件随上下文注入 |

受管块以 `<!-- zhusi:start -->` / `<!-- zhusi:end -->` 包裹，重复安装只替换块内内容。Cursor 只有规则文件，因此完整工作流（载荷结构、评审回路）需要通过 MCP 提示或规则文件本身传达，信息量少于另外两个宿主。

## MCP 服务器注册

三者的命令条目形状一致：`zhusi mcp --project <项目根>`（可重复 `--project` 绑定多个项目）。配置位置按各客户端公开约定（待实测）：

| 客户端 | 典型配置位置 | 备注 |
|---|---|---|
| Codex | `~/.codex/config.toml` 中 `[mcp_servers.zhusi]` | TOML：`command = "zhusi"`、`args = ["mcp", "--project", "/abs/path"]` |
| Claude Code | 项目 `.mcp.json` 或 `claude mcp add zhusi -- zhusi mcp --project .` | JSON `mcpServers` |
| Cursor | 项目 `.cursor/mcp.json` 或全局 `~/.cursor/mcp.json` | JSON `mcpServers` |

建议使用**绝对路径**作为 `--project`：不同客户端启动 MCP 子进程时的工作目录不一致，相对路径 `.` 依赖客户端行为（待实测）。

## 能力差异（待实测）

| 能力 | 服务器提供 | 需要确认的客户端行为 |
|---|---|---|
| 工具 | 9 个 | 三者都支持工具；需确认大载荷（完整 revision）是否被截断 |
| 资源 | `zhusi://projects` 与 3 个模板 | 部分客户端不展示资源或模板，只用工具也能完成全部流程 |
| 提示 | 3 个 | 部分客户端以斜杠命令呈现，部分不支持；Skill / 规则文件提供同等引导 |
| 错误 | `isError` + JSON `{ ok:false, code, latestRevision }` | 需确认模型是否据 `REVISION_CONFLICT` 主动重新读取 |
| stderr | 启动诊断写 stderr | 客户端日志位置不同，排障时需分别查找 |

## 设计上的兼容策略

- 所有流程都**只靠工具**即可完成，资源与提示是增强而非依赖。
- 提交始终是完整 revision；不依赖客户端的补丁或增量语义。
- 冲突靠 `expectedRevision`、重试靠 `requestId`，与客户端是否串行调用无关。

## 实测清单（发布前）

对每个客户端各执行一次，并把结果填回本文：

1. 注册 MCP，列出工具 / 资源 / 提示。
2. 用 `zhusi_design_session` 提示（或等价指令）从一句需求走到 `reviewing`。
3. 在另一个客户端用 `zhusi_review_design` 追加评审。
4. 回到第一个客户端处置评审并推进到 `ready`，打开报告检查来源与处置。
5. 记录：配置位置、是否展示资源/提示、冲突时模型的行为、任何截断或格式问题。
