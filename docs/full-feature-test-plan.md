# 筑思（zhusi）全功能测试方案

版本：1.0 · 日期：2026-10-10
对应实现：`implement-cross-platform-cli`、`add-design-write-channel`、`add-skill-install-adapters`、`add-mcp-tool-server`

本方案用于人工验收筑思当前的全部功能面。自动化测试（`npm test`、`npm run smoke`）覆盖其中的机械断言，本方案用于确认真实使用路径、输出可读性、跨平台行为与安全边界。建议**先跑一遍自动化**，再按本方案逐项人工确认。

---

## 0. 测试准备

### 0.1 环境要求

| 项目 | 要求 |
|---|---|
| Node.js | >= 20.11.0（建议 22.x） |
| npm | 随 Node 提供 |
| Git | 用于讲解快照的 commit 来源（可选） |
| 浏览器 | Chrome / Edge，用于打开离线报告 |
| 操作系统 | 至少覆盖 Windows；有条件再补 macOS / Linux |

### 0.2 建立工作目录变量

PowerShell：

```powershell
Set-Location 'C:\Users\tian\Documents\Projects\zhusi'
npm ci
npm run build
$CLI = "$PWD\dist\cli\index.js"
$Work = Join-Path $env:TEMP ("zhusi-frt-" + (Get-Random))
New-Item -ItemType Directory $Work | Out-Null
Write-Output "工作目录：$Work"
```

macOS / Linux 对应写法：

```sh
cd /path/to/zhusi && npm ci && npm run build
CLI="$PWD/dist/cli/index.js"
Work="$(mktemp -d)"
```

后续所有用例默认使用 `node $CLI` 调用仓库构建产物。若已执行 `npm link` 或全局安装，把 `node $CLI` 换成 `zhusi` 即为等价路径（用例 A3、A4 专门验证这一点）。

### 0.3 准备三份测试数据

| 代号 | 用途 | 准备方式 |
|---|---|---|
| `$Project` | 空项目，用于 init / 校验类用例 | 见下方命令 |
| `$Demo` | 有完整设计数据，用于报告 / 导出 / MCP 用例 | 用 `scripts/seed-demo.mjs` |
| `$Code` | 一个真实 Git 项目，用于架构讲解用例 | 见用例 G1 内置命令 |

```powershell
$Project = Join-Path $Work 'empty-project'
New-Item -ItemType Directory $Project | Out-Null

$Demo = Join-Path $Work 'demo-project'
New-Item -ItemType Directory $Demo | Out-Null
node "$PWD\scripts\seed-demo.mjs" $Demo
```

`seed-demo.mjs` 会写入一份含 3 条决策、4 个未决问题、2 条评审、6 个模块与 7 条依赖的演示数据，并打印报告命令。

### 0.4 判定标准

| 判定 | 含义 |
|---|---|
| 通过 | 实际输出与「预期」一致，退出码一致 |
| 失败 | 输出或退出码不符，或出现未预期的副作用 |
| 阻塞 | 环境问题导致无法执行（需记录环境信息） |
| 跳过 | 当前平台不适用（如 Windows 上的 POSIX 权限用例），需注明原因 |

记录要求：每条失败的用例必须留下**完整命令、完整 stdout/stderr、退出码**，以及 `node --version`、`npm --version`、操作系统版本。

### 0.5 退出码约定（全方案通用）

| 退出码 | 含义 |
|---|---|
| 0 | 成功 |
| 1 | 运行错误 |
| 2 | 输入或 schema 无效 |
| 3 | 版本冲突或项目忙 |
| 4 | 设计阶段未满足 |
| 130 | 用户中断（Ctrl+C） |

---

## A. 安装与分发

#### A1 · 仓库构建产物可直接运行

```powershell
node $CLI --version
```

预期：stdout 输出 `0.1.0`，退出码 `0`，stderr 为空。

结果：☐ 通过 ☐ 失败

#### A2 · 帮助信息完整

```powershell
node $CLI --help
```

预期：列出 `init`、`status`、`validate`、`report`、`export`、`repair`、`explain`、`mcp`、`design`、`install-skill` 与全局 `--json`；退出码 `0`。

#### A3 · 全局命令可用（npm link 或全局安装后）

```powershell
npm link
zhusi --version
zhusi design --help
```

预期：`zhusi` 解析到本仓库构建产物；`zhusi design` 列出 `show` / `template` / `submit`。

清理：`npm unlink -g zhusi`（如需）。

#### A4 · 打包产物内容正确

```powershell
npm pack --dry-run
```

预期：清单包含 `dist/**`、`skills/zhusi/SKILL.md`、`README.md`、`LICENSE`；**不包含** `src/`、`tests/`、`openspec/`、`docs/`、`.agents/`、`.codegraph/`。

#### A5 · 打包产物可独立安装运行

```powershell
$Consumer = Join-Path $Work 'consumer'
New-Item -ItemType Directory $Consumer | Out-Null
Set-Content (Join-Path $Consumer 'package.json') '{ "name": "c", "private": true, "version": "1.0.0" }'
npm pack
Push-Location $Consumer
npm install --no-audit --no-fund (Get-ChildItem "$PWD\..\..\zhusi-*.tgz" -ErrorAction SilentlyContinue).FullName
npx --no-install zhusi --version
Pop-Location
```

预期：临时项目内命令解析到 tarball 版本并输出版本号。等价验证见 `npm run smoke`。

#### A6 · 未安装时的诊断

```powershell
npx --no-install zhusi --version
```

在**没有**安装 zhusi 的目录执行。

预期：提示无法解析该包；文档与 README 提供了 `npx zhusi` 与 PATH 修复说明。此项验证的是"命令找不到"不会被误报为项目初始化失败。

---

## B. 项目工作空间

#### B1 · 初始化新项目

```powershell
node $CLI init --project $Project --json
```

预期：`ok: true`、`created: true`、含 `projectId` 与 `root`；退出码 `0`。目录下出现 `.zhusi/`，包含 `config.json`、`state.json` 以及 `revisions/`、`architecture-explanations/`、`reports/`、`lock/`。

#### B2 · 重复初始化非破坏性

```powershell
$state = Join-Path $Project '.zhusi\state.json'
$before = (Get-FileHash $state).Hash
node $CLI init --project $Project --json
$after = (Get-FileHash $state).Hash
"before=$before"; "after=$after"; "equal=$($before -eq $after)"
```

预期：第二次 `created: false`，`projectId` 与首次相同，两个哈希相等。

