# 发布就绪说明

日期：2026-10-10 · 对应变更：`implement-cross-platform-cli`

本说明记录跨平台 CLI 基础的发布准备状态、验证方式和已知边界。MCP 工具集与 Skill 适配已实现；真实客户端验证仍需单独记录。

## 已实现范围

- 可发布的 TypeScript/Node.js npm 包，`bin` 暴露 `zhusi`，支持 `npx zhusi <command>` 与全局安装。
- 命令：`init`、`status`、`validate`、`report`、`export`、`repair`、`explain`、`design show|template|submit`、`install-skill`，以及 `mcp` 服务器。
- `.zhusi/` 工作空间：`config.json`、`state.json`、不可变 revision 与讲解快照、同目录原子发布、项目锁、`expectedRevision` 冲突检测、`requestId` 幂等。
- 领域 schema 校验、schema 主版本拒绝、字段上限与不可信内容转义。
- 离线自包含 HTML 报告（内联 CSS/SVG，无脚本、无网络资源）与 Markdown 派生导出；架构图由 `architecture.modules` 与 `architecture.dependencies` 生成，决策卡片含理由/备选/代价/重新评估条件，未决问题按优先级分组。
- 已有代码项目讲解：Git commit 或确定性目录指纹、读取范围与文件清单、陈旧检测、缺失证据归一化为 `inferred`/`unknown`。
- 设计写入通道：`design show` 读取完整 revision 与 `expectedRevision`，`design template` 生成可填写骨架，`design submit` 校验并提交；支持 `--dry-run`、`--input -` 从 stdin 读取、`requestId` 幂等、过期 revision 冲突拒绝，以及 `stage: ready` 仍有未解决 blocker 时的阶段闸门。
- AI 客户端注册：`install-skill --host codex|claude|cursor|all` 随包发布 Skill 内容，按宿主写入 Skill/规则文件，并在 `AGENTS.md` / `CLAUDE.md` 维护受管块；默认非破坏性，支持 `--user` 与 `--dry-run`。
- MCP 工具服务器：`zhusi mcp --project PATH` 是真正的 stdio MCP 服务器，暴露 `zhusi_status`、`zhusi_read_design`、`zhusi_submit_design`、`zhusi_validate`、`zhusi_render_report`、`zhusi_save_explanation`；启动时绑定单个项目根，stdout 只承载协议帧，工具失败返回结构化错误而不中断会话。

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

- 不内置模型调用或自动多模型编排。
- 报告已支持范围、轻量行动及验收、变更摘要、历史折叠与悬停流向；尚无业务流程和评审关联模型。图形不支持拖拽编辑。
- 新提交执行简写限制；历史长文仍可读取，重新提交前需提炼。
- 锁与原子写入针对单机文件系统；不承诺网络文件系统语义。陈旧锁只在 `repair` 中报告，不自动删除。
- 目录指纹对超大项目设 20,000 文件与 1 MiB 单文件上限；超出会明确报错而非静默截断。
- npm 包名与许可证尚未最终确认；`LICENSE` 当前为占位，不代表已授予开源许可。

## 后续范围

1. 在真实 AI 客户端里完成 MCP 与 Skill 的端到端验证，记录宿主差异与提示词调优。
2. MCP 的资源/提示能力（当前只暴露工具）与多项目管理。
3. 按真实需求补充业务流程及评审关联；不扩展成任务管理系统。
4. 评审处置流程：采纳/拒绝/延期后把结论写回设计 revision 的便捷命令。
