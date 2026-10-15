---
name: zhusi
description: 用筑思（zhusi）保存和更新项目设计资料——需求、架构决策、未决问题、评审与已有代码架构讲解，并生成离线 HTML 报告。当用户要求记录设计、补充需求、评审方案、解释已有代码架构，或提到 zhusi / 筑思 时使用。
allowed-tools: Bash(zhusi:*), Bash(npx zhusi:*)
metadata:
  author: zhusi
  version: "1"
---

# 筑思（zhusi）

筑思是本地优先的设计资料工具。它**不调用模型**：你负责产出结构化内容，筑思负责校验、存储和渲染。数据存在项目根的 `.zhusi/` 里，可以进 Git。

## 前置检查

```bash
zhusi --version        # 不可用时改用 npx zhusi <command>
zhusi status --json    # 项目未初始化时先运行 zhusi init
```

## 什么时候用

- 用户描述新想法、要补充需求或明确边界。
- 要记录一个架构决策（选择、理由、备选、代价）。
- 要提出或回应评审意见。
- 要解释已有代码项目的架构。
- 用户要求出设计报告。

## 核心回路：读取 → 修改 → 提交

```bash
zhusi design show --json        # 读当前完整 revision，返回 expectedRevision
zhusi design template --out /tmp/zhusi-draft.json   # 或从骨架开始
# 编辑：填写 summary / requirements / decisions / questions / reviews / architecture
zhusi design submit --input /tmp/zhusi-draft.json --dry-run   # 先只校验
zhusi design submit --input /tmp/zhusi-draft.json --json      # 正式提交
```

也可以直接管道传入，避免临时文件：

```bash
echo '{"expectedRevision":0,"stage":"drafting","summary":"…"}' | zhusi design submit --input - --json
```

提交后生成报告：

```bash
zhusi report --json    # 返回 .zhusi/reports/index.html 的路径
```

## 提交规则（必须遵守）

1. **必须带 `expectedRevision`**，且等于你刚才 `design show` 读到的值。不带会被拒绝。
2. **不要写 `schemaVersion` / `projectId` / `revision` / `createdAt`**，这些由工具分配；写了会被当作未知字段拒绝。
3. **带 `requestId`**（UUID）。重试时沿用同一个 `requestId` 才不会产生重复 revision。
4. **`stage: ready` 时不能有未解决的 blocker 问题**，否则会被拒绝。
5. 每次提交产生一个**完整的新 revision**，不是字段补丁。`design show` 返回的整份文档要一起带回去，漏掉的字段会真的丢失。

## 载荷结构

```json
{
  "expectedRevision": 0,
  "requestId": "<uuid>",
  "actor": { "client": "<你的客户端>", "model": "<模型标识>" },
  "stage": "idea | clarifying | drafting | reviewing | ready",
  "summary": "一到两句，说清做什么、边界在哪",
  "scope": { "included": ["本期交付什么"], "excluded": ["本期明确不做什么"] },
  "nextSteps": [{ "id": "step_01", "summary": "一个具体动作", "prerequisite": "开始条件", "acceptance": "可检查的完成结果", "status": "pending" }],
  "requirements": [{ "id": "req_01", "summary": "…", "status": "confirmed | assumed | unknown" }],
  "decisions": [{
    "id": "dec_01", "summary": "…", "status": "accepted | proposed | rejected | deferred",
    "choice": "…", "rationale": "为什么", "alternatives": ["备选"],
    "tradeoffs": ["代价"], "revisitWhen": ["什么时候重新评估"]
  }],
  "questions": [{ "id": "q_01", "summary": "…", "priority": "blocker | important | suggestion", "status": "open | resolved" }],
  "reviews": [{
    "id": "rev_01", "summary": "问题", "priority": "blocker | important | suggestion",
    "opinions": [{ "author": "评审者", "text": "意见" }],
    "disposition": { "decision": "accepted | rejected | deferred", "reason": "处置理由" }
  }],
  "businessFlows": [{
    "id": "flow_01", "name": "下单", "trigger": "触发条件",
    "steps": [{ "actor": "用户", "action": "动作", "result": "结果" }],
    "exceptions": ["异常分支及处理"]
  }],
  "developmentOrder": [{ "id": "dev_01", "name": "阶段名", "summary": "…", "dependsOn": [], "deliverables": ["交付物"], "status": "planned | in-progress | done" }],
  "architecture": {
    "modules": [{ "id": "api", "name": "HTTP API", "responsibility": "路由与校验", "layer": "入口" }],
    "dependencies": [{ "from": "api", "to": "svc", "label": "提交预约" }],
    "links": [{ "label": "文档", "url": "https://…" }]
  }
}
```