#### B3 · 路径兼容：空格、Unicode、相对、绝对

```powershell
$Odd = Join-Path $Work '项目 with spaces 你好'
New-Item -ItemType Directory $Odd | Out-Null
node $CLI init --project $Odd --json
Push-Location $Work
node $CLI status --project '项目 with spaces 你好' --json
node $CLI status --project $Odd --json
Pop-Location
```

预期：三次调用的 `projectId` 完全一致；路径中的空格与中文不丢失。

#### B4 · 未初始化目录的错误处理

```powershell
$Bare = Join-Path $Work 'bare'
New-Item -ItemType Directory $Bare | Out-Null
node $CLI status --project $Bare --json
```

预期：失败并说明工作空间不存在/未初始化；退出码非 0；**不自动创建 `.zhusi/`**（检查目录仍为空）。

#### B5 · 跨目录调用不误伤

```powershell
Push-Location $Project
node $CLI status --json
Pop-Location
node $CLI status --project $Project --json
```

预期：省略 `--project` 时作用于当前目录；显式指定时作用于指定目录；两者指向同一项目。

---

## C. 状态与校验

#### C1 · 状态：人类可读输出

```powershell
node $CLI status --project $Demo
```

预期：输出项目 id、阶段、revision、未决问题数量（多行纯文本，无 JSON 花括号）；退出码 `0`。

#### C2 · 状态：JSON 输出字段完整

```powershell
node $CLI status --project $Demo --json
```

预期：stdout 是合法 JSON，含 `ok`、`projectId`、`root`、`revision`、`stage`、`unresolvedQuestions`、`stale.report`、`stale.explanation`、`warnings`；stderr 为空。

#### C3 · 状态：陈旧指示

先用 `$Demo` 之外的 Git 代码项目跑一次 `explain`（见 G1），然后修改源码并提交：

```powershell
node $CLI status --project $Demo --json    # 修改前：stale.explanation = false
# 修改 $Code 中任意文件并 git commit
node $CLI status --project $Demo --json    # 修改后：stale.explanation = true
```

预期：源码 commit 变化后 `stale.explanation` 由 `false` 变 `true`。

#### C4 · 校验：健康项目

```powershell
node $CLI validate --project $Demo --json
```

预期：`ok: true`、`errors: []`；退出码 `0`；不修改任何文件。

#### C5 · 校验：损坏 JSON

```powershell
$state = Join-Path $Project '.zhusi\state.json'
Copy-Item $state "$state.bak"
'not-json' | Set-Content $state -Encoding utf8
node $CLI validate --project $Project --json
"exit=$LASTEXITCODE"
Get-Content $state          # 确认仍是 not-json，未被替换
Move-Item -Force "$state.bak" $state
```

预期：`ok: false`，`errors` 包含该文件与解析错误；退出码 `2`；损坏文件保持原样。

#### C6 · 校验：孤立快照

```powershell
'{ "schemaVersion": 1 }' | Set-Content (Join-Path $Demo '.zhusi\revisions\000099.json') -Encoding utf8
node $CLI validate --project $Demo --json
Remove-Item (Join-Path $Demo '.zhusi\revisions\000099.json')
```

预期：`errors` 指出 `000099.json` 校验失败；退出码 `2`。

#### C7 · 校验：不支持的 schema 主版本

```powershell
$state = Join-Path $Project '.zhusi\state.json'
Copy-Item $state "$state.bak"
(Get-Content -Raw $state).Replace('"schemaVersion": 1', '"schemaVersion": 99') | Set-Content $state -Encoding utf8
node $CLI validate --project $Project --json
Move-Item -Force "$state.bak" $state
```

预期：报错明确提示不支持的 schema 主版本、要求升级工具；退出码 `2`；不回退为空数据。

---

## D. 设计写入通道（`design`）

#### D1 · 读取空项目

```powershell
node $CLI design show --project $Project --json
```

预期：`expectedRevision: 0`、`revision: null`；不创建任何 revision 文件。

#### D2 · 生成骨架

```powershell
node $CLI design template --project $Project
```

预期：stdout 是合法 JSON，含 `expectedRevision`、`requestId`、`actor`、`stage: "drafting"`，以及空的 `requirements`/`decisions`/`questions`/`reviews`/`architecture`。

#### D3 · 骨架写入文件

```powershell
$Draft = Join-Path $Work 'draft.json'
node $CLI design template --project $Project --out $Draft --json
Get-Content -Raw $Draft | ConvertFrom-Json | Select-Object expectedRevision
```

预期：文件存在，`expectedRevision` 与 D1 一致；JSON 输出含 `path`。

#### D4 · 首次提交

```powershell
$Payload = Join-Path $Work 'submit-1.json'
@'
{
  "expectedRevision": 0,
  "requestId": "frt-001",
  "stage": "drafting",
  "summary": "全功能测试：预约系统。第一版只做单店。",
  "requirements": [{ "id": "req_01", "summary": "顾客可预约", "status": "confirmed" }],
  "questions": [{ "id": "q_01", "summary": "是否支持取消", "priority": "blocker", "status": "open" }]
}
'@ | Set-Content $Payload -Encoding utf8
node $CLI design submit --project $Project --input $Payload --json
```

预期：`created: true`、`revision: 1`；`.zhusi/revisions/000001.json` 生成；`state.json` 的 `currentRevision` 变为 1。

#### D5 · 读回提交内容

```powershell
node $CLI design show --project $Project --json
```

预期：`expectedRevision: 1`；`revision.summary` 与 D4 一致；`requirements[0].summary` 为「顾客可预约」。

#### D6 · 幂等：同一 requestId 重试

```powershell
node $CLI design submit --project $Project --input $Payload --json
node $CLI design show --project $Project --json
```

预期：第二次返回 `created: false`、`revision: 1`；`expectedRevision` 仍为 1，未产生第二个 revision。

#### D7 · 版本冲突：过期 expectedRevision

```powershell
(Get-Content -Raw $Payload).Replace('frt-001', 'frt-002') | Set-Content $Payload -Encoding utf8
node $CLI design submit --project $Project --input $Payload --json
"exit=$LASTEXITCODE"
```

预期：`ok: false`、`code: "REVISION_CONFLICT"`、`latestRevision: 1`；退出码 `3`；数据未被覆盖。

#### D8 · 缺少 expectedRevision 时拒绝写入

```powershell
'{"requestId":"frt-003","stage":"drafting"}' | Set-Content $Payload -Encoding utf8
node $CLI design submit --project $Project --input $Payload --json
"exit=$LASTEXITCODE"
```

