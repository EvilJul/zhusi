# Proposal

## Why

发布就绪说明列出的剩余范围阻碍第一版完成定义：报告缺少业务流程与开发顺序，评审只是平铺列表、没有把处置写回设计的命令，MCP 只暴露工具且只能绑定一个项目，路线图阶段 0 的两个样例和真实宿主全流程验证都缺失。

## What Changes

- 设计数据模型新增 `businessFlows` 与 `developmentOrder`，评审条目新增 `opinions` 与 `disposition`；旧 revision 缺省为空数组，schema 主版本不变。
- HTML 报告与 Markdown 导出渲染业务流程（含异常分支）、开发顺序，并把评审按“问题→意见→处置”折叠展示。
- 新增 `zhusi design review` 与 `zhusi design dispose`，以及对应 MCP 工具 `zhusi_add_reviews`、`zhusi_dispose_reviews`，沿用 `expectedRevision` 冲突检测与 `requestId` 幂等。
- MCP 新增资源（项目列表、设计 JSON、Markdown 摘要、架构讲解）、提示（设计会话、评审、代码讲解）、`zhusi_list_projects`，并允许重复 `--project` 绑定多个项目。
- 新增阶段 0 样例、双客户端 stdio 端到端测试与宿主差异说明。

## Capabilities

### Modified Capabilities

- `design-authoring`: 新字段与评审处置。
- `cli-commands`: `design review` / `design dispose`。
- `mcp-tools`: 资源、提示、评审工具、多项目。

## Impact

- `src/domain/schema.ts`、`src/report/render.ts`、`src/services/review.ts`、`src/cli/index.ts`、`src/mcp/server.ts`。
- 不新增依赖；不引入模型调用。真实宿主的人工驾驶验证不在本变更内完成。
