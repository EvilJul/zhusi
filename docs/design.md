# 筑思（Zhusi）详细设计

版本：0.2 · 日期：2026-10-10 · 状态：CLI 基础已实现；MCP 工具集与 Skill 适配待实现

## 1. 一页概览

筑思是供 AI 调用的本地项目设计工具，帮助架构经验不足的开发者，在开发前想清业务、识别遗漏、选择适当架构并理解选择原因。

形态：一个 npm 分发的 TypeScript 程序，提供 CLI 与 stdio MCP；附带宿主适配的 Skill；生成可离线查看的静态网页。第一版不内置模型调用，借用用户现有 AI 客户端，多模型通过共享项目文件异步协作。CLI 与 MCP 必须支持 Windows、macOS、Linux（含 x64 与 arm64）；不依赖 PowerShell、bash 或平台专属路径。

成功标准：用户能在报告中迅速找到“做什么、流程怎样、为什么这样设计、先实现什么、已有系统实际上怎样运行、哪些问题尚未确定”。

## 2. 需求与边界

### 2.1 目标用户

主要是独立开发者与架构初学者。次要是希望保留设计依据的小团队。

核心场景：用户提出粗略想法；AI 提问并补充边界；形成业务流程与架构草案；另一 AI 评审；用户确认关键选择；生成报告；跨会话继续。

### 2.2 第一版包含

- 单项目初始化与配置；需求、方案、问题、决策和评审的结构化存储。
- 通用 MCP 接口及一个已验证宿主的 Skill 安装适配。
- 三种角色的流程模板：业务分析、架构设计、独立评审。
- 串行或异步跨客户端协作，版本冲突检测。
- 状态检查、完整性验证、静态网页报告。
- 对已有代码项目生成分层的架构讲解，并明确区分代码事实、AI 推断和设计意图。
- 简体中文优先，数据支持 Unicode。
- 跨平台运行：Windows、macOS、Linux 的 x64/arm64 均提供一致的 CLI、MCP 和报告行为。

### 2.3 暂缓

账号、云端同步、团队权限、收费系统、自动代码生成、自动部署、代码知识图谱、向量数据库、实时聊天室、自动多模型编排和可拖拽架构编辑器。

需求澄清与基础架构提案可以单模型完成；多模型不是完成设计的硬门槛。

## 3. 产品原则

1. 业务先于技术：不明确用户和场景时，不直接生成技术栈。
2. 解释取舍：每个重要决策包含原因、替代方案、代价和调整条件。
3. 简短优先：概要和细节分别存储，不能靠截断长文生成摘要。
4. 事实与假设分开：未得到确认的规模、预算、合规要求等必须显式标记。
5. 多模型一致不等于正确：保留分歧，以证据和用户约束判断。
6. 保存可审阅的分析摘要，不要求或宣称保存完整内部思维链。
7. 工具保证数据与流程规则，AI 负责分析，用户决定关键业务约束。

## 4. 业务流程

### 4.1 阶段

idea → clarifying → drafting → reviewing → ready

ready 表示材料满足完整性要求，并不代表已经实现或证明架构正确。允许返回此前阶段；历史版本保留。

### 4.2 从想法到蓝图

1. init：创建项目空间，保存原始想法、目标与约束。
2. clarify：AI 识别高影响未知项，每轮最多向用户询问三个问题。可选问题可使用显式假设；阻塞问题未确认时，方案只能作为草案。
3. model business：整理角色、核心场景、正常路径、异常路径、实体和业务规则。
4. propose：对业务需求提出最简单可行架构，说明备选、代价和扩展触发条件。
5. review：评审者先基于需求独立检查，再阅读已有理由和评审，减少盲目跟随。
6. resolve：提出者回应意见；采纳、拒绝或延期均保留理由。需要业务判断时交给用户。
7. finalize：运行验证。重要未决问题和高优先级意见未处理时不得标记 ready。
8. report：生成网页；未完成设计也可以生成报告，但清晰标记草案和未决项。