`architecture.modules` 的 `layer` 决定报告里架构图的列；不填则按依赖关系自动分层。`dependencies` 的 `from`/`to` 可以引用模块的 `id` 或 `name`。

## 内容质量要求

- **先提炼，再提交，禁止大段文字**：摘要最多 120 字；每条需求、问题、评审、决策标题最多 80 字，均只写一行。上限不是目标，优先写 20–40 字。
- **摘要只回答目标与边界**：最多两句，不重复标题，不写背景铺垫、空泛收益或套话。
- **决策只抓取舍**：`choice` 最多 80 字，`rationale` 最多 120 字；`alternatives` / `tradeoffs` / `revisitWhen` 每组最多 5 条，每条最多 80 字。优先只写最重要的一条代价。
- **详情也必须精炼**：`details` 和 `architecture.notes` 最多 6 行，每行一个不超过 120 字的要点；禁止把长文搬进折叠区来绕过限制。被拒绝时必须改写提炼，不可直接截断关键条件。
- **图上只写标签**：模块名最多 40 字，职责和连线说明最多 80 字。`dependencies` 必须提供真实的 `from` → `to`，报告只在悬停 / 聚焦模块时显示直接上游与下游，不凭空推断连线。
- **范围与行动分开**：`scope.included` / `excluded` 每项最多 80 字；`nextSteps` 记录动作、可选前置条件和必填验收结果，完成后标 `done`。两者均为可选字段，读回提交时必须保留。
- **旧资料可读，新提交必须精简**：旧快照原样保留；若旧内容超限，先准确提炼全部要点后再提交，不丢失阻塞条件。HTML 的“原文预览”只是兼容旧资料，不是生成摘要。
- **事实、假设、未知分开**：没确认的规模/预算/合规写成 `assumed` 或 `unknown`，不要写成既定事实。
- **每个重要决策都要有理由和代价**：只写结论的决策等于没写。
- **关键结论要有证据**：解释已有代码时，`evidence` 里写 `文件:行号`；没有证据就标 `inferred` 或 `unknown`。
- **不要替用户做业务决定**：需要用户拍板的问题放进 `questions`，标 `blocker`，而不是自己假定答案。

## 退出码与处置

| 退出码 | 含义 | 你该做什么 |
|---|---|---|
| 0 | 成功 | 继续 |
| 2 | 输入或 schema 无效 | 读错误里的字段路径，修正载荷后重试 |
| 3 | 版本冲突或项目忙 | 重新 `design show`，基于最新 revision 重新组织内容再提交；不要盲目重试 |
| 4 | 阶段未满足 | 有未解决的 blocker；先解决或把 stage 降到 `reviewing` |

`--json` 时结构化结果在 stdout，诊断在 stderr。失败时 stdout 是 `{ ok: false, code, message, retryable, latestRevision? }`。

## 评审回路：问题 → 意见 → 处置

评审者只追加问题和意见，不改别人的设计；处置由设计负责人完成。两步都会生成新 revision，同样遵守 `expectedRevision` / `requestId` 规则。

```bash
# 评审者：追加评审（同 id 的评审只追加 opinions）
zhusi design review --input review.json --json
#   review.json: { "expectedRevision": 3, "requestId": "<uuid>", "reviews": [{ "id": "rev_02", "summary": "…", "opinions": [{ "author": "…", "text": "…" }] }] }

# 负责人：处置（accept | reject | defer），理由写进 --reason
zhusi design dispose -r rev_02 -d reject -m "当前规模不需要" -e 4 --request-id <uuid> --json
# 批量：zhusi design dispose --input dispositions.json --json
```

MCP 下对应 `zhusi_add_reviews` 与 `zhusi_dispose_reviews`。

## 已有代码架构讲解

```bash
zhusi explain --existing /path/to/code --input /tmp/explain.json --json
```

讲解输入是 `summary` / `walkthrough` / `deepDive` / `limitations`，每条结论可带 `evidence`。筑思会记录 Git commit 或目录指纹，源码变化后在 `status` 和报告里标记陈旧。

## 不要做

- 不要为了让提交通过而删掉未决问题或降低优先级。
- 不要把 `stage` 直接改成 `ready` 来绕过 blocker。
- 不要手动编辑 `.zhusi/` 下的文件；走 `design submit`，否则会绕过锁和幂等。
- 不要在报告里插入 HTML/脚本；报告是数据渲染，不接受富文本。