预期：`code: "INVALID_INPUT"`，提示需要 `expectedRevision`；退出码 `2`；revision 数不变。

#### D9 · 拒绝服务端管理字段

```powershell
'{"expectedRevision":1,"revision":99,"projectId":"x","stage":"drafting"}' | Set-Content $Payload -Encoding utf8
node $CLI design submit --project $Project --input $Payload --json
"exit=$LASTEXITCODE"
```

预期：`code: "INVALID_INPUT"`，错误指出未识别的字段；退出码 `2`。**不能**静默忽略这些字段。

#### D10 · schema 非法载荷

```powershell
'{"expectedRevision":1,"requestId":"frt-004","decisions":[{"id":"d1"}]}' | Set-Content $Payload -Encoding utf8
node $CLI design submit --project $Project --input $Payload --json
"exit=$LASTEXITCODE"
```

预期：`code: "INVALID_INPUT"`，错误含字段路径（如 `decisions.0.summary`）；退出码 `2`。

#### D11 · 阶段闸门：ready 且存在未解决 blocker

```powershell
'{"expectedRevision":1,"requestId":"frt-005","stage":"ready","questions":[{"id":"q_01","summary":"是否支持取消","priority":"blocker","status":"open"}]}' | Set-Content $Payload -Encoding utf8
node $CLI design submit --project $Project --input $Payload --json
"exit=$LASTEXITCODE"
```

预期：`code: "STAGE_NOT_READY"`，消息里点出阻塞问题；退出码 `4`；未写入。

#### D12 · blocker 解决后可进入 ready

```powershell
'{"expectedRevision":1,"requestId":"frt-006","stage":"ready","questions":[{"id":"q_01","summary":"是否支持取消","priority":"blocker","status":"resolved"}]}' | Set-Content $Payload -Encoding utf8
node $CLI design submit --project $Project --input $Payload --json
```

预期：`created: true`、`revision: 2`、`stage: "ready"`。

#### D13 · dry-run 不写入

```powershell
$before = (Get-ChildItem (Join-Path $Project '.zhusi\revisions') -File).Count
'{"expectedRevision":2,"requestId":"frt-007","stage":"drafting"}' | Set-Content $Payload -Encoding utf8
node $CLI design submit --project $Project --input $Payload --dry-run --json
$after = (Get-ChildItem (Join-Path $Project '.zhusi\revisions') -File).Count
"before=$before after=$after"
```

预期：`dryRun: true`；文件数量不变；`expectedRevision` 仍为 2。

#### D14 · 从 stdin 提交

```powershell
'{"expectedRevision":2,"requestId":"frt-008","stage":"reviewing","summary":"来自 stdin"}' | node $CLI design submit --project $Project --input - --json
```

预期：`created: true`、`revision: 3`；`revision.summary` 为「来自 stdin」。

#### D15 · `--expected-revision` 优先于载荷值

```powershell
$OV = Join-Path $Work 'override'
New-Item -ItemType Directory $OV | Out-Null
node $CLI init --project $OV --json | Out-Null
'{"expectedRevision":0,"requestId":"ov-1","stage":"drafting","summary":"第一次"}' | Set-Content $Payload -Encoding utf8
node $CLI design submit --project $OV --input $Payload --json | Out-Null

# 载荷里仍写 expectedRevision 0，用命令行参数覆盖为 1
'{"expectedRevision":0,"requestId":"ov-2","stage":"drafting","summary":"第二次"}' | Set-Content $Payload -Encoding utf8
node $CLI design submit --project $OV --input $Payload --expected-revision 1 --json
```

预期：`created: true`、`revision: 2`。若参数没有生效，会因为载荷里的 `expectedRevision: 0` 已过期而返回退出码 3。

注意：重试**同一条**提交时必须复用同一个 `requestId`，否则会命中版本冲突；这条用例特意用了新的 `requestId`。

#### D16 · 非法 `--expected-revision`

```powershell
node $CLI design submit --project $Project --input $Payload --expected-revision abc --json
"exit=$LASTEXITCODE"
```

预期：`code: "INVALID_INPUT"`；退出码 `2`。

#### D17 · 提交载荷不是合法 JSON

```powershell
'{ 不是合法 json' | Set-Content $Payload -Encoding utf8
node $CLI design submit --project $Project --input $Payload --json
"exit=$LASTEXITCODE"
```

预期：`code: "INVALID_INPUT"`，消息指出 JSON 解析失败；退出码 `2`。

---

## E. 报告与导出

报告用例统一用 `$Demo`（含完整设计数据）。先重新生成一次：

```powershell
$Report = (node $CLI report --project $Demo --json | ConvertFrom-Json).path
Write-Output $Report
```

#### E1 · 报告生成与可打开

```powershell
node $CLI report --project $Demo --json
Start-Process $Report      # 或手动用浏览器打开该路径
```

预期：文件生成在 `.zhusi/reports/index.html`；退出码 `0`；断网状态下浏览器正常渲染。

#### E2 · 离线自包含，无外部依赖

```powershell
$html = Get-Content -Raw $Report
"script标签=$($html -match '<script')"
"外部URL=$($html -match 'https?://')"
```

预期：两项均为 `False`。报告不引用 CDN、字体或任何网络资源。

#### E3 · 架构图使用真实模块

在渲染出的报告中检查「架构」区。

预期：图中出现 `HTTP API`、`预约服务`、`门店配置`、`时段占用规则`、`数据库`、`通知 Outbox` 六个节点，**不是**「业务入口 / 核心模块 / 数据与外部依赖」这类写死占位。

#### E4 · 架构图分层与依赖标签

预期：按 `layer` 分为「入口 / 应用 / 领域 / 基础设施」四列并显示层带；节点显示职责副标题；连线带 `提交预约`、`校验时段`、`写入预约` 等依赖标签。

#### E5 · 跨列连线不穿过节点

预期：`预约服务 → 数据库`、`预约服务 → 通知 Outbox` 这类跨列连线从中间模块**上方**绕过，不从「时段占用规则」方框后面穿过。

#### E6 · 自动分层（无 layer 时）