### 4.3 修改已有需求

更新需求产生新 revision，基于旧 revision 的方案与决策标为需复核。第一版保守地将相关设计全部标为过期，不实现复杂依赖传播。用户或 AI 可以重新确认仍适用的决策，形成新的引用关系。

### 4.4 多 AI 协作
AI A 读取版本 3 并提交方案；AI B 在之后读取方案版本 4 并提交评审；AI A 根据意见提交版本 5。宿主负责调用 AI；MCP 服务不自行产生模型回答。

角色与模型分离：actor 保存客户端提供的角色、模型标识与会话标识，这些是来源声明，不是可验证的身份认证。

默认至多两轮评审是 Skill 行为建议；需要用户解决的问题可随时暂停。未达成共识的结论不自动按投票决定。

### 4.5 解释已有项目架构

这是与“从想法到蓝图”并列的一条入口，面向已经存在代码的项目：

1. `understand existing`：用户指定项目根目录；宿主 AI 使用可用的代码理解工具（首选 CodeGraph）读取入口、模块、依赖、调用关系和配置，不由筑思执行未知 shell 或自行扫描任意路径。
2. `capture snapshot`：保存代码提交号或目录指纹、工具来源、读取范围和生成时间。无法确认的内容必须标记为 unknown，不能伪装成事实。
3. `explain`：生成三层讲解：两分钟总览、按一次请求/业务流程的运行路径、模块与关键符号的深度说明。每个结论都能回到文件、符号或配置证据。
4. `compare`：如果项目同时有筑思设计方案，分别展示“设计意图”和“当前实现”，列出一致、偏离、未知和可能过期的部分；不自动判定偏离一定是缺陷。
5. `report`：将讲解作为报告中的独立章节；代码发生变化或来源 revision 不匹配时标记为陈旧，要求重新解释而不是静默复用。

已有项目讲解可以独立使用，不要求先完成需求澄清或架构提案；它也不等同于自动重构、代码审计或生成完整文档。

## 5. 设计产物

### 5.1 需求

项目目标、用户、核心场景、第一版范围、非目标、成功标准、预算、团队能力、规模、安全和部署约束；每条包含 confirmed / assumed / unknown 状态及来源。

### 5.2 业务模型

角色、实体、正常与异常流程、权限规则、状态变化、关键不变量。例如“一个时间段只能被一个有效预约占用”。

### 5.3 架构方案

模块职责、模块间调用、外部依赖、数据实体及关系、关键接口、部署方式、失败处理和开发顺序。图只是文字模型的视图，不能成为唯一信息源。

### 5.4 架构决策

每项保存：context、choice、rationale、alternatives、tradeoffs、revisitWhen、evidence、status。页面摘要限制为几个短句，细节展开。

示例：选择模块化单体；背景是一人维护与业务频繁变化；备选为独立服务；代价是共享发布；独立扩容或团队边界明确时重新评估。

### 5.5 评审记录

记录具体目标 ID 和版本、问题、优先级、理由、建议、证据以及处置结果。优先级：blocker / important / suggestion。处置：accepted / rejected / deferred；每种都需理由。accepted 还需关联解决版本，不允许仅改标签就代表已修复。
### 5.6 已有架构讲解

讲解是基于代码证据的可追溯产物，而不是把模型长文本直接保存为“架构真相”。至少包含：

- 项目边界、运行入口、启动方式和外部依赖；
- 模块/包职责、依赖方向、关键调用链和数据流；
- 至少一个用户可理解的端到端场景，包含正常路径、关键分支和失败处理；
- 配置、持久化、鉴权、异步任务和部署关系（仅在证据存在时描述）；
- 代码事实、设计意图、AI 推断、未知项和风险提示的分类；
- `summary`、`walkthrough`、`deepDive` 三层内容，以及每条结论的 `evidence`、`confidence`、`sourceSnapshot`。

