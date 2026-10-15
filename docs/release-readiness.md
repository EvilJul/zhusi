# 发布就绪说明

日期：2026-10-12 · 对应变更：`implement-cross-platform-cli`、`add-design-write-channel`、`add-skill-install-adapters`、`add-mcp-tool-server`、`complete-v1-scope`

本说明记录第一版的发布准备状态、验证方式和已知边界。下文“已实现范围”均有自动化测试覆盖；“已知限制”只列当前确实存在的缺口。真实客户端验证仍需单独记录。

## 已实现范围

- 可发布的 TypeScript/Node.js npm 包，`bin` 暴露 `zhusi`，支持 `npx zhusi <command>` 与全局安装。
- 命令：`init`、`status`、`validate`、`report`、`export`、`repair`、`explain`、`design show|template|submit|review|dispose`、`install-skill`，以及 `mcp` 服务器。
- `.zhusi/` 工作空间：`config.json`、`state.json`、不可变 revision 与讲解快照、同目录原子发布、项目锁、`expectedRevision` 冲突检测、`requestId` 幂等。
- 领域 schema 校验、schema 主版本拒绝、字段上限与不可信内容转义。
- 离线自包含 HTML 报告（内联 CSS/SVG，无脚本、无网络资源）与 Markdown 派生导出；架构图由 `architecture.modules` 与 `architecture.dependencies` 生成，决策卡片含理由/备选/代价/重新评估条件，未决问题按优先级分组。新提交使用简写；报告含本期范围与下一步（含验收）、变更摘要、历史折叠，架构图可悬停查看流向。
- 已有代码项目讲解：Git commit 或确定性目录指纹、读取范围与文件清单、陈旧检测、缺失证据归一化为 `inferred`/`unknown`。
- 设计写入通道：`design show` 读取完整 revision 与 `expectedRevision`，`design template` 生成可填写骨架，`design submit` 校验并提交；支持 `--dry-run`、`--input -` 从 stdin 读取、`requestId` 幂等、过期 revision 冲突拒绝，以及 `stage: ready` 仍有未解决 blocker 时的阶段闸门。
- 报告与导出包含业务流程（触发、步骤、异常分支）与开发顺序（依赖、交付物、状态）；评审按“问题→意见→处置”折叠，未处置的默认展开。
- 评审处置：`design review` 追加评审（同 id 只追加意见），`design dispose` 把 accept / reject / defer 与理由写回新 revision，沿用 `expectedRevision` 冲突检测与 `requestId` 幂等。
- AI 客户端注册：`install-skill --host codex|claude|cursor|all` 随包发布 Skill 内容，按宿主写入 Skill/规则文件，并在 `AGENTS.md` / `CLAUDE.md` 维护受管块；默认非破坏性，支持 `--user` 与 `--dry-run`。
- MCP 工具服务器：`zhusi mcp --project PATH` 是真正的 stdio MCP 服务器，暴露 `zhusi_status`、`zhusi_read_design`、`zhusi_submit_design`、`zhusi_validate`、`zhusi_render_report`、`zhusi_save_explanation`、`zhusi_add_reviews`、`zhusi_dispose_reviews`、`zhusi_list_projects` 九个工具，项目列表 / 设计 / Markdown 摘要 / 讲解四类资源，以及设计会话、评审、代码讲解三个提示；`--project` 可重复绑定多个项目，工具只能访问已注册项目，stdout 只承载协议帧，工具失败返回结构化错误而不中断会话。

## 支持矩阵

| 维度 | 支持 |
|---|---|
| Node.js | >= 20.11.0（在 20.x 与 22.x 上验证） |
| 操作系统 | Windows、macOS、Linux |
| 架构 | x64 与 arm64（CI 决定可用的运行时） |
| 调用方式 | `npx zhusi`、全局安装、项目内本地安装 |

## 验证命令

```sh
npm ci                 # 从 lockfile 复现依赖树
npm run typecheck      # tsc 类型检查
npm test               # 构建 + 单元/进程级/平台测试
npm run smoke          # npm pack -> 临时项目安装 tarball -> 运行核心命令
npm pack --dry-run     # 检查发布内容
openspec validate --change "implement-cross-platform-cli" --strict
```

CI 配置见 `.github/workflows/ci.yml`，矩阵覆盖 Windows/macOS/Linux 与 Node 20.x/22.x，执行 `npm ci`、类型检查、测试与打包冒烟。

## 已知限制

- **未在真实宿主中由真人驾驶验证。** “需求→提案→评审→修订”与第二客户端异步评审由 `tests/e2e.test.mjs` 通过两个真实 stdio 子进程自动模拟；Codex / Claude Code / Cursor 的实际行为差异只根据代码与公开配置约定整理在 [宿主差异说明](host-differences.md)，尚需逐一实测。
- 没有自动多模型编排或内置模型 API 调用（设计如此）。
- 架构图为分层静态 SVG，支持悬停查看流向，不含拖拽编辑。
- 新提交执行简写限制；历史长文仍可读取，重新提交前需提炼。
- MCP 只支持 stdio 传输；资源不推送变更通知（客户端需重新读取）。
- 锁与原子写入针对单机文件系统；不承诺网络文件系统语义。陈旧锁只在 `repair` 中报告，不自动删除。
- 目录指纹对超大项目设 20,000 文件与 1 MiB 单文件上限；超出会明确报错而非静默截断。
- 许可证已定为 MIT（`LICENSE`、`package.json`）。npm 包名定为 `zhusi`；2026-10-12 查询 registry 返回 404（未被占用），但尚未发布，发布前需再次确认。

## 发布前仍需完成

1. 在 Codex、Claude Code、Cursor 中各跑一遍 [手工测试指南](manual-testing.md) 的 MCP 与 Skill 场景，把结果补进宿主差异说明。
2. 维护者登录 npm（需 2FA），执行 `npm publish --dry-run` 复核内容后发布 `zhusi@0.2.0`；打 Git tag 并创建 GitHub Release。
3. 确认 CI 矩阵在发布提交上全绿。

## 后续范围

1. 在真实 AI 客户端里完成 MCP 与 Skill 的端到端验证，记录宿主差异与提示词调优。
2. MCP 资源变更订阅与 HTTP 传输。
3. 根据真实宿主反馈调优 Skill 与提示文本。
4. 自动多模型讨论、OpenSpec 导出适配等可选项（见路线图）。不把业务流程扩展成任务管理系统。