```powershell
$NoLayer = Join-Path $Work 'no-layer'
New-Item -ItemType Directory $NoLayer | Out-Null
node $CLI init --project $NoLayer --json | Out-Null
'{"expectedRevision":0,"requestId":"nl-1","stage":"drafting","summary":"无分层测试","architecture":{"modules":[{"id":"a","name":"入口模块"},{"id":"b","name":"服务模块"},{"id":"c","name":"数据模块"}],"dependencies":[{"from":"a","to":"b","label":"调用"},{"from":"b","to":"c","label":"读写"}]}}' | Set-Content (Join-Path $Work 'nl.json') -Encoding utf8
node $CLI design submit --project $NoLayer --input (Join-Path $Work 'nl.json') --json | Out-Null
$nlReport = (node $CLI report --project $NoLayer --json | ConvertFrom-Json).path
```

预期：三个模块按依赖关系自动分成三列，顺序为 入口模块 → 服务模块 → 数据模块。

#### E7 · 决策卡片字段完整

在报告的「架构决策」区检查。

预期：每条决策显示**选择、理由、备选方案、代价、重新评估**，并有状态徽章（`已采纳` / `提案中` 等）。不能只剩标题。

#### E8 · 未决问题按优先级分组

预期：未决问题分为「阻塞 / 重要 / 建议」三组并各自配色；`$Demo` 中应出现「阻塞 1 项」「重要 2 项」「建议 1 项」。

#### E9 · 评审记录含优先级与处置

预期：「评审记录」区显示每条评审的优先级徽章与处置结果（如 `已延期`、`建议`），并保留 `details` 说明。

#### E10 · 概览统计与页头不重复

预期：页头展示摘要首句；「概览」只展示剩余句子，不重复同一句话；统计卡片显示需求/决策/未决/阻塞四项数量。

#### E11 · 恶意内容转义

```powershell
$Xss = Join-Path $Work 'xss.json'
@'
{
  "expectedRevision": 0,
  "requestId": "xss-1",
  "stage": "drafting",
  "summary": "<script>alert(1)</script>",
  "decisions": [{ "id": "d1", "summary": "<img src=x onerror=alert(2)>", "status": "proposed" }],
  "architecture": { "links": [{ "label": "危险链接", "url": "javascript:alert(3)" }], "modules": [{ "name": "<svg onload=alert(4)>" }] }
}
'@ | Set-Content $Xss -Encoding utf8
$XssProject = Join-Path $Work 'xss-project'
New-Item -ItemType Directory $XssProject | Out-Null
node $CLI init --project $XssProject --json | Out-Null
node $CLI design submit --project $XssProject --input $Xss --json | Out-Null
$xssReport = (node $CLI report --project $XssProject --json | ConvertFrom-Json).path
$xhtml = Get-Content -Raw $xssReport
"执行脚本=$($xhtml -match '<script')"
"未转义img=$($xhtml -match '<img')"
"未转义事件=$($xhtml -match '<svg[^>]*onload')"
"危险协议=$($xhtml -match 'javascript:')"
```

预期：三项均为 `False`；文本以转义实体呈现。打开报告不弹任何对话框。

**注意两个容易踩的误报陷阱**（本项目实测确认过）：

1. 不要用 `-match 'onerror='` 当判据。转义后的文本是 `&lt;img src=x onerror=alert(2)&gt;`，字面量里确实含 `onerror=`，但它是**纯文本**而不是属性，不会执行。
2. 不要用 `-match '<svg'` 当判据。报告自己的架构图就是 `<svg class="arch">`，一定会命中。要用 `'<svg[^>]*onload'` 这种带恶意特征的精确匹配。

正确的旁证是：`$xhtml -match '&lt;svg onload=alert\(4\)&gt;'` 应为 `True`，说明内容确实被转义后按文本呈现。

#### E12 · 空项目报告不崩溃

```powershell
$Empty = Join-Path $Work 'report-empty'
New-Item -ItemType Directory $Empty | Out-Null
node $CLI init --project $Empty --json | Out-Null
node $CLI report --project $Empty --json
```

预期：正常生成报告，展示空状态提示（如「尚无设计摘要」「未提供模块信息」），不抛异常。

#### E13 · 窄屏布局

```powershell
# 浏览器打开报告后切换到 375px 宽（或设备模拟）
```

预期：架构图与表格各自横向滚动而不是被压扁；文字不溢出容器；不出现横向滚动整个页面。

#### E14 · 打印样式

```powershell
# 浏览器 Ctrl+P 预览
```

预期：目录导航隐藏；页头转为白底黑字；卡片不被分页截断。

#### E15 · Markdown 导出

```powershell
$md = (node $CLI export --project $Demo --format markdown --json | ConvertFrom-Json).path
Get-Content -Raw $md
```

预期：含源 revision 与警告元数据；决策段落含「理由：」；未决问题按「阻塞 / 重要 / 建议」分组。

#### E16 · 不支持的导出格式

```powershell
node $CLI export --project $Demo --format pdf --json
"exit=$LASTEXITCODE"
```

预期：`code: "INVALID_INPUT"`，提示支持 `markdown`；退出码 `2`；不修改任何快照。

---

## F. 修复与恢复

#### F1 · 健康项目无需修复

```powershell
node $CLI repair --project $Demo --dry-run --json
```

预期：`applied: false`、`actions: []`。

#### F2 · 孤立快照被报告且不被修改

```powershell
$orphan = Join-Path $Demo '.zhusi\revisions\000077.json'
'{"schemaVersion":1}' | Set-Content $orphan -Encoding utf8
$before = Get-Content -Raw $orphan
node $CLI repair --project $Demo --dry-run --json
"内容未变=$((Get-Content -Raw $orphan) -eq $before)"
```

预期：`actions` 包含 `000077.json`；`applied: false`；孤立文件内容不变。

#### F3 · `--apply` 保留原始文件

```powershell
node $CLI repair --project $Demo --apply --json
Get-ChildItem (Join-Path $Demo '.zhusi\revisions') -Filter '*.orphan'
```

预期：`applied: true`；生成 `.orphan` 副本；**原文件仍在**（修复不销毁数据）。

清理：

```powershell
Remove-Item (Join-Path $Demo '.zhusi\revisions\000077.json*') -Force
```

#### F4 · 陈旧锁被报告（不自动删除）

```powershell
$lock = Join-Path $Demo '.zhusi\lock\owner.json'
'{"pid":999999,"createdAt":"2000-01-01T00:00:00.000Z"}' | Set-Content $lock -Encoding utf8
node $CLI repair --project $Demo --dry-run --json
"锁仍存在=$(Test-Path $lock)"
Remove-Item $lock -Force
```

预期：`actions` 报告锁存在与时长；`apply` 不自动删除锁；dry-run 后锁文件仍在。

#### F5 · 坏指针可被校验发现