解释不能宣称模型“理解了全部代码”。超出读取范围、缺少运行时信息或仅凭命名推断的内容必须显示限制。

## 6. 技术架构

```text
AI 客户端 ─ Skill 引导
     │
     ├─ MCP stdio ─┐
     └─ CLI ───────┤
                  ▼
           应用服务与领域规则
                  │
            文件存储适配器
                  │
            .zhusi/ 项目数据
                  │
             报告渲染器
                  ▼
         静态 HTML 网页报告
```

### 6.1 选型与原因

跨平台基线：运行时使用受支持的 Node.js LTS；发布包必须声明 `bin` 入口，使 `npm install -g zhusi`、`npx zhusi` 和项目内本地调用使用同一 CLI。不得要求用户把仓库目录加入 PATH 才能运行；文档同时提供 Windows PowerShell、Windows cmd、macOS/Linux shell 和 `npx` 示例。安装后若直接输入 `zhusi` 仍不可用，CLI 应给出可操作的 PATH 或包管理器提示。

平台实现约束：路径统一使用 Node 的 `path`/`url` 能力，不拼接 `/` 或 `\`；文件名、大小写、Unicode、CRLF/LF 和符号链接行为需测试；锁与原子写入不能假设 Unix inode 或 bash 工具。Windows 下处理文件占用、长路径和权限错误，macOS/Linux 下处理大小写敏感、信号和权限差异。报告使用 file URL 规则生成，避免依赖本地 HTTP 服务器。


- TypeScript + Node.js：CLI、MCP、校验和渲染共用代码；不增加第二种后端语言。Node 最低版本在实现时按 MCP SDK 支持矩阵确定。
- 官方 MCP TypeScript SDK：避免自写协议、工具发现与 stdio 消息处理。具体版本实现时锁定并验证。
- Zod：运行时校验 AI 输入与文件数据；TypeScript 类型不能代替输入校验。
- CLI 参数库：从 Commander 等成熟方案中选一个，版本实现时确认。
- JSON：机器可验证的权威数据；Markdown：人类阅读的派生产物与流程模板。
- 静态 HTML/CSS/JS：报告不需要账号、服务器或联网；第一版用结构化节点和连线的 SVG 展示流程，原始 Mermaid 文本作为可选导出，避免依赖运行时 CDN。
- Node test runner 或 Vitest：按实现需求选一个，不维护两套测试设施。

不使用数据库：第一版单项目文件规模较小，Git 审阅更重要。出现大量查询、跨项目关系或可靠多人协作需求时再评估 SQLite；无依据不迁移到图数据库。

### 6.2 代码组织

```text
src/
  cli/            命令适配
  mcp/            协议与工具适配
  domain/         schema、状态与完整性规则
  services/       用例、修订与评审处置
  storage/        文件、锁与原子提交
  report/         HTML、样式与图形渲染
  explain/        已有代码架构讲解与证据归一化
  integrations/   Skill 宿主适配与导出
skills/           角色与工作流模板
tests/fixtures/   完整设计、草案与损坏样例
```

CLI 与 MCP 只处理输入输出；必须调用相同应用服务，防止验证规则分叉。

## 7. 本地数据设计

```text
.zhusi/
  config.json
  state.json
  revisions/
    000001.json
    000002.json
  lock/
  architecture-explanations/
    000001.json
  reports/
  architecture-explanations/
    000001.json
  reports/
    index.html
    assets/
