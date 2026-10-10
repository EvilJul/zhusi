<!-- zhusi:start -->
## 筑思（zhusi）

本项目使用 `zhusi` 保存设计资料（需求、架构决策、未决问题、评审、已有代码讲解）。

- 读取当前设计：`zhusi design show --json`
- 生成提交骨架：`zhusi design template --out zhusi-draft.json`
- 提交：`zhusi design submit --input zhusi-draft.json --json`（`--input -` 可走 stdin）
- 生成报告：`zhusi report --json`
- 命令不可用时改用 `npx zhusi <command>`

提交规则：必须带等于刚读到的 `expectedRevision`；不要写 `schemaVersion` / `projectId` / `revision` / `createdAt`；带 `requestId` 以支持幂等重试；`stage: ready` 时不能有未解决的 blocker 问题。

退出码：`2` 输入或 schema 无效，`3` 版本冲突或项目忙，`4` 设计阶段未满足。

完整工作流见 zhusi 随包发布的 Skill 内容。
<!-- zhusi:end -->
