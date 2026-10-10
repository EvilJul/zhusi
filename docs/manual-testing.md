# 手工测试

前置：Node.js >= 20.11，仓库根目录已执行 `npm install`。命令为 PowerShell；macOS/Linux 把 `$env:TEMP` 换成 `$(mktemp -d)`。

## 0. 构建并让 `zhusi` 可直接使用

```powershell
Set-Location 'C:\Users\tian\Documents\Projects\zhusi'
npm run build
npm link                      # 全局注册 zhusi 命令
zhusi --version               # 0.1.0
```

`npm link` 建立的是指向本仓库的 Junction，之后改代码只需重新 `npm run build`，不必重复 link。
移除：`npm unlink -g zhusi`。

## 1. 基础命令

`zhusi` 默认对当前目录生效，所以先切到测试目录。

```powershell
$Demo = Join-Path $env:TEMP ("zhusi-manual-" + (Get-Random))
New-Item -ItemType Directory $Demo | Out-Null
Set-Location $Demo

zhusi --help                  # 退出 0，命令列表写入 stdout
zhusi init                    # 项目空间已初始化。
zhusi init                    # 项目已初始化，现有数据保持不变。
zhusi status                  # 阶段 idea · revision 0
zhusi status --json           # 结构化字段：stale / warnings
zhusi validate                # 项目数据有效。
zhusi export --format markdown
zhusi export --format pdf     # 退出 2
zhusi frobnicate              # stderr 提示，退出 1
```

## 2. 写入设计内容与报告

最快看到完整报告：写入一份演示数据。

```powershell
node 'C:\Users\tian\Documents\Projects\zhusi\scripts\seed-demo.mjs' $Demo
zhusi report --project $Demo            # 打开返回的 index.html
```

真实写入通道是「读取 → 修改 → 提交」：

```powershell
$Design = Join-Path $Demo 'design.json'
zhusi design template --project $Demo --out $Design   # 生成可填写的骨架
zhusi design show --project $Demo --json              # 查看 expectedRevision
# 编辑 $Design：填写 summary / requirements / decisions / questions / reviews / architecture
zhusi design submit --project $Demo --input $Design --dry-run   # 只校验
zhusi design submit --project $Demo --input $Design             # 正式提交
zhusi design submit --project $Demo --input $Design --json      # created: false，幂等
zhusi report --project $Demo
```

重点核对：

- `design show --json` 返回完整 revision 与 `expectedRevision`；提交后该值加 1。
- 同一个 `requestId` 重复提交返回 `created: false` 且 revision 不增加；用过期 `expectedRevision` 提交返回退出码 3 与 `latestRevision`。
- `stage` 为 `ready` 但仍有未解决的 `blocker` 问题时报退出码 4，且不写入。
- `--input -` 可从 stdin 读取，便于管道调用；`--dry-run` 不产生新 revision。

- 架构图按 `architecture.modules` 的 `layer` 分列（入口 / 应用 / 领域 / 基础设施），节点显示职责，连线带依赖标签；跨列连线从中间模块上方绕过，而不是从方框后面穿过或画成写死的三个框。
- 没有 `layer` 时按依赖关系自动分层。
- 决策卡片保留理由、备选方案、代价与重新评估条件，而不是只有标题。
- 未决问题按 阻塞 / 重要 / 建议 分组并配色；评审记录显示优先级与处置结果。
- 页头与概览不重复同一句话；断网可打开且页面无 `<script>`；窄屏下架构图与表格各自横向滚动，不被压扁。

## 3. 已有代码讲解与陈旧检测

```powershell
# 建一个小 git 项目
$Code = Join-Path $Demo 'app'
New-Item -ItemType Directory $Code | Out-Null
Set-Content (Join-Path $Code 'server.js') "import { route } from './router.js';`nroute('/health');" -Encoding utf8
Set-Content (Join-Path $Code 'router.js') "export const route = (p) => console.log(p);" -Encoding utf8
git -C $Code init -q; git -C $Code add -A
git -C $Code -c user.email=t@e.com -c user.name=t commit -q -m init

# 讲解输入
$Input = Join-Path $Demo 'explain.json'
'{ "summary": "入口 server.js", "walkthrough": [ { "id": "w1", "summary": "注册 /health", "evidence": ["server.js:1"] } ] }' | Set-Content $Input -Encoding utf8

zhusi explain --existing $Code --input $Input --json
zhusi status --json           # stale.explanation: false