```

每个 revision 是完整、不可变快照，包含需求、方案、决策、问题和评审。第一版设定单快照大小上限（例如 5 MB，可配置）；规模超过限制时提示归档或升级存储设计，而非静默丢弃。Markdown 导出不作为第二份权威数据。

架构讲解单独以不可变快照保存，并引用对应的设计 revision（可为空）和代码 snapshot。代码 snapshot 至少记录项目根目录标识、Git commit（若有）或目录指纹、工具/版本、读取范围及文件清单摘要；不得把整个源码复制进 `.zhusi/`。同一代码 snapshot 的重复请求应可复用或明确产生新解释版本。

通用字段：schemaVersion、projectId、revision、createdAt、actor、summary。对象使用稳定 ID；timestamp 保存 ISO 8601 UTC，网页按用户时区显示。

示例（展示核心结构，不代替完整 JSON Schema）：

```json
{
  "schemaVersion": 1,
  "projectId": "project_01",
  "revision": 4,
  "stage": "reviewing",
  "requirements": [{"id":"req_01","summary":"独立开发","status":"confirmed"}],
  "decisions": [{
    "id":"dec_01",
    "summary":"采用模块化单体",
    "choice":"模块化单体",
    "rationale":"团队规模小，业务边界仍在变化",
    "alternatives":["拆分独立服务"],
    "tradeoffs":["共享发布与故障影响"],
    "revisitWhen":["需要独立扩容"],
    "status":"proposed"
  }],
  "reviews":[],
  "questions":[]
}
```

### 7.1 并发与恢复

每次修改需提交 expectedRevision 和 requestId。在项目独占锁内重新检查当前版本，校验输入与引用，写临时快照，再 rename 成正式快照，最后原子更新 state.json 指针。requestId 存入快照用于重试去重。

版本冲突返回 REVISION_CONFLICT 和最新 revision；AI 必须重读再提交，禁止自动覆盖。锁超时返回 PROJECT_BUSY。陈旧锁需检查所有者与超时后才恢复；第一版针对同机进程，不承诺网络文件系统支持。

崩溃发生在更新指针前，未引用快照视为孤立文件，validate 报告并由 repair 显式处理；修复不得自动猜测用户意图。损坏文件不得用空数据替代。手工编辑仍要过 schema 校验，推荐通过工具修改。

## 8. CLI 设计

以下接口中，除 `install-skill` 外均已实现（`mcp` 目前仅为启动边界；`install-skill` 属后续 Skill 阶段）：

| 命令 | 行为 |
|---|---|
| zhusi init | 非破坏性初始化，不覆盖已有项目 |
| zhusi status --json | 输出阶段、版本、未决问题和过期设计 |
| zhusi validate --json | 检查结构、引用、完整性及 ready 条件 |
| zhusi report | 生成离线网页；默认不自动启动服务器 |
| zhusi export --format markdown | 导出人类可读设计 |
| zhusi install-skill --host NAME | 安装选定宿主适配，覆盖需显式选项 |
| zhusi repair --dry-run | 报告损坏指针、孤立快照和锁恢复建议 |
| zhusi mcp --project PATH | 启动固定项目的 stdio MCP 服务 |
| npx zhusi <command> | 不安装全局命令时运行同一 CLI，适用于 PATH 未配置的环境 |

CLI 结构化输出写 stdout，日志写 stderr。退出码建议：0 成功；1 运行错误；2 输入或 schema 无效；3 冲突或忙；4 设计尚未达到所请求阶段。精确定义实现时固定到文档和测试。命令发现必须覆盖全局安装、`npx`、Windows PowerShell/cmd、macOS/Linux shell 和 CI 无交互环境。

## 8.1 全平台安装与运行

第一版发布必须提供以下等价路径：

```sh
# 任意平台：不依赖全局 PATH
npx zhusi init

