# Proposal

## Why

`zhusi mcp` 目前只是占位：它校验项目、往 stderr 打一行说明就退出，没有真正的协议实现。因此 agent 只有两条路接触筑思——走 shell 调 CLI，或者通过 `install-skill` 装的工作流说明间接调用。前者要求宿主提供终端，后者仍然依赖宿主是否会执行命令。

MCP（Model Context Protocol）是让客户端把外部能力发现为**原生工具**的标准方式：客户端连上服务器后能直接看到工具名、参数 schema 和返回值，不需要拼 shell 字符串，也不依赖 PATH。设计文档早就把「完整 MCP stdio 工具集」列为后续范围，本次把它实现。

## What Changes

- 把 `zhusi mcp --project PATH` 实现为真正的 stdio MCP 服务器，启动时绑定一个项目根。
- 暴露工具：项目状态、读取设计、提交设计、校验工作空间、生成报告、保存已有代码讲解。
- 工具覆盖的参数与 CLI 一致：提交仍要求 `expectedRevision`，仍复用 `requestId` 幂等、`stage: ready` 闸门与锁。
- stdout 只承载 MCP 协议帧，日志与诊断一律走 stderr。
- 工具失败返回结构化错误（含领域错误码），不得让服务器进程崩溃或污染协议流。
- 服务器在项目根缺失或未初始化时拒绝启动，并在 stderr 给出可操作的提示。

## Capabilities

### New Capabilities

- `mcp-tools`: stdio MCP 服务器的启动契约、工具清单、参数 schema、错误语义与 stdio 纪律。

### Modified Capabilities

无。既有 CLI 命令、数据格式与存储规则不变；MCP 工具复用同一批应用服务，不新增写入路径。

## Impact

- 新增 `src/mcp/server.ts` 与工具注册模块，`src/cli` 的 `mcp` 命令改为启动服务器。
- 复用 `src/services` 中已有的 `getStatus`、`readDesign`、`submitDesign`、`validateProject`、`createReport`、`explainExisting`，不复制业务规则。
- 依赖已在包内的 `@modelcontextprotocol/sdk`，不新增依赖、不引入模型调用。
- 更新 README、手工测试指南与发布就绪说明。
