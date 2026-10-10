# Proposal

## Why

CLI 已经能初始化、读状态、校验、生成报告，但没有任何命令能把需求、架构决策、未决问题写进 `.zhusi/`。唯一的写入路径是 `explain`（已有代码讲解）。结果是 AI 客户端没有通道提交设计内容，空项目生成的报告只能是空骨架——报告模板做好之后这个缺口更明显。

本次变更打通「读取 → 修改 → 提交」的写入通道，让用户和 AI 客户端围绕同一份不可变 revision 协作，同时完整复用现有的锁、版本冲突、幂等与原子发布规则。

## What Changes

- 新增 `zhusi design show`：读取当前完整 revision，并返回可供回写的 `expectedRevision`。
- 新增 `zhusi design template`：生成可直接填写的提交骨架（可写文件或打印到 stdout）。
- 新增 `zhusi design submit`：校验并提交一份设计 revision；复用 `Workspace.commitRevision` 的锁、`expectedRevision` 冲突检测、`requestId` 幂等与原子发布。
- 支持 `--dry-run` 只校验不落盘，以及 `--input -` 从 stdin 读取。
- 提交时若 `stage` 为 `ready` 但仍存在未解决的 blocker 问题，拒绝写入并返回阶段未满足错误。
- 保持 stdout/stderr 纪律与既有退出码映射：结构化结果写 stdout，诊断写 stderr。

## Capabilities

### New Capabilities

- `design-authoring`: 读取当前设计、生成提交骨架、提交新 revision 的命令与服务契约，含冲突、幂等、dry-run 与阶段闸门。

### Modified Capabilities

无。既有 `cli-commands`、`project-workspace`、`architecture-explanation`、`cross-platform-distribution` 的行为不变，本次只新增命令面。

## Impact

- 新增 `DesignSubmissionSchema` 与提交用例，放在 `src/services`；`src/cli` 增加 `design` 子命令，只做解析与呈现。
- 复用 `src/storage/workspace.ts` 的 `commitRevision`，不新增存储路径，不改变数据格式与 schema 版本。
- 不引入模型调用；设计内容仍由宿主 AI 客户端产生，筑思只负责校验与存储。
- 更新 README 与手工测试指南，补充写入通道用法。