```powershell
$state = Join-Path $Demo '.zhusi\state.json'
Copy-Item $state "$state.bak"
(Get-Content -Raw $state).Replace('"currentRevision": 1', '"currentRevision": 999') | Set-Content $state -Encoding utf8
node $CLI validate --project $Demo --json
Move-Item -Force "$state.bak" $state
```

预期：`errors` 指出当前 revision 指针指向的快照缺失；退出码 `2`。

---

## G. 已有代码架构讲解

先准备一个真实 Git 代码项目：

```powershell
$Code = Join-Path $Work 'existing-app'
New-Item -ItemType Directory $Code | Out-Null
Set-Content (Join-Path $Code 'server.js') "import { route } from './router.js';`nroute('/health');`n" -Encoding utf8
Set-Content (Join-Path $Code 'router.js') "export const route = (p) => console.log('route', p);`n" -Encoding utf8
git -C $Code init -q
git -C $Code add -A
git -C $Code -c user.email=t@e.com -c user.name=t commit -q -m init
```

#### G1 · 讲解 Git 项目并记录 commit

```powershell
$Explain = Join-Path $Work 'explain.json'
@'
{
  "summary": "从 server.js 启动，调用 router.js 注册路由。",
  "walkthrough": [
    { "id": "w1", "summary": "server.js 导入 route 并注册 /health", "evidence": ["server.js:1", "server.js:2"] },
    { "id": "w2", "summary": "没有错误处理或测试" }
  ],
  "deepDive": [],
  "limitations": ["未读取运行时行为"]
}
'@ | Set-Content $Explain -Encoding utf8

node $CLI explain --project $Demo --existing $Code --input $Explain --json
```

预期：`revision` 递增；`sourceSnapshot.gitCommit` 是 40 位十六进制；`readScope` 只含 `server.js`、`router.js`，**不含 `.git`**。

#### G2 · 非 Git 目录使用目录指纹

```powershell
$Plain = Join-Path $Work 'plain-code'
New-Item -ItemType Directory $Plain | Out-Null
Set-Content (Join-Path $Plain 'index.js') 'console.log(1);' -Encoding utf8
@'{ "summary": "纯目录", "walkthrough": [], "deepDive": [], "limitations": [] }'@ | Set-Content $Explain -Encoding utf8
node $CLI explain --project $Demo --existing $Plain --input $Explain --json
```

预期：无 `gitCommit`，改为 64 位十六进制 `fingerprint`；`readScope` 含 `index.js`。

#### G3 · 不复制源码

```powershell
Get-ChildItem (Join-Path $Demo '.zhusi\architecture-explanations') | Select-Object Name, Length
```

预期：每个快照只有几 KB 的 JSON；`.zhusi/` 下**不存在**源码文件副本。

#### G4 · 排除 `.git` 与 `.zhusi`

```powershell
node $CLI explain --project $Demo --existing $Demo --input $Explain --json
```

预期：对 `$Demo` 自身做讲解时，`readScope` 不包含 `.git/` 与 `.zhusi/` 下的任何文件。

#### G5 · 缺失证据被标为推断/未知

```powershell
Get-Content -Raw (Join-Path $Demo '.zhusi\architecture-explanations\000001.json')
```

预期：带 `evidence` 的结论 `classification` 为 `inferred`；无 `evidence` 的为 `unknown`；不会出现"已确认事实"的措辞。

#### G6 · 陈旧检测

```powershell
node $CLI status --project $Demo --json      # 记录 stale.explanation
Set-Content (Join-Path $Code 'router.js') "export const route = (p) => console.log('ROUTE', p);`n" -Encoding utf8
git -C $Code add -A
git -C $Code -c user.email=t@e.com -c user.name=t commit -q -m change
node $CLI status --project $Demo --json      # stale.explanation 应为 true
node $CLI report --project $Demo --json
$h = Get-Content -Raw (Join-Path $Demo '.zhusi\reports\index.html')
"报告标注陈旧=$($h -match '陈旧')"
```

预期：源码 commit 变化后 `stale.explanation: true`；报告中该讲解标注「陈旧」。

#### G7 · 讲解不执行 shell、不改源码

```powershell
$beforeHash = (Get-FileHash (Join-Path $Code 'router.js')).Hash
node $CLI explain --project $Demo --existing $Code --input $Explain --json | Out-Null
"源码未变=$((Get-FileHash (Join-Path $Code 'router.js')).Hash -eq $beforeHash)"
git -C $Code status --short      # 应为空
```

预期：源码文件哈希不变；Git 工作区干净；未安装依赖、未执行项目脚本。

---

## H. Skill 注册（`install-skill`）

#### H1 · 为 Codex 安装

```powershell
$Reg = Join-Path $Work 'register'
New-Item -ItemType Directory $Reg | Out-Null
'# 我的项目' | Set-Content (Join-Path $Reg 'AGENTS.md') -Encoding utf8
node $CLI install-skill --host codex --project $Reg --json
```

预期：生成 `.agents/skills/zhusi/SKILL.md`；`AGENTS.md` 追加受管块；`actions` 状态为 `created`。

#### H2 · Skill 内容可被 agent 使用

```powershell
Get-Content -Raw (Join-Path $Reg '.agents\skills\zhusi\SKILL.md')
```

预期：包含 `design show`、`design submit`、`expectedRevision`、`requestId`、`stage: ready` 规则、退出码表，以及「不要做」清单。

#### H3 · 指令文件受管块与原有内容共存

```powershell
Get-Content -Raw (Join-Path $Reg 'AGENTS.md')
```

预期：原有 `# 我的项目` 完整保留；受管块以 `<!-- zhusi:start -->` 与 `<!-- zhusi:end -->` 界定。

#### H4 · 重复安装幂等

```powershell
node $CLI install-skill --host codex --project $Reg --json
```

预期：状态均为 `unchanged`；`AGENTS.md` 中受管块数量仍为 1（用 `Select-String -Pattern 'zhusi:start'` 计数）。

#### H5 · 本地修改后默认跳过

```powershell
$skill = Join-Path $Reg '.agents\skills\zhusi\SKILL.md'
'本地修改' | Set-Content $skill -Encoding utf8
node $CLI install-skill --host codex --project $Reg --json
Get-Content -Raw $skill      # 应仍为「本地修改」
```

预期：状态为 `skipped`；本地内容未被覆盖；退出码 `0`（跳过不是错误）。

#### H6 · `--force` 覆盖

```powershell
node $CLI install-skill --host codex --project $Reg --force --json
Get-Content -Raw $skill | Select-Object -First 1
```