# Windows PowerShell / cmd、macOS / Linux shell：全局安装后
npm install --global zhusi
zhusi init
```

安装说明必须明确 Node.js 最低版本、npm/pnpm/yarn 兼容性、全局 npm bin 目录和 PATH 修复方法。推荐优先使用 `npx zhusi` 验证安装，再选择全局安装。禁止把“命令未找到”误认为项目初始化失败：这是 CLI 尚未安装或 PATH 未生效。

MCP 配置示例也必须使用跨平台可发现的命令或绝对运行时路径，不能写死 `/usr/bin/...`、`C:\Program Files\...` 或 bash-only 包装脚本。宿主无法直接发现 npm 全局 bin 时，应支持 `npx --yes zhusi mcp --project PATH` 或等价的 Node 可执行入口。

## 9. MCP 接口契约

启动时绑定用户选择的项目根目录；工具不接受任意文件路径。第一版提供 10 个核心工具。

| 工具 | 输入重点 | 输出/行为 |
|---|---|---|
| get_design_context | sections、detail、revision? | 摘要或选定字段，返回版本与分页标识 |
| update_requirements | expectedRevision、requestId、requirements | 新快照；旧方案标为待复核 |
| save_proposal | expectedRevision、requestId、business、architecture | 校验模块、流程、实体和引用 |
| submit_review | expectedRevision、requestId、targetRevision、findings | 保存针对明确旧/新版本的评审 |
| record_decision | expectedRevision、requestId、decision | 保存取舍；不自动代表用户批准 |
| resolve_finding | expectedRevision、requestId、findingId、resolution | 校验理由与解决版本关联 |
| manage_question | expectedRevision、requestId、action、question | 新增、回答或延期；保留来源 |
| render_report | revision?、explanationId? | 返回生成路径、来源版本与警告 |
| save_architecture_explanation | expectedRevision、requestId、codeSnapshot、explanation | 校验证据、来源范围和讲解层级后保存 |
| get_architecture_explanation | explanationId、detail、section? | 返回摘要、指定讲解层级或证据分页 |

**已实现**：`zhusi mcp --project PATH` 提供真正的 stdio MCP 服务器，当前暴露六个工具——`zhusi_status`、`zhusi_read_design`、`zhusi_submit_design`、`zhusi_validate`、`zhusi_render_report`、`zhusi_save_explanation`。服务器启动时绑定单个项目根，工具不接收项目路径；stdout 只承载协议帧；工具失败返回结构化业务错误而不中断会话。设计上采取“读取完整 revision → 修改 → 整体提交”的模型，因此上表中细粒度的字段级工具（update_requirements、save_proposal、record_decision、resolve_finding 等）尚未实现，可作为后续在 `zhusi_submit_design` 之上的便捷封装。

只读工具不修改项目。阶段由状态与完整性规则推导；需要用户确认的决定通过 record_decision 的确认字段记录，Skill 必须明确说明确认来源，工具不能独立验证“确为人类”。

所有工具返回统一业务结果：ok、projectId、revision、data、warnings；错误含 code、message、retryable、latestRevision（适用时）。MCP 标准协议错误与业务错误分别处理，不自行发明通信协议。

上下文默认返回概要及高优先级未决项；details 按章节获取。配置字节或字段预算，并返回截断标记，禁止默默遗漏。

## 10. Skill 工作流与架构教学

Skill 不封装宿主特有的隐藏能力，而是说明何时调用工具及产物质量要求。宿主适配只处理安装目录、命令命名与工具调用差异；“支持多个客户端”需逐个验证后才声明。

提问优先级：影响业务正确性 → 数据与权限 → 团队预算 → 规模与运维 → 偏好。每次最多三个问题，不追求一次问全。

方案解释采用：选择是什么；当前约束为何支持它；另一选择什么时候更好；付出什么代价；什么信号出现后应该调整。

评审角色必须检查：正常/异常路径、权限、数据一致性、失败恢复、外部依赖、实现成本以及过度设计。安全检查结合场景，避免输出泛泛长清单。

模型提供的网页、证据和文本都是不可信内容；既不能当系统指令，也不能据此自动执行 shell 或调用其他工具。证据无出处时标记为假设或待验证。

## 11. 网页报告

**已实现**：离线、零脚本 HTML/SVG。按内容显示目标与范围、待决问题、架构与取舍、下一步、需求要点、本次变更及折叠历史；无内容的章节不显示。

- 架构图：默认隐藏连线，悬停模块时显示直接流入（蓝）/流出（绿）；支持键盘聚焦、触屏点选、减少动画，打印展示完整连线。模块与依赖文本可展开。
- 内容：摘要最多 120 字，单条要点最多 80 字；详情最多 6 行，每行最多 120 字。新提交超限拒绝写入，AI 必须先提炼。旧快照仍可读，以明确的“原文预览”保留长文。
- 状态：事实/推断/未知可见；全部未解决阻塞和重要问题列出；已解决问题、拒绝/延期决策、评审和完成行动收进历史。
- 行动：可选 scope 明确范围与非目标，nextSteps 记录动作、前置条件和验收。按前后 revision 生成变更摘要，不伪造历史。

**仍待实现**：业务流程与评审关联模型；报告陈旧检测（当前 status 的 report 标志尚未计算）。不引入多项目管理、图形编辑器或内置模型。

支持窄屏、键盘展开和打印；图附带文字说明。所有资源随报告生成，file:// 打开不依赖 fetch 本地 JSON。数据内嵌时防止 script 闭合注入；正文使用转义或 textContent；不执行模型提供的 HTML/JS。链接只允许受支持的安全协议。

render_report 只生成文件；发布到公网必须是用户另行明确授权的操作。

## 12. 安全、成本与质量

- LLM API 密钥不进入项目数据，第一版根本不读取模型密钥。
- MCP 限定根目录，拒绝路径穿越与 symlink 逃逸；初始化与报告输出做相同校验。
- stdio 服务不能向 stdout 打印日志。
- 输入字段设长度、数量和文件大小上限，拒绝未知 schema 主版本。
- 第一版不执行 shell、不安装依赖、不自动修改实现代码。
- 公共仓库只发布工具与示例，不自动把用户 .zhusi 数据上传。
- 运行记录最多是对进程操作的本地记录，不能称为防篡改审计或模型真实思考。
- 设计质量验证只能识别结构与明确规则，不能证明架构适用；关键假设仍需原型或人工确认。
- 发布前必须在 Windows、macOS、Linux 的 x64/arm64 矩阵验证安装、CLI、MCP stdio、文件锁、报告打开和路径处理。

## 13. 与 OpenSpec / CodeGraph 配合

筑思先形成业务与设计决策，再导出 Markdown 给 OpenSpec；第一版不直接写入其内部目录，避免依赖未稳定格式。

在已有代码项目中，宿主 AI 可以调用 CodeGraph 查实际模块和依赖，再通过架构讲解工作流保存证据、解释和与设计的差异。筑思不自己实现代码索引，也不把 CodeGraph 的结果未经来源标注地当作事实。设计计划与当前代码事实在报告中分别标注。

官方参考（用于定位，具体接口实现时重新核查）：

- OpenSpec：https://github.com/Fission-AI/OpenSpec
- CodeGraph（本文参考版本）：https://github.com/codegraph-ai/CodeGraph
- MCP：https://modelcontextprotocol.io/

## 14. 后续自动多模型扩展

只有确认手动跨客户端流程有效后才增加模型适配器。独立模块负责 API、超时、限流、费用估算和任务状态；仍通过相同应用服务提交结果。

自动任务必须固定需求/方案版本、设置最大轮次与费用上限、每步保存结果；中断后从未完成步骤恢复。失败不可用空输出冒充评审成功。异步自动运行若需关闭终端仍继续，应明确引入后台进程，而不是声称 stdio MCP 自带此能力。

首版的自动编排扩展不要求消息队列或云工作流；先验证单机任务持久化即可。

## 15. 待后续决定

- 域名可用性。（已决定：npm 包名 `zhusi`，许可证 MIT。）
- 第一个正式支持的 AI 宿主。
- Node 与 SDK 的具体版本及发布流程。
- 第一轮用户验证后是否需要自动模型调用。
