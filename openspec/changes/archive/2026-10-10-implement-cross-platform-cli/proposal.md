# Proposal

## Why

当前仓库只有设计文档，没有可安装、可执行的 CLI，因此用户运行 `zhusi init` 会得到“无法识别命令”。需要先交付一个真正可运行的跨平台 CLI 基础，使筑思能够初始化项目、持久化设计资料、校验状态、生成报告，并为后续 MCP、Skill 和已有项目架构讲解提供稳定的应用服务入口。

## What Changes

- 创建可发布的 TypeScript/Node.js npm 包，并提供 `zhusi` bin 入口。
- 实现跨平台 CLI：`init`、`status`、`validate`、`report`、`export`、`repair`、`explain --existing`，并提供 MCP 启动入口的兼容骨架。
- 实现 `.zhusi/` 项目空间、JSON schema、不可变 revision 快照、架构讲解快照、版本冲突、幂等请求、文件锁和原子写入。
- 实现离线静态 HTML 报告，包含设计摘要、业务/架构信息、未决问题和已有架构讲解占位/内容。
- 通过 CodeGraph 或宿主提供的代码结构数据保存已有项目架构讲解；不在本变更中自建代码索引或执行未知 shell。
- 提供 `npx zhusi <command>` 和全局安装后的 `zhusi <command>` 两种运行路径。
- 在 Windows、macOS、Linux 的 x64/arm64 环境验证路径、权限、锁、编码、报告和 CLI 行为。

## Capabilities

### New Capabilities

- `cli-commands`: 提供用户可执行的 CLI 命令、参数、输出、退出码和错误行为。
- `project-workspace`: 提供 `.zhusi/` 项目空间、快照存储、校验、并发控制和恢复能力。
- `architecture-explanation`: 为已有代码项目保存可追溯、分层的架构讲解及代码快照。
- `cross-platform-distribution`: 提供 npm 分发、bin 入口、npx 调用和 Windows/macOS/Linux 一致运行行为。

### Modified Capabilities

无。当前 `openspec/specs/` 尚无既有能力规格。

## Impact

- 新增 `package.json`、TypeScript 源码、schema、报告模板、测试和构建/发布配置。
- 新增 CLI、文件存储、报告渲染、架构讲解归一化等模块。
- 引入 Node.js LTS、MCP TypeScript SDK、运行时 schema 校验和 CLI 参数解析等依赖，具体版本在设计与实现阶段锁定。
- 更新 README 与使用说明，明确当前实现状态、安装方式和跨平台运行方式。
- 后续 MCP/Skill 变更必须复用本变更提供的应用服务和数据契约，不直接绕过存储层。
