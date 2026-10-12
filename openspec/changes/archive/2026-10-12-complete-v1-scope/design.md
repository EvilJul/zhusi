# Design

- **派生 revision**：`review` 与 `dispose` 以调用方给出的 `expectedRevision` 对应快照为底，生成完整的新 revision，再交给 `Workspace.commitRevision`。冲突与幂等仍只由存储层判断，因此同 `requestId` 的重试即使 expectedRevision 已过期也返回原结果。
- **评审合并**：相同 id 视为同一问题，只追加 `opinions`，不覆盖摘要；评审者不能处置。`ready` 阶段收到新评审时自动退回 `reviewing`。
- **处置**：写入 `status`（兼容旧报告）和 `disposition { decision, reason, by, at, revision }`；`by` 取 actor.client/model。
- **多项目安全边界**：MCP 只允许访问启动时注册的根，`project` 参数必须与之一致，不能借参数访问任意目录。第一个根为默认，保持旧行为。
- **资源 URI**：`zhusi://projects`、`zhusi://projects/{projectId}/design|summary.md|explanation`，按 projectId 寻址，避免在 URI 中暴露路径。