预期：状态为 `updated`；内容恢复为随包发布的 Skill。

#### H7 · 多宿主安装

```powershell
node $CLI install-skill --host all --project $Reg
Get-ChildItem $Reg -Recurse -File | ForEach-Object { $_.FullName.Replace($Reg, '.') }
```

预期：出现 `.agents/skills/zhusi/SKILL.md`、`AGENTS.md`、`.claude/skills/zhusi/SKILL.md`、`CLAUDE.md`、`.cursor/rules/zhusi.mdc`。

#### H8 · 未知宿主

```powershell
node $CLI install-skill --host vscode --project $Reg --json
"exit=$LASTEXITCODE"
```

预期：`code: "INVALID_INPUT"`，列出 `codex、claude、cursor、all`；退出码 `2`。

#### H9 · dry-run 不写文件

```powershell
$Dry = Join-Path $Work 'dry-register'
New-Item -ItemType Directory $Dry | Out-Null
node $CLI install-skill --host all --project $Dry --dry-run --json
"文件数=$((Get-ChildItem $Dry -Recurse -File).Count)"
```

预期：`dryRun: true`；文件数为 0。

#### H10 · 用户级安装

```powershell
$FakeHome = Join-Path $Work 'fake-home'
New-Item -ItemType Directory $FakeHome | Out-Null
$env:HOME = $FakeHome; $env:USERPROFILE = $FakeHome
node $CLI install-skill --host codex --user --json
Test-Path (Join-Path $FakeHome '.codex\skills\zhusi\SKILL.md')
```

预期：`True`；项目目录未被修改。测试后恢复原 `$env:HOME` / `$env:USERPROFILE`。

---

## I. MCP 服务器

MCP 需要客户端才能交互。准备一个探针脚本（**必须放在仓库根目录**，否则解析不到 SDK 依赖）：

```powershell
Set-Location 'C:\Users\tian\Documents\Projects\zhusi'
@'
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const [, , cli, project, tool, argsJson] = process.argv;
const transport = new StdioClientTransport({ command: process.execPath, args: [cli, 'mcp', '--project', project] });
const client = new Client({ name: 'manual-probe', version: '1.0.0' });
await client.connect(transport);
if (!tool) {
  const { tools } = await client.listTools();
  for (const t of tools) console.log(`${t.name}\t${t.title ?? ''}`);
} else {
  const result = await client.callTool({ name: tool, arguments: argsJson ? JSON.parse(argsJson) : {} });
  console.log(JSON.stringify(result, null, 2));
}
await client.close();
'@ | Set-Content '.\local-mcp-probe.mjs' -Encoding utf8
```

#### I1 · 握手并列出工具

```powershell
node .\local-mcp-probe.mjs $CLI $Demo
```

预期：列出六个工具——`zhusi_status`、`zhusi_read_design`、`zhusi_submit_design`、`zhusi_validate`、`zhusi_render_report`、`zhusi_save_explanation`；退出码 `0`。

#### I2 · `zhusi_read_design`

```powershell
node .\local-mcp-probe.mjs $CLI $Demo zhusi_read_design
```

预期：`content[0].text` 是 JSON，含 `expectedRevision` 与完整 `revision`。

#### I3 · `zhusi_status`

```powershell
node .\local-mcp-probe.mjs $CLI $Demo zhusi_status
```

预期：返回 `revision`、`stage`、`unresolvedQuestions`、`stale`、`warnings`。

#### I4 · `zhusi_validate`

```powershell
node .\local-mcp-probe.mjs $CLI $Demo zhusi_validate
```

预期：`ok: true`、`errors: []`。

#### I5 · `zhusi_render_report`

```powershell
node .\local-mcp-probe.mjs $CLI $Demo zhusi_render_report
```

预期：返回 `path` 指向 `index.html`。

#### I6 · `zhusi_submit_design` 正常提交

```powershell
$McpProject = Join-Path $Work 'mcp-project'
New-Item -ItemType Directory $McpProject | Out-Null
node $CLI init --project $McpProject --json | Out-Null
node .\local-mcp-probe.mjs $CLI $McpProject zhusi_submit_design '{"expectedRevision":0,"requestId":"mcp-001","stage":"drafting","summary":"通过 MCP 提交"}'
```

预期：`ok: true`、`created: true`、`revision: 1`。

#### I7 · 幂等重试

重复执行 I6 的同一条命令。

预期：`created: false`、`revision` 仍为 1。

#### I8 · 冲突返回结构化错误且会话不中断

```powershell
node .\local-mcp-probe.mjs $CLI $McpProject zhusi_submit_design '{"expectedRevision":0,"requestId":"mcp-002"}'
```

预期：`isError: true`；文本 JSON 含 `code: "REVISION_CONFLICT"` 与 `latestRevision: 1`；进程正常退出（不崩溃）。随后再跑 I4 应仍成功。

#### I9 · ready 闸门

```powershell
node .\local-mcp-probe.mjs $CLI $McpProject zhusi_submit_design '{"expectedRevision":1,"requestId":"mcp-003","stage":"ready","questions":[{"id":"q1","summary":"是否支持取消","priority":"blocker","status":"open"}]}'
```

预期：`isError: true`；`code: "STAGE_NOT_READY"`。

#### I10 · 非法参数不崩溃

```powershell
node .\local-mcp-probe.mjs $CLI $McpProject zhusi_submit_design '{"expectedRevision":-1}'
```

预期：`isError: true`，错误说明参数不合法；进程正常退出。

#### I11 · `zhusi_save_explanation`

```powershell
node .\local-mcp-probe.mjs $CLI $Demo zhusi_save_explanation ('{"existing":"' + ($Code -replace '\\','\\\\') + '","summary":"MCP 保存的讲解","walkthrough":[{"id":"w1","summary":"调用 route","evidence":["server.js:1"]}]}')
```

预期：`ok: true`、`revision` 递增，`sourceSnapshot` 含 `gitCommit` 或 `fingerprint`。

#### I12 · 未初始化目录拒绝启动

```powershell
$Bad = Join-Path $Work 'mcp-bad'
New-Item -ItemType Directory $Bad | Out-Null
$out = node $CLI mcp --project $Bad 2>$null
"stdout=[$out] exit=$LASTEXITCODE"
```

预期：stdout 为空；退出码 `2`；stderr 提示「尚未初始化」并给出 `zhusi init` 命令。

#### I13 · stdout 只承载协议（无日志污染）

