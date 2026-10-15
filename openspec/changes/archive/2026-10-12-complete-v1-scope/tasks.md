# Tasks

## 1. 数据模型与报告

- [x] 1.1 新增 `BusinessFlowSchema`、`DevelopmentStepSchema`、`ReviewItemSchema`（opinions / disposition），旧 revision 默认空数组。
- [x] 1.2 HTML 报告新增业务流程、开发顺序，评审改为折叠线程；Markdown 导出同步。
- [x] 1.3 测试：默认值、非法枚举、渲染、转义、Markdown。

## 2. 评审处置

- [x] 2.1 `services/review.ts`：`addReviews`、`disposeReviews`。
- [x] 2.2 CLI `design review`、`design dispose`（单条 flags 与 `--input` 批量，`--dry-run`）。
- [x] 2.3 测试：写回、旧快照不可变、幂等、冲突、未知 id、未知决定、批量、dry-run、ready 退回 reviewing。

## 3. MCP

- [x] 3.1 工具 `zhusi_list_projects`、`zhusi_add_reviews`、`zhusi_dispose_reviews`；全部工具支持 `project` 参数。
- [x] 3.2 资源与资源模板；三个提示。
- [x] 3.3 `zhusi mcp` 支持重复 `--project`。
- [x] 3.4 测试：多项目隔离与拒绝、资源读取、提示、冒烟握手覆盖新能力。

## 4. 样例与端到端

- [x] 4.1 `examples/booking-system`、`examples/existing-code` 及 `tests/samples.test.mjs`。
- [x] 4.2 `tests/e2e.test.mjs`：双 stdio 客户端完整流程、冲突、重试、重启续作。
- [x] 4.3 `docs/host-differences.md`；更新 release-readiness、roadmap、README。
