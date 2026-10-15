# 验证记录

日期：2026-10-15。

- 类型检查：通过。
- 自动测试：108 项通过，0 失败。
- 打包冒烟：独立安装、CLI、随包 Skill、MCP 握手、bin 入口全部通过。
- OpenSpec strict 与 git diff --check：通过。
- 浏览器：默认所有边隐藏；当前模块直接流入/流出显示，无关边隐藏；移开后隐藏；键盘 Tab 可查看流向。
- 布局：1280px 桌面与 390px 窄屏检查；正文无横向溢出，架构图独立滚动。
- 同列流向：从右侧绕行，箭头落在目标模块边界。
- 示例：npm run build && node tests/report-preview.mjs /tmp/zhusi-report-preview.html。

边界：浏览器验证使用只返回虚构示例的本机 HTTP 服务；内置浏览器不允许 file URL，因此未声称完成 file 协议实测。产物无脚本、无外部资源。打印与 reduced-motion 的 CSS 已实现，但未实测系统打印及触屏设备。

新提交必须精炼；历史长文保留可展开原文。语义提炼由宿主 AI 按随包 Skill 执行，工具负责输入约束，不内置模型。