```powershell
node .\local-mcp-probe.mjs $CLI $Demo zhusi_status
```

预期：探针全程无解析错误；把 stderr 重定向到文件后检查，绑定提示只出现在 stderr：

```powershell
node .\local-mcp-probe.mjs $CLI $Demo zhusi_status 2>$null
```

若 stdout 混入任何非协议文本，握手会直接失败——这是本用例的核心判定。

#### I14 · 多客户端并发

```powershell
1..3 | ForEach-Object -Parallel { node "$using:PWD\local-mcp-probe.mjs" $using:CLI $using:Demo zhusi_read_design } -ThrottleLimit 3
```

（PowerShell 7 支持 `-Parallel`；Windows PowerShell 5.1 请开三个终端手动执行。）

预期：三个只读调用都成功；不产生锁冲突。

清理：

```powershell
Remove-Item '.\local-mcp-probe.mjs' -Force
```

---

## J. 并发与恢复

#### J1 · 两个写入者竞争同一 revision

```powershell
$Conc = Join-Path $Work 'concurrency'
New-Item -ItemType Directory $Conc | Out-Null
node $CLI init --project $Conc --json | Out-Null
$a = Join-Path $Work 'a.json'; $b = Join-Path $Work 'b.json'
'{"expectedRevision":0,"requestId":"race-a","stage":"drafting","summary":"A"}' | Set-Content $a -Encoding utf8
'{"expectedRevision":0,"requestId":"race-b","stage":"drafting","summary":"B"}' | Set-Content $b -Encoding utf8
$jobs = @(
  Start-Job { node $using:CLI design submit --project $using:Conc --input $using:a --json }
  Start-Job { node $using:CLI design submit --project $using:Conc --input $using:b --json }
)
$jobs | Wait-Job | Receive-Job
$jobs | Remove-Job
node $CLI validate --project $Conc --json
```

预期：恰好一个成功（`revision: 1`），另一个返回 `REVISION_CONFLICT` 退出码 3；`validate` 无错误；`currentRevision` 为 1。

#### J2 · 项目被锁时返回 PROJECT_BUSY

```powershell
$lock = Join-Path $Conc '.zhusi\lock\owner.json'
'{"pid":999999,"createdAt":"2000-01-01T00:00:00.000Z"}' | Set-Content $lock -Encoding utf8
node $CLI design submit --project $Conc --input $a --json
"exit=$LASTEXITCODE"
Remove-Item $lock -Force
```

预期：`code: "PROJECT_BUSY"`、`retryable: true`；退出码 `3`；已有数据未被破坏。

#### J3 · 崩溃后不破坏已有快照

```powershell
$Rev = Join-Path $Conc '.zhusi\revisions\000001.json'
$before = (Get-FileHash $Rev).Hash
'{"schemaVersion":1}' | Set-Content (Join-Path $Conc '.zhusi\revisions\000002.json.tmp') -Encoding utf8
node $CLI validate --project $Conc --json
"既有快照未变=$((Get-FileHash $Rev).Hash -eq $before)"
```

预期：残留的 `.tmp` 不影响当前 revision 的读取；`validate` 可报告异常但不修改既有快照。

---

## K. 安全边界

#### K1 · 工作空间路径穿越被拒绝

```powershell
# 直接在项目外放置一个同名快照，确认读取不会越过 .zhusi
Set-Content (Join-Path $Work 'outside.json') '{"schemaVersion":1}' -Encoding utf8
node $CLI validate --project $Demo --json
```

预期：`validate` 只检查 `.zhusi/` 内部；外部同名文件不被读取；`status`/`report` 也不受影响。

#### K2 · 符号链接不越过项目边界

Windows（需开发者模式或管理员权限创建符号链接）：

```powershell
$Outside = Join-Path $Work 'outside-code'
New-Item -ItemType Directory $Outside | Out-Null
Set-Content (Join-Path $Outside 'secret.js') 'export const secret = 1;' -Encoding utf8
$LinkHost = Join-Path $Work 'link-host'
New-Item -ItemType Directory $LinkHost | Out-Null
Set-Content (Join-Path $LinkHost 'inside.js') 'export const x = 1;' -Encoding utf8
New-Item -ItemType SymbolicLink -Path (Join-Path $LinkHost 'nested-link') -Target $Outside -ErrorAction SilentlyContinue
@'{ "summary": "符号链接测试", "walkthrough": [], "deepDive": [], "limitations": [] }'@ | Set-Content $Explain -Encoding utf8
node $CLI explain --project $Demo --existing $LinkHost --input $Explain --json
Get-Content -Raw (Join-Path $Demo '.zhusi\architecture-explanations\000001.json') | Select-String 'secret'
```

预期：`readScope` 只含 `inside.js`，**不含** `secret.js`；符号链接被跳过。无法创建符号链接时记为「跳过」并说明原因。

#### K3 · 快照大小上限

```powershell
$Big = Join-Path $Work 'big.json'
$huge = 'x' * 6000000
'{"expectedRevision":0,"requestId":"big-1","stage":"drafting","summary":"' + $huge + '"}' | Set-Content $Big -Encoding utf8
node $CLI design submit --project $McpProject --input $Big --json
"exit=$LASTEXITCODE"
```

预期：`code: "INVALID_INPUT"`，提示超过 5 MiB 上限；退出码 `2`；**不静默截断**。

#### K4 · 数组数量攻击

```powershell
$arr = (1..10001 | ForEach-Object { '{"id":"x"}' }) -join ','
'{"expectedRevision":1,"requestId":"flood","stage":"drafting","requirements":[' + $arr + ']}' | Set-Content $Big -Encoding utf8
node $CLI design submit --project $McpProject --input $Big --json
"exit=$LASTEXITCODE"
```

预期：被 schema 的数组上限拒绝；退出码 `2`；不写入。

#### K5 · 报告无可执行内容

```powershell
$h = Get-Content -Raw (Join-Path $Demo '.zhusi\reports\index.html')
"script=$($h -match '<script')"
"未转义img=$($h -match '<img')"
"未转义事件=$($h -match '<svg[^>]*onload')"
"iframe=$($h -match '<iframe')"
"外部资源=$($h -match 'src="http|href="http')"
```

预期：均为 `False`。判据必须精确到恶意特征：`onerror=` 可能只是转义后的文本，而 `<svg` 是报告架构图本身；两者都不能直接当注入判据（详见 E11 的说明）。

#### K6 · 包内不含用户数据与密钥