# 改代码再提交，应变成陈旧
Set-Content (Join-Path $Code 'router.js') "export const route = (p) => console.log('X', p);" -Encoding utf8
git -C $Code add -A; git -C $Code -c user.email=t@e.com -c user.name=t commit -q -m change
zhusi status --json           # stale.explanation: true
```

`explain` 返回的 `sourceSnapshot.gitCommit` 应为 40 位 commit，`readScope` 不含 `.git`，也不复制源码。无 `evidence` 的结论会被标为 `unknown`。

## 4. 错误与安全边界

```powershell
# 损坏 state.json：validate 退出 2，且不覆盖文件
$state = Join-Path $Demo '.zhusi\state.json'
Copy-Item $state "$state.bak"
'not-json' | Set-Content $state -Encoding utf8
zhusi validate --json
Move-Item -Force "$state.bak" $state

# 孤立快照：repair 只报告，不修改
'{ "schemaVersion": 1 }' | Set-Content (Join-Path $Demo '.zhusi\revisions\000009.json') -Encoding utf8
zhusi repair --dry-run --json

# mcp：stdout 必须为空，诊断走 stderr
zhusi mcp
```

## 5. 打包安装（不依赖 npm link）

验证真实发布形态：打包后在独立项目里安装，`zhusi` 来自 tarball 而不是本仓库。

```powershell
Set-Location 'C:\Users\tian\Documents\Projects\zhusi'
npm pack
$Consumer = Join-Path $env:TEMP ("zhusi-consumer-" + (Get-Random))
New-Item -ItemType Directory $Consumer | Out-Null
Set-Content (Join-Path $Consumer 'package.json') '{ "name": "c", "private": true, "version": "1.0.0" }'
Set-Location $Consumer
npm install --no-audit --no-fund (Get-ChildItem 'C:\Users\tian\Documents\Projects\zhusi\zhusi-*.tgz').FullName

npx --no-install zhusi init
npx --no-install zhusi status --json
```

## 6. 注册给 AI 客户端

```powershell
$Reg = Join-Path $env:TEMP ("zhusi-register-" + (Get-Random))
New-Item -ItemType Directory $Reg | Out-Null
'# 我的项目' | Set-Content (Join-Path $Reg 'AGENTS.md') -Encoding utf8

zhusi install-skill --host codex --project $Reg --dry-run    # 只预览
zhusi install-skill --host codex --project $Reg              # 正式写入
zhusi install-skill --host codex --project $Reg              # 第二次应全部"未变"
zhusi install-skill --host vscode --project $Reg --json      # 退出码 2，列出可用宿主
zhusi install-skill --host all --project $Reg                # codex / claude / cursor
```

重点核对：

- 生成 `.agents/skills/zhusi/SKILL.md`，内容包含读取→修改→提交回路与提交规则。
- `AGENTS.md` 原有内容完整保留，只在末尾追加 `<!-- zhusi:start -->` … `<!-- zhusi:end -->` 受管块；第二次执行不产生第二份。
- 手工改一下 Skill 文件再执行，应报"跳过"且不覆盖；加 `--force` 才恢复。
- `--dry-run` 之后目录里不应出现新文件。
- `--user` 装到用户配置目录（可用 `HOME` / `USERPROFILE` 环境变量指向临时目录验证），项目目录不受影响。

## 7. MCP 服务器

```powershell
# 未初始化目录应拒绝启动
$Bad = Join-Path $env:TEMP ("zhusi-bad-" + (Get-Random))
New-Item -ItemType Directory $Bad | Out-Null
zhusi mcp --project $Bad
# 预期：stderr 提示"尚未初始化"，退出码 2，stdout 无任何输出

# 正常项目：会绑定并等待客户端；stderr 显示绑定信息，stdout 保持协议专用
zhusi mcp --project $Demo
# Ctrl+C 退出。注意过程中 stdout 不应出现任何日志文本。
```

重点核对：

- stdout 只承载 MCP 协议帧：任何日志文本混进去都会让客户端解析失败。
- 服务器启动时绑定一个项目根，工具不接受项目路径参数。
- 工具失败返回结构化错误（含 `code`、`latestRevision`），进程继续存活，会话不中断。

真实握手由自动化测试覆盖（`tests/mcp.test.mjs` 里有进程级 stdio 初始化 + list-tools）。想在真实客户端验证，把上面的 `mcpServers` 配置加进客户端并重启，查看是否出现 `zhusi_*` 工具。

## 关键预期

- 退出码：`0` 成功，`1` 运行错误，`2` 输入/schema 无效，`3` 冲突或忙，`4` 阶段未满足。
- `--json` 只改变 stdout 的格式，不生成文件；真正落盘的是 `.zhusi/` 下的快照、`reports/index.html` 等。
- 重复 `init` 绝不覆盖已有数据；`repair` 默认只读。
- 源码 commit 或指纹变化后，讲解在 `status` 与 `report` 中标记陈旧。

自动化等价覆盖：`npm test`（单元 + 进程级）与 `npm run smoke`（打包安装后运行核心命令）。
