# 筑思 · Zhusi

> 在动手写代码前，帮你想清业务和架构。

[![CI](https://github.com/EvilJul/zhusi/actions/workflows/ci.yml/badge.svg)](https://github.com/EvilJul/zhusi/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.11-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-4c566a)](#环境要求)
[![License](https://img.shields.io/badge/license-MIT-green)](#许可证)

**本地优先的设计资料工具。** 让 AI 客户端帮你补充需求、记录架构决策、追踪未决问题、解释已有代码，并把结果沉淀成可进 Git 的本地文件与可离线打开的网页报告。

```
你 / AI 客户端  ──►  zhusi CLI · Skill · MCP
                            │
                            ▼
                    .zhusi/  本地 JSON 快照（可进 Git）
                            │
                            ▼
             离线 HTML 报告（分层架构图 / 决策卡片）
```

## 这是什么

做新项目时，最难的不是写代码，而是**在写代码之前想清楚**：需求边界在哪、为什么选这个架构、还有哪些问题没定。这些思考通常散落在聊天记录里，过两周就找不回来了。

筑思把这类"设计资料"变成项目里的一等公民：

- **结构化**——需求、决策、问题、评审各有字段，不是一坨 Markdown。
- **可追溯**——每次提交产生一个不可变 revision，谁在什么时候改了什么有据可查。
- **有证据链**——解释已有代码时，结论要标来源、置信度和未读范围。
- **给 AI 用**——提供命令行、Skill 和 MCP 三种接入方式，让 agent 主动维护这些资料。

**筑思不调用模型。** 它借用你现有的 AI 客户端来产出内容，自己只负责校验、存储和渲染——所以不需要额外购买或配置 API Key。

### 项目状态

核心功能已实现并通过自动化验收：CLI 基础、设计写入通道、评审追加与处置、Skill 注册、MCP 服务器（工具、资源、提示、多项目）。完整的“需求→提案→评审→修订”流程由双客户端 stdio 端到端测试自动模拟。

尚未完成：在 Codex / Claude Code / Cursor 中由真人驾驶的端到端验证与提示词调优（见[宿主差异说明](docs/host-differences.md)）；npm 尚未发布。

## 功能特性

| 能力 | 说明 |
|---|---|
| 项目工作空间 | 非破坏性初始化 `.zhusi/`，不可变快照，同目录原子发布 |
| 并发控制 | 项目级文件锁、`expectedRevision` 乐观并发、`requestId` 幂等重试 |
| 设计写入 | 读取 → 修改 → 提交的完整回路，支持 dry-run 与 stdin |
| 完整性约束 | `stage: ready` 时拒绝未解决的阻塞问题；拒绝不支持的 schema 版本 |
| 离线报告 | 自包含 HTML（内联 CSS/SVG，零脚本、零外部请求），含分层架构图 |
| 报告内容 | 需求、业务流程（含异常分支）、架构（图 + 模块表 + 依赖方向）、决策卡片、开发顺序、按优先级分组的未决问题、按“问题→意见→处置”折叠的评审、警告 |
| 评审处置 | `design review` 追加评审意见，`design dispose` 把采纳 / 拒绝 / 延期写回新 revision |
| 架构讲解 | 记录 Git commit 或目录指纹，源码变化后自动标记陈旧 |
| AI 接入 | `install-skill` 按宿主注册；`zhusi mcp` 提供 9 个工具、4 类资源与 3 个提示，可绑定多个项目 |

## 环境要求

- **Node.js** >= 20.11.0（CI 覆盖 20.x 与 22.x）
- **操作系统**：Windows、macOS、Linux（x64 / arm64）
- 可选：Git（用于架构讲解的 commit 来源）；现代浏览器（查看报告）

## 安装

> **尚未发布到 npm。** 现在只能从源码安装；`npx zhusi` 与 `npm install --global zhusi` 会在发布之后才可用。

### 从源码安装（当前可用）

```sh
git clone https://github.com/EvilJul/zhusi.git
cd zhusi
npm install              # 依赖安装后会自动构建（prepare 脚本）
npm install --global .   # 注册全局 zhusi 命令
zhusi --version
```

开发调试时用 `npm link` 更顺手：它建立一条指向仓库的链接，改完代码只需重新 `npm run build`，不必重新安装。

```sh
npm link
npm run build
npm unlink -g zhusi      # 需要时取消链接
```

也可以从打包产物安装：

```sh
npm pack
npm install --global ./zhusi-0.1.0.tgz
```

### 从 npm 安装（尚未发布）

发布到 npm 之后，这两条会成为推荐路径：

```sh
npx zhusi init
npm install --global zhusi
```

<details>
<summary>提示「命令找不到」怎么办</summary>

从源码全局安装后仍提示 `'zhusi' 不是内部或外部命令`（Windows）或 `zhusi: command not found`（macOS/Linux），说明 npm 全局可执行目录不在 `PATH` 中。这**不是**项目初始化失败。

```sh
npm config get prefix
# Windows：把打印出的目录本身加入 PATH
# macOS / Linux：把 <该目录>/bin 加入 PATH
```

修改 `PATH` 后需要重开终端。发布到 npm 之后，也可以直接用 `npx zhusi <command>` 绕过 `PATH`。

</details>

## 快速开始

```sh
cd your-project
zhusi init                                   # 建立 .zhusi/ 工作空间
zhusi design template --out design.json      # 生成可填写的提交骨架
# 编辑 design.json：填写 summary / requirements / decisions / questions / architecture
zhusi design submit --input design.json --dry-run   # 先只校验
zhusi design submit --input design.json             # 正式提交
zhusi report                                        # 生成离线报告
```

`report` 会返回一个 `.zhusi/reports/index.html` 路径，用浏览器直接打开即可，无需服务器、无需联网。

## 命令参考

| 命令 | 说明 |
|---|---|
| `zhusi init` | 非破坏性初始化 `.zhusi/`；重复执行不会覆盖已有数据 |
| `zhusi status` | 阶段、revision、未决问题数量、陈旧指示、警告 |
| `zhusi validate` | 只读校验结构、引用与 schema 版本 |
| `zhusi design show` | 读取当前完整 revision 与 `expectedRevision` |
| `zhusi design template` | 生成可直接填写的提交骨架 |
| `zhusi design submit` | 校验并提交新的不可变 revision |
| `zhusi design review` | 追加评审问题或意见（同 id 只追加意见），生成新 revision |
| `zhusi design dispose` | 把 accept / reject / defer 处置及理由写回新 revision |
| `zhusi report` | 生成可离线打开的静态 HTML 报告 |
| `zhusi export` | 导出 Markdown 派生文件（含源 revision 与警告） |
| `zhusi repair` | 报告孤立快照与陈旧锁；默认只读 |
| `zhusi explain` | 保存已有代码项目的分层架构讲解 |
| `zhusi install-skill` | 把 zhusi 注册给 AI 客户端 |
| `zhusi mcp` | 启动 stdio MCP 服务器；`--project` 可重复以绑定多个项目 |

通用选项：`--project PATH` 指定项目根（默认当前目录），`--json` 输出机器可读结果。

**退出码**

| 码 | 含义 |
|---|---|
| 0 | 成功 |
| 1 | 运行错误 |
| 2 | 输入或 schema 无效；用法错误（缺少必填选项、未知命令或选项）；项目尚未初始化 |
| 3 | 版本冲突或项目忙 |
| 4 | 设计阶段未满足 |

`--json` 时结构化结果写 stdout，诊断信息只写 stderr，便于脚本与 agent 消费。

## 设计写入通道

筑思不生成内容，只负责校验与保存。标准回路是**读取 → 修改 → 提交**：

```sh
zhusi design show --json > current.json       # 读出当前 revision 与 expectedRevision
zhusi design template --out next.json         # 或从骨架开始
# 编辑 next.json
zhusi design submit --input next.json --dry-run
zhusi design submit --input next.json
```

提交载荷示例：

```json
{
  "expectedRevision": 0,
  "requestId": "6f1c8a2e-...",
  "stage": "reviewing",
  "summary": "预约系统。第一版只做单店、单时区。",
  "requirements": [
    { "id": "req_01", "summary": "顾客可选择时段并预约", "status": "confirmed" }
  ],
  "decisions": [{
    "id": "dec_01", "summary": "采用模块化单体", "status": "accepted",
    "choice": "模块化单体",
    "rationale": "一人维护、业务边界仍在变化",
    "alternatives": ["拆成微服务"],
    "tradeoffs": ["共享发布，单点故障影响面更大"],
    "revisitWhen": ["需要按模块独立扩容"]
  }],
  "questions": [
    { "id": "q_01", "summary": "是否支持顾客自行取消？", "priority": "blocker", "status": "open" }
  ],
  "reviews": [],
  "architecture": {
    "modules": [{ "id": "api", "name": "HTTP API", "responsibility": "路由与校验", "layer": "入口" }],
    "dependencies": [],
    "links": []
  }
}
```

<details>
<summary>提交规则（写错会被拒绝）</summary>

- `expectedRevision` **必填**，且必须等于你刚读到的值——否则判定为过期写入（退出码 3）。
- `schemaVersion` / `projectId` / `revision` / `createdAt` 由工具分配，**不要写进载荷**，写了会被当作未知字段拒绝。
- 带 `requestId`：重试时沿用同一个值才走幂等，不会产生第二个 revision。
- `stage: ready` 时不能有未解决的 `blocker` 问题（退出码 4）。
- 每次提交是**完整快照**而不是字段补丁：从 `design show` 读到的内容要整体带回去，遗漏的字段会真的丢失。
- `--input -` 可从 stdin 读取，便于管道调用。

</details>

## 接入 AI 客户端

### 方式一：Skill 注册

让 agent 知道 zhusi 存在、什么时候该用、提交要守什么规则：

```sh
zhusi install-skill --host codex      # 或 claude / cursor / all
```

| 宿主 | Skill / 规则文件 | 指令文件 |
|---|---|---|
| `codex` | `.agents/skills/zhusi/SKILL.md` | `AGENTS.md` 中的受管块 |
| `claude` | `.claude/skills/zhusi/SKILL.md` | `CLAUDE.md` 中的受管块 |
| `cursor` | — | `.cursor/rules/zhusi.mdc` |

- 指令文件只维护 `<!-- zhusi:start -->` 与 `<!-- zhusi:end -->` 之间的受管块，块外内容原样保留，重复执行不产生第二份。
- 默认非破坏性：已存在且内容不同的文件会被跳过，`--force` 才覆盖。
- `--user` 装到用户级配置目录（任意项目都可见）；`--dry-run` 只预览将要写入的路径。

### 方式二：MCP 服务器

把筑思暴露为**原生工具**，agent 不需要 shell，也不依赖 PATH：

```sh
zhusi mcp --project .
```

在客户端的 MCP 配置里注册（各客户端配置文件位置不同，条目形状一致）：

```json
{
  "mcpServers": {
    "zhusi": { "command": "zhusi", "args": ["mcp", "--project", "."] }
  }
}
```

| 工具 | 作用 |
|---|---|
| `zhusi_status` | 阶段、revision、未决问题、陈旧指示、警告 |
| `zhusi_read_design` | 读取完整 revision 与 `expectedRevision` |
| `zhusi_submit_design` | 校验并提交新 revision，支持 `dryRun` |
| `zhusi_validate` | 只读校验工作空间结构与引用 |
| `zhusi_render_report` | 生成离线 HTML 报告，返回路径 |
| `zhusi_save_explanation` | 保存已有代码项目的架构讲解快照 |
| `zhusi_add_reviews` | 追加评审问题或意见 |
| `zhusi_dispose_reviews` | 采纳 / 拒绝 / 延期评审并写回 |
| `zhusi_list_projects` | 列出已注册项目 |

资源：`zhusi://projects`、`zhusi://projects/{projectId}/design`、`.../summary.md`、`.../explanation`。提示：`zhusi_design_session`（需求→提案）、`zhusi_review_design`（评审）、`zhusi_explain_codebase`（代码讲解）。

`zhusi mcp --project A --project B` 可绑定多个项目，第一个为默认；工具的可选 `project` 参数只能指向已注册的项目，不能访问任意目录。stdout 只承载协议帧，日志与诊断一律走 stderr；工具失败返回结构化错误（含领域错误码与 `latestRevision`），不会中断会话。

## 网页报告

`zhusi report` 生成**单文件、零依赖**的 HTML：

- **分层架构图**——由 `architecture.modules` 与 `architecture.dependencies` 生成。模块有 `layer` 时按层分列并显示层带，否则按依赖关系自动拓扑分层；连线带依赖标签，跨列连线从中间模块上方绕过而不是穿框而过。
- **决策卡片**——保留选择、理由、备选方案、代价与重新评估条件，而不是只有标题。
- **未决问题**——按阻塞 / 重要 / 建议分组配色，阻塞项一眼可见。
- **评审记录**——显示优先级与处置结果。
- **安全**——所有用户内容转义，`javascript:` 等危险协议被拒绝，报告中没有任何 `<script>`。

断网可打开，窄屏下架构图与表格各自横向滚动，支持打印样式。

## 数据存储

所有数据都在项目根的 `.zhusi/` 下，纯 JSON，可直接进 Git：

```
.zhusi/
  config.json                     # 项目标识与创建时间
  state.json                       # 当前 revision / 讲解指针
  revisions/
    000001.json                    # 不可变设计快照
    000002.json
  architecture-explanations/
    000001.json                    # 已有代码架构讲解（不复制源码）
  reports/
    index.html                     # 离线报告
    revision-3.md                  # Markdown 派生导出
  lock/
    owner.json                     # 写入期间的项目锁
```

写入遵循：校验 → 加锁 → 复查版本 → 写临时文件 → 同目录原子替换 → 最后更新指针。中途崩溃不会破坏已有快照。

## 项目结构

```
src/
  cli/            命令解析与呈现（只做参数、调用服务、输出）
  domain/         schema、完整性规则、错误码
  services/       用例编排（项目、设计写入、Skill 安装）
  storage/        文件、锁、原子提交
  report/         HTML/SVG 渲染与架构图布局
  explain/        代码快照与讲解归一化
  mcp/            MCP 服务器与工具注册
  integrations/   宿主注册表
skills/zhusi/     随包发布的 Skill 内容
tests/            单元 / 服务 / 进程级 / 打包冒烟测试
openspec/         规格与变更记录
docs/             设计与测试文档
```

CLI、MCP 与 Skill 共用同一批应用服务，验证规则只有一份，不会分叉。

## 开发

```sh
git clone https://github.com/EvilJul/zhusi.git
cd zhusi
npm ci
npm run build
npm link            # 把本地构建注册为全局 zhusi 命令
```

常用脚本：

| 脚本 | 作用 |
|---|---|
| `npm run build` | 编译 TypeScript 到 `dist/` |
| `npm run typecheck` | 仅类型检查 |
| `npm test` | 构建 + 单元 / 服务 / 进程级测试 |
| `npm run smoke` | 打包 → 临时项目安装 → 运行核心命令与 MCP 握手 |
| `npm pack --dry-run` | 查看发布清单 |

清理本地链接：`npm unlink -g zhusi`。

## 测试

三层验证：

1. **自动化**——`npm test` 覆盖 schema、存储、并发、报告渲染、CLI 进程行为与 MCP 工具；`npm run smoke` 验证打包产物能独立安装运行。
2. **手工**——[手工测试指南](docs/manual-testing.md) 给出可复制的分步场景。
3. **全功能验收**——[全功能测试方案](docs/full-feature-test-plan.md) 含 108 个用例，覆盖全部功能面、安全边界与跨平台行为。

```sh
npm test && npm run smoke
```

CI 在 Windows / macOS / Linux 上以 Node 20.x 与 22.x 运行上述检查，见 [`.github/workflows/ci.yml`](.github/workflows/ci.yml)。

## 路线图

- [x] 跨平台 CLI 基础与 `.zhusi/` 工作空间
- [x] 设计写入通道（读取 → 修改 → 提交）
- [x] Skill 注册（Codex / Claude / Cursor）
- [x] MCP stdio 工具服务器
- [x] 报告补充业务流程与开发顺序，评审讨论按「问题→意见→处置」折叠
- [x] 评审处置命令（`design review` / `design dispose`）
- [x] MCP 资源与提示能力；多项目管理
- [x] 阶段 0 样例（[`examples/`](examples/)）与双客户端 stdio 端到端自动化测试
- [ ] 在真实 AI 客户端上由真人驾驶完成端到端验证与提示词调优
- [ ] 发布到 npm

## 参与贡献

欢迎提交 issue 与 PR。开始之前建议先读：

- [详细设计文档](docs/design.md)——数据模型、CLI/MCP 契约与设计取舍
- [实施计划与验收标准](docs/roadmap.md)——分阶段验收口径

本项目使用 [OpenSpec](https://github.com/Fission-AI/OpenSpec) 管理规格与变更，`openspec/` 下保存了完整的提案、规格与任务记录。提交功能改动时请附带对应的变更说明与测试。

提交前请确保 `npm run typecheck && npm test && npm run smoke` 全部通过。

## 相关文档

- [详细设计文档](docs/design.md)
- [实施计划与验收标准](docs/roadmap.md)
- [发布就绪说明](docs/release-readiness.md)
- [宿主差异说明](docs/host-differences.md)
- [手工测试指南](docs/manual-testing.md)
- [全功能测试方案](docs/full-feature-test-plan.md)

## 相关工具

- **OpenSpec**——组织规格与实施任务。筑思聚焦需求澄清、架构教学与决策评审。
- **CodeGraph**——理解现有代码结构。筑思管理设计意图与决策依据，可在宿主 AI 中配合使用。

## 许可证

[MIT](LICENSE) © 2026 EvilJul (Fusheng Tian)