```powershell
npm pack
$tgz = (Get-ChildItem 'zhusi-*.tgz' | Select-Object -First 1).FullName
tar -tzf $tgz | Select-String -Pattern '\.zhusi|\.env|\.pem|\.key|node_modules'
"exit=$LASTEXITCODE"
```

预期：无任何匹配（打包清单不含用户工作空间、环境文件、私钥）。清理：`Remove-Item zhusi-*.tgz`。

#### K7 · 不执行外部命令

```powershell
# 放一个会在被 shell 执行时留下痕迹的脚本
Set-Content (Join-Path $Code 'evil.sh') 'echo PWNED > pwned.txt' -Encoding utf8
node $CLI explain --project $Demo --existing $Code --input $Explain --json | Out-Null
"未产生痕迹=$(-not (Test-Path (Join-Path $Code 'pwned.txt')))"
```

预期：`True`。`explain` 只读取文件与 Git 元数据，不执行任何脚本。

---

## L. 跨平台

#### L1 · Windows PowerShell

在本方案全程使用的 shell 中执行 A–K 的主要用例，记录任何路径分隔符、编码或换行差异。

预期：与文档一致；中文输出不乱码。

#### L2 · Windows cmd

```cmd
cd /d C:\Users\tian\Documents\Projects\zhusi
node dist\cli\index.js --help
node dist\cli\index.js init --project "%TEMP%\zhusi-cmd" --json
```

预期：cmd 下同样可用；路径用反斜杠、引号包裹时不截断。

#### L3 · macOS / Linux

```sh
cd /path/to/zhusi && npm ci && npm run build
CLI="$PWD/dist/cli/index.js"
D="$(mktemp -d)"
node "$CLI" init --project "$D" --json
node "$CLI" status --project "$D" --json
node "$CLI" report --project "$D" --json
```

预期：行为与 Windows 等价；无平台专属命令依赖。

#### L4 · CRLF 与 LF 等价

```powershell
$lf = Join-Path $Work 'lf.json'
$crlf = Join-Path $Work 'crlf.json'
'{"expectedRevision":0,"requestId":"eol-1","stage":"drafting","summary":"行尾测试"}' | Set-Content $lf -Encoding utf8 -NoNewline
(Get-Content -Raw $lf).Replace("`n", "`r`n") | Set-Content $crlf -Encoding utf8 -NoNewline
$Eol1 = Join-Path $Work 'eol-1'; $Eol2 = Join-Path $Work 'eol-2'
node $CLI init --project $Eol1 --json | Out-Null
node $CLI init --project $Eol2 --json | Out-Null
node $CLI design submit --project $Eol1 --input $lf --json | Out-Null
node $CLI design submit --project $Eol2 --input $crlf --json | Out-Null
node $CLI validate --project $Eol1 --json
node $CLI validate --project $Eol2 --json
```

预期：两种行尾都能解析，`validate` 均无错误。

#### L5 · POSIX 权限错误给出明确诊断

仅 macOS / Linux：

```sh
chmod 000 "$D/.zhusi/state.json"
node "$CLI" validate --project "$D" --json; echo "exit=$?"
chmod 644 "$D/.zhusi/state.json"
```

预期：退出码非 0，错误指出该文件不可读；不把它当作数据损坏。

#### L6 · Node 版本矩阵

至少覆盖 Node 20.x 与 22.x：

```powershell
node --version
npm test
```

预期：两个大版本上 `npm test` 全部通过（CI 矩阵见 `.github/workflows/ci.yml`）。

---

## M. 非功能

#### M1 · 自动化回归基线

```powershell
npm run typecheck
npm test
npm run smoke
npm pack --dry-run
```

预期：类型检查通过；测试全部通过（允许平台相关的跳过项）；冒烟 8/8 通过；打包清单符合 A4。

#### M2 · 命令响应时间

```powershell
Measure-Command { node $CLI status --project $Demo --json } | Select-Object TotalSeconds
Measure-Command { node $CLI report --project $Demo --json } | Select-Object TotalSeconds
```

预期：`status` 通常 < 1s；`report` 在演示数据规模下 < 2s。记录实测值作为基线。

#### M3 · 报告体积

```powershell
(Get-Item (Join-Path $Demo '.zhusi\reports\index.html')).Length
```

预期：演示数据下为几十 KB 量级（内联 CSS/SVG，无外部资源）。

#### M4 · 帮助可读性

```powershell
node $CLI --help
node $CLI design --help
node $CLI design submit --help
node $CLI install-skill --help
```

预期：每个命令的帮助都列出参数与默认值，中文描述可读，无未翻译的占位文本。

#### M5 · 大项目指纹上限

对超过 20,000 个文件的目录执行 `explain`。

预期：明确报错说明超过文件数上限，而不是静默产生不完整指纹或长时间卡死。

---

## 附录 A · 缺陷记录模板

```
缺陷编号：
标题：
严重级别：阻塞 / 严重 / 一般 / 轻微
用例编号：（如 D7）
环境：OS 版本 / Node 版本 / npm 版本 / 是否全局安装
复现步骤：（完整命令，含参数与工作目录）
实际结果：（完整 stdout / stderr / 退出码，必要时附截图或报告 HTML）
期望结果：
可复现性：必现 / 偶现（_/_ 次）
附加信息：（.zhusi 目录结构、相关快照、是否并发、是否跨平台）
```

## 附录 B · 快速回归清单

时间有限时按此顺序执行，覆盖最高风险路径：

```powershell
npm test && npm run smoke
node $CLI init --project $Project --json
node $CLI design template --project $Project --out $Draft --json
node $CLI design submit --project $Project --input $Payload --json
node $CLI design show --project $Project --json
node $CLI report --project $Project --json
node $CLI validate --project $Project --json
node $CLI install-skill --host codex --project $Project --json
```

外加上方案中的 **D6（幂等）**、**D7（冲突）**、**D11（阶段闸门）**、**E11（转义）**、**I12（MCP 启动校验）** 五条，可在 10 分钟内覆盖最易回归的行为。

## 附录 C · 完成标准

一次完整验收通过需满足：

1. A–J 全部用例通过或按平台合理跳过，且跳过项已注明原因。
2. K 中所有安全用例通过；任何一项失败按「严重」缺陷处理。
3. L 至少覆盖 Windows 与一个类 Unix 环境；CRLF/LF 用例通过。
4. M1 的自动化命令全部通过。
5. 所有失败项已按附录 A 记录，并能用完整命令复现。
6. 报告中不出现脚本执行、网络请求或未转义的用户内容。
