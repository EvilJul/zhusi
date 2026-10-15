# 阶段 0 样例

路线图（`docs/roadmap.md` 阶段 0）要求两个固定样例，用来检查报告能否在两分钟内回答关键问题。两个样例都由 `tests/samples.test.mjs` 自动导入并校验。

| 目录 | 内容 | 用途 |
|---|---|---|
| `booking-system/design.json` | 小型诊所预约系统的设计提交载荷 | 核心业务、异常流程、带备选方案的决策、一个被拒绝且有理由的评审、开发顺序 |
| `existing-code/explanation.json` | 以本仓库为对象的架构讲解 | 启动位置、一次请求的流转、模块依赖理由；包含一个证据不足的 unknown 项，并区分 fact 与 intent |

手工体验：

```sh
mkdir -p /tmp/zhusi-sample && cd /tmp/zhusi-sample
npx zhusi init
npx zhusi design submit --input /path/to/zhusi/examples/booking-system/design.json
npx zhusi explain --existing /path/to/zhusi --input /path/to/zhusi/examples/existing-code/explanation.json
npx zhusi report    # 打开 .zhusi/reports/index.html
```

这两个样例是人工编写的固定数据，不代表任何真实 AI 客户端的输出。
