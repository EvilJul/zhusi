import type { DesignRevision, Explanation, WorkspaceState } from '../domain/schema.js';
import { renderArchitectureDiagram } from './diagram.js';
import { clipText, escapeHtml, safeUrl } from './escape.js';

const esc = escapeHtml;

// 决策/问题/评审项允许携带固定字段之外的扩展字段，这里按报告需要放宽读取。
interface DetailItem {
  id?: string;
  summary?: string;
  status?: string;
  priority?: string;
  details?: string;
  evidence?: string[];
  classification?: string;
  confidence?: number;
  choice?: string;
  rationale?: string;
  alternatives?: string[];
  tradeoffs?: string[];
  revisitWhen?: string[];
}

interface ArchitectureShape {
  modules?: Array<{ id?: string; name?: string; responsibility?: string; layer?: string }>;
  dependencies?: Array<{ from?: string; to?: string; label?: string }>;
  links?: Array<{ label?: string; url?: string }>;
  notes?: string;
}

const DECISION_TONE: Record<string, string> = { accepted: 'ok', proposed: 'warn', rejected: 'bad', deferred: 'muted' };
const DECISION_LABEL: Record<string, string> = { accepted: '已采纳', proposed: '提案中', rejected: '已拒绝', deferred: '已延期' };
const PRIORITY_TONE: Record<string, string> = { blocker: 'bad', important: 'warn', suggestion: 'muted' };
const PRIORITY_LABEL: Record<string, string> = { blocker: '阻塞', important: '重要', suggestion: '建议' };
const CLASSIFICATION_LABEL: Record<string, string> = { fact: '代码事实', inferred: '推断', unknown: '未知', intent: '设计意图' };

const badge = (text: string, tone: string) => `<span class="badge ${tone}">${esc(text)}</span>`;
const bullets = (values: string[] | undefined) => values?.length
  ? `<ul class="plain">${values.map((value) => `<li>${esc(value)}</li>`).join('')}</ul>`
  : '';
const field = (label: string, body: string) => body ? `<div><dt>${esc(label)}</dt><dd>${body}</dd></div>` : '';
const emptyNote = (text: string) => `<p class="empty">${esc(text)}</p>`;
const detail = (summary: string, body: string) => `<details open><summary>${esc(summary)}</summary>${body}</details>`;

function shortTitle(summary: string): string {
  const firstLine = summary.split(/[。\n!?！？]/)[0]?.trim() ?? '';
  return clipText(firstLine || '未命名设计', 120);
}

function itemList(items: DetailItem[]): string {
  if (items.length === 0) return emptyNote('暂无内容');
  return `<ul class="plain">${items.map((item) => {
    const tone = item.priority ? PRIORITY_TONE[item.priority] : item.status ? DECISION_TONE[item.status] : undefined;
    const label = item.priority ? PRIORITY_LABEL[item.priority] : item.status ? DECISION_LABEL[item.status] : undefined;
    const tag = tone && label ? ` ${badge(label, tone)}` : '';
    const evidence = item.evidence?.length ? `<div class="tags">${item.evidence.map((ref) => `<span class="tag">${esc(ref)}</span>`).join('')}</div>` : '';
    return `<li><span>${esc(item.summary)}</span>${tag}${item.details ? `<p class="muted">${esc(item.details)}</p>` : ''}${evidence}</li>`;
  }).join('')}</ul>`;
}

function decisionCards(items: DetailItem[]): string {
  if (items.length === 0) return emptyNote('暂无架构决策。重要决策应包含原因、备选方案、代价和重新评估条件。');
  return items.map((item) => {
    const status = item.status ?? 'proposed';
    const rows = [
      field('选择', item.choice ? esc(item.choice) : ''),
      field('理由', item.rationale ? esc(item.rationale) : ''),
      field('备选方案', bullets(item.alternatives)),
      field('代价', bullets(item.tradeoffs)),
      field('重新评估', bullets(item.revisitWhen)),
    ].join('');
    return `<article class="card"><header><h3>${esc(item.summary)}</h3>${badge(DECISION_LABEL[status] ?? status, DECISION_TONE[status] ?? 'muted')}</header>`
      + (rows ? `<dl>${rows}</dl>` : '') + '</article>';
  }).join('');
}

function questionGroups(items: DetailItem[]): string {
  if (items.length === 0) return emptyNote('暂无未决问题。');
  const groups: Array<{ key: string; label: string; tone: string; rows: DetailItem[] }> = [
    { key: 'blocker', label: PRIORITY_LABEL.blocker!, tone: PRIORITY_TONE.blocker!, rows: items.filter((item) => item.priority === 'blocker') },
    { key: 'important', label: PRIORITY_LABEL.important!, tone: PRIORITY_TONE.important!, rows: items.filter((item) => item.priority === 'important') },
    { key: 'suggestion', label: PRIORITY_LABEL.suggestion!, tone: PRIORITY_TONE.suggestion!, rows: items.filter((item) => item.priority === 'suggestion') },
    { key: 'untagged', label: '未标优先级', tone: 'muted', rows: items.filter((item) => !item.priority) },
  ];
  return groups.filter((group) => group.rows.length > 0).map((group) => (
    `<div class="qgroup"><h3>${esc(group.label)}</h3>${badge(`${group.rows.length} 项`, group.tone)}</div>${itemList(group.rows)}`
  )).join('');
}

interface ReviewShape extends DetailItem {
  opinions?: Array<{ author?: string; text?: string; at?: string }>;
  disposition?: { decision?: string; reason?: string; by?: string; at?: string; revision?: number };
}

interface FlowShape { id?: string; name?: string; trigger?: string; steps?: Array<{ actor?: string; action?: string; result?: string }>; exceptions?: string[] }
interface StepShape { id?: string; name?: string; summary?: string; dependsOn?: string[]; deliverables?: string[]; status?: string }

const STEP_LABEL: Record<string, string> = { planned: '计划中', 'in-progress': '进行中', done: '已完成' };
const STEP_TONE: Record<string, string> = { planned: 'muted', 'in-progress': 'warn', done: 'ok' };

function reviewDecision(item: ReviewShape): string | undefined {
  return item.disposition?.decision ?? (item.status && DECISION_LABEL[item.status] && item.status !== 'proposed' ? item.status : undefined);
}

/** 评审按“问题→意见→处置”折叠展示；未处置的评审默认展开，已处置的默认收起。 */
function reviewThreads(items: ReviewShape[]): string {
  if (items.length === 0) return emptyNote('暂无评审记录。');
  return items.map((item) => {
    const decision = reviewDecision(item);
    const priority = item.priority ? badge(PRIORITY_LABEL[item.priority] ?? item.priority, PRIORITY_TONE[item.priority] ?? 'muted') : '';
    const state = decision ? badge(DECISION_LABEL[decision] ?? decision, DECISION_TONE[decision] ?? 'muted') : badge('待处置', 'warn');
    const opinions = item.opinions?.length
      ? `<ol class="plain">${item.opinions.map((opinion) => `<li>${opinion.author ? `<b>${esc(opinion.author)}</b>：` : ''}${esc(opinion.text)}</li>`).join('')}</ol>`
      : emptyNote('尚无讨论意见。');
    const reason = item.disposition?.reason ?? (decision ? item.details : undefined);
    const disposition = decision
      ? `<p>${badge(DECISION_LABEL[decision] ?? decision, DECISION_TONE[decision] ?? 'muted')}${reason ? ` ${esc(reason)}` : ''}${item.disposition?.by ? `<span class="muted"> · ${esc(item.disposition.by)}</span>` : ''}${item.disposition?.revision ? `<span class="muted"> · revision ${item.disposition.revision}</span>` : ''}</p>`
      : emptyNote('尚未处置。');
    const issueDetail = item.details && !(decision && !item.disposition?.reason) ? `<p class="muted">${esc(item.details)}</p>` : '';
    return `<details class="thread"${decision ? '' : ' open'}><summary>${esc(item.summary)} ${priority} ${state}</summary>`
      + `<dl><div><dt>问题</dt><dd>${esc(item.summary)}${issueDetail}</dd></div><div><dt>意见</dt><dd>${opinions}</dd></div><div><dt>处置</dt><dd>${disposition}</dd></div></dl></details>`;
  }).join('');
}

function flowSection(flows: FlowShape[]): string {
  if (flows.length === 0) return '';
  return `<section id="flows"><h2>业务流程</h2>${flows.map((flow) => {
    const steps = flow.steps?.length
      ? `<ol class="plain">${flow.steps.map((step) => `<li>${step.actor ? `<b>${esc(step.actor)}</b>：` : ''}${esc(step.action)}${step.result ? `<span class="muted"> → ${esc(step.result)}</span>` : ''}</li>`).join('')}</ol>`
      : emptyNote('尚未拆分步骤。');
    const exceptions = flow.exceptions?.length ? detail(`异常流程（${flow.exceptions.length}）`, bullets(flow.exceptions)) : '';
    return `<article class="card"><header><h3>${esc(flow.name)}</h3></header>${flow.trigger ? `<p class="muted">触发：${esc(flow.trigger)}</p>` : ''}${steps}${exceptions}</article>`;
  }).join('')}</section>`;
}

function developmentSection(steps: StepShape[]): string {
  if (steps.length === 0) return '';
  return `<section id="development"><h2>开发顺序</h2><ol class="plain">${steps.map((step) => {
    const status = step.status ? ` ${badge(STEP_LABEL[step.status] ?? step.status, STEP_TONE[step.status] ?? 'muted')}` : '';
    const depends = step.dependsOn?.length ? `<span class="muted"> · 依赖 ${esc(step.dependsOn.join('、'))}</span>` : '';
    return `<li><b>${esc(step.name)}</b>${status}${depends}${step.summary ? `<p class="muted">${esc(step.summary)}</p>` : ''}${bullets(step.deliverables)}</li>`;
  }).join('')}</ol></section>`;
}

function linkRow(links: Array<{ label?: string; url?: string }>): string {
  if (links.length === 0) return '';
  return `<div class="rows"><span class="row-label">相关链接</span><div><ul class="plain">${links.map((link) => `<li><a href="${esc(safeUrl(link.url))}" rel="noreferrer">${esc(link.label ?? link.url)}</a></li>`).join('')}</ul></div></div>`;
}

function architectureSection(architecture: ArchitectureShape | undefined): string {
  const modules = architecture?.modules ?? [];
  const dependencies = architecture?.dependencies ?? [];
  const links = architecture?.links ?? [];

  const diagram = renderArchitectureDiagram(
    modules.map((module) => ({
      ...(module.id ? { id: module.id } : {}),
      name: module.name ?? '(未命名模块)',
      ...(module.responsibility ? { responsibility: module.responsibility } : {}),
      ...(module.layer ? { layer: module.layer } : {}),
    })),
    dependencies.map((dependency) => ({
      from: dependency.from ?? '',
      to: dependency.to ?? '',
      ...(dependency.label ? { label: dependency.label } : {}),
    })).filter((dependency) => dependency.from && dependency.to),
  );

  const moduleTable = modules.length
    ? `<table><thead><tr><th>模块</th><th>职责</th>${modules.some((module) => module.layer) ? '<th>层</th>' : ''}</tr></thead><tbody>${modules.map((module) => `<tr><td>${esc(module.name)}</td><td>${esc(module.responsibility ?? '—')}</td>${modules.some((row) => row.layer) ? `<td>${esc(module.layer ?? '—')}</td>` : ''}</tr>`).join('')}</tbody></table>`
    : emptyNote('尚未提供模块列表。');

  const dependencyList = dependencies.length
    ? `<ul class="plain">${dependencies.map((dependency) => `<li>${esc(dependency.from)} → ${esc(dependency.to)}${dependency.label ? `<span class="muted"> · ${esc(dependency.label)}</span>` : ''}</li>`).join('')}</ul>`
    : '';

  return `<section id="architecture"><h2>架构</h2><div class="arch-scroll">${diagram}</div>`
    + detail('模块职责', moduleTable)
    + (dependencyList ? detail('依赖方向', dependencyList) : '')
    + (architecture?.notes ? `<p class="lead">${esc(architecture.notes)}</p>` : '')
    + linkRow(links)
    + '</section>';
}

function explanationSection(explanation: Explanation, stale: boolean): string {
  const items = (values: unknown) => itemList((values ?? []) as DetailItem[]);
  const snapshot = explanation.sourceSnapshot;
  const source = snapshot.gitCommit ? `commit ${snapshot.gitCommit.slice(0, 12)}` : `目录指纹 ${String(snapshot.fingerprint).slice(0, 12)}`;
  const comparisons = explanation.comparisons.length
    ? `<ul class="plain">${explanation.comparisons.map((entry) => `<li>${esc(entry.design)} vs ${esc(entry.observation)} — ${badge(entry.result, entry.result === 'consistent' ? 'ok' : entry.result === 'stale' ? 'muted' : 'warn')}</li>`).join('')}</ul>`
    : '';

  return `<section id="explanation"><h2>已有架构讲解 ${stale ? badge('源码已变化，讲解陈旧', 'warn') : ''}</h2>`
    + `<p class="lead">${esc(explanation.summary)}</p>`
    + `<ul class="stats"><li><b>${snapshot.fileCount}</b><span>纳入快照的文件</span></li><li><b>${explanation.walkthrough.length}</b><span>运行路径条目</span></li><li><b>${explanation.deepDive.length}</b><span>深度分析条目</span></li></ul>`
    + detail('运行路径', items(explanation.walkthrough))
    + detail('模块深度', items(explanation.deepDive))
    + (comparisons ? detail('设计与实现对照', comparisons) : '')
    + `<p class="muted">来源：${esc(source)} · 工具：${esc(snapshot.tool)}${explanation.limitations.length ? ` · 限制：${esc(explanation.limitations.join('；'))}` : ''}</p>`
    + '</section>';
}

const STYLE = `
*,*::before,*::after{box-sizing:border-box}
:root{--ink:#16211d;--muted:#5f6d67;--line:#dde3df;--line-strong:#c6d0ca;--bg:#f4f6f3;--surface:#fff;--brand:#1d6a52;--brand-dark:#124b3a;--brand-soft:#e7f1ec;--bad:#b23c2c;--bad-soft:#fbeae6;--warn:#8a5a12;--warn-soft:#fbf1dd;--ok:#1d6a52;--ok-soft:#e7f1ec;--radius:8px}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.65 ui-sans-serif,system-ui,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
.wrap{max-width:1040px;margin:0 auto;padding:0 22px}
.hero{background:linear-gradient(180deg,#124b3a,#1a5d47);color:#fff;padding:40px 0 32px}
.hero .eyebrow{margin:0 0 10px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#a8cdbf}
.hero h1{margin:0;font-size:30px;line-height:1.32;font-weight:700;letter-spacing:0}
.chips{list-style:none;display:flex;flex-wrap:wrap;gap:8px;margin:18px 0 0;padding:0}
.chips li{background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.22);border-radius:999px;padding:3px 12px;font-size:13px}
.toc{position:sticky;top:0;z-index:5;background:rgba(255,255,255,.94);backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
.toc .wrap{display:flex;gap:4px;overflow-x:auto;padding-top:10px;padding-bottom:10px}
.toc a{flex:0 0 auto;color:var(--muted);text-decoration:none;font-size:13.5px;padding:5px 11px;border-radius:6px;white-space:nowrap}
.toc a:hover{background:var(--brand-soft);color:var(--brand-dark)}
section{padding:30px 0;border-top:1px solid var(--line)}
h2{margin:0 0 16px;font-size:20px;letter-spacing:0}
h3{margin:0;font-size:16px}
.lead{font-size:17px;margin:0 0 18px}
.muted{color:var(--muted)}
.empty{margin:0;padding:14px 16px;background:var(--surface);border:1px dashed var(--line-strong);border-radius:var(--radius);color:var(--muted)}
.stats{list-style:none;display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:18px 0 0;padding:0}
.stats li{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:12px 14px}
.stats b{display:block;font-size:24px;line-height:1.25}
.stats span{font-size:13px;color:var(--muted)}
.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:16px 18px;margin-bottom:12px}
.card>header{display:flex;gap:12px;align-items:flex-start;justify-content:space-between}
.card dl{margin:12px 0 0;display:grid;gap:10px}
.card dl>div{display:grid;grid-template-columns:92px 1fr;gap:12px;align-items:start}
dt{color:var(--muted);font-size:13px;padding-top:2px}
dd{margin:0}
.rows{display:grid;grid-template-columns:92px 1fr;gap:12px;margin-top:14px}
.row-label{color:var(--muted);font-size:13px;padding-top:2px}
.badge{display:inline-block;border-radius:999px;padding:2px 10px;font-size:12px;font-weight:600;white-space:nowrap}
.badge.ok{background:var(--ok-soft);color:var(--ok)}
.badge.warn{background:var(--warn-soft);color:var(--warn)}
.badge.bad{background:var(--bad-soft);color:var(--bad)}
.badge.muted{background:#eef1ef;color:var(--muted)}
details{margin-top:14px;border-top:1px solid var(--line);padding-top:10px}
details.thread{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:10px 14px;margin:0 0 10px}
.thread dl{margin:10px 0 0;display:grid;gap:8px}
.thread dl>div{display:grid;grid-template-columns:60px 1fr;gap:10px}
summary{cursor:pointer;font-size:13.5px;color:var(--brand);font-weight:600}
ul.plain{margin:8px 0 0;padding-left:18px}
ul.plain li{margin:3px 0}
.qgroup{display:flex;align-items:center;gap:8px;margin:22px 0 8px}
.qgroup:first-of-type{margin-top:0}
.tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.tag{font-size:12px;color:var(--muted);background:#eef1ef;border-radius:4px;padding:1px 7px}
.arch-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
.arch{display:block;width:100%;height:auto;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius)}
.arch .band{fill:#f4f7f5;stroke:var(--line)}
.arch .band-label{fill:var(--muted);font-size:12px;font-weight:600}
.arch .node rect{fill:#fff;stroke:#9fb8ad;stroke-width:1.5}
.arch .node-name{fill:var(--ink);font-size:14px;font-weight:600}
.arch .node-sub{fill:var(--muted);font-size:11.5px}
.arch .edge path{fill:none;stroke:#7b8b84;stroke-width:1.6}
.arch .edge-label{fill:#5f6d67;font-size:10.5px;paint-order:stroke;stroke:#fff;stroke-width:3.5px;stroke-linejoin:round}
table{width:100%;border-collapse:collapse;font-size:14.5px;margin-top:6px}
th,td{text-align:left;vertical-align:top;padding:9px 12px;border-bottom:1px solid var(--line)}
th{font-size:12.5px;color:var(--muted);font-weight:600}
footer{padding:26px 0 40px;color:var(--muted);font-size:13px;border-top:1px solid var(--line);margin-top:22px}
@media (max-width:640px){.hero h1{font-size:23px}.card dl>div,.rows{grid-template-columns:1fr;gap:2px}section{padding:24px 0}.arch{min-width:640px}table{display:block;overflow-x:auto}}
@media print{body{background:#fff}.toc{display:none}.hero{background:#fff;color:#000;border-bottom:2px solid #000;padding:0 0 12px}.hero .eyebrow{color:#000}.chips li{border-color:#000;color:#000}.card,.stats li,.arch{break-inside:avoid}a{color:#000;text-decoration:none}}
`;

export function renderHtml(input: { state: WorkspaceState; revision: DesignRevision | null; explanation: Explanation | null; warnings: string[]; explanationStale?: boolean }): string {
  const { state, revision, explanation, warnings, explanationStale = false } = input;
  const summary = revision?.summary ?? '';
  const title = shortTitle(summary);
  // 页头已展示首句，概览只补上余下内容，避免重复。
  const trimmedSummary = summary.trim();
  const firstSentence = trimmedSummary.split(/[。\n!?！？]/)[0]?.trim() ?? '';
  const remainder = trimmedSummary.slice(firstSentence.length).replace(/^[。.!?！？\s]+/, '');
  const overviewLead = remainder ? `<p class="lead">${esc(remainder)}</p>` : '';
  const requirements = (revision?.requirements ?? []) as DetailItem[];
  const decisions = (revision?.decisions ?? []) as DetailItem[];
  const questions = (revision?.questions ?? []) as DetailItem[];
  const reviews = (revision?.reviews ?? []) as ReviewShape[];
  const flows = (revision?.businessFlows ?? []) as FlowShape[];
  const development = (revision?.developmentOrder ?? []) as StepShape[];
  const architecture = (revision?.architecture ?? {}) as ArchitectureShape;
  const blockers = questions.filter((question) => question.priority === 'blocker' && question.status !== 'resolved').length;

  const sections = [
    '<a href="#overview">概览</a>',
    requirements.length ? '<a href="#requirements">需求</a>' : '',
    flows.length ? '<a href="#flows">业务流程</a>' : '',
    '<a href="#architecture">架构</a>',
    '<a href="#decisions">决策</a>',
    development.length ? '<a href="#development">开发顺序</a>' : '',
    '<a href="#questions">未决问题</a>',
    reviews.length ? '<a href="#reviews">评审</a>' : '',
    explanation ? '<a href="#explanation">架构讲解</a>' : '',
    '<a href="#warnings">警告</a>',
  ].filter(Boolean).join('');

  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>筑思设计报告 · revision ${state.currentRevision}</title><style>${STYLE}</style></head><body>
<header class="hero"><div class="wrap"><p class="eyebrow">筑思 · 设计报告</p><h1>${esc(title)}</h1><ul class="chips"><li>阶段 ${esc(revision?.stage ?? 'idea')}</li><li>Revision ${state.currentRevision || '—'}</li><li>创建 ${esc((revision?.createdAt ?? state.updatedAt).slice(0, 10))}</li></ul></div></header>
<nav class="toc"><div class="wrap">${sections}</div></nav>
<main class="wrap">
<section id="overview"><h2>概览</h2>${overviewLead || (summary.trim() ? '' : '<p class="lead">尚无设计摘要。</p>')}
<ul class="stats"><li><b>${requirements.length}</b><span>需求条目</span></li><li><b>${decisions.length}</b><span>架构决策</span></li><li><b>${questions.length}</b><span>未决问题</span></li><li><b>${blockers}</b><span>阻塞项</span></li></ul></section>
${requirements.length ? `<section id="requirements"><h2>需求</h2>${itemList(requirements)}</section>` : ''}
${flowSection(flows)}
${architectureSection(architecture)}
<section id="decisions"><h2>架构决策</h2>${decisionCards(decisions)}</section>
${developmentSection(development)}
<section id="questions"><h2>未决问题</h2>${questionGroups(questions)}</section>
${reviews.length ? `<section id="reviews"><h2>评审记录</h2>${reviewThreads(reviews)}</section>` : ''}
${explanation ? explanationSection(explanation, explanationStale) : ''}
<section id="warnings"><h2>警告</h2>${warnings.length ? `<ul class="plain">${warnings.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>` : '<p class="muted">无</p>'}</section>
</main>
<footer class="wrap">由 Zhusi 生成 · revision ${state.currentRevision || '—'} · 离线自包含，无外部依赖</footer>
</body></html>`;
}

export function renderMarkdown(input: { state: WorkspaceState; revision: DesignRevision | null; warnings: string[] }): string {
  const { state, revision, warnings } = input;
  const decisions = (revision?.decisions ?? []) as DetailItem[];
  const questions = (revision?.questions ?? []) as DetailItem[];
  const requirements = (revision?.requirements ?? []) as DetailItem[];

  const lines = [
    `# ${shortTitle(revision?.summary ?? '')}`,
    '',
    `源 revision：${state.currentRevision || '无'}  `,
    `阶段：${revision?.stage ?? 'idea'}  `,
    `警告：${warnings.length ? warnings.join('；') : '无'}`,
    '',
    '## 概览',
    revision?.summary || '尚无设计摘要。',
    '',
  ];

  const flows = (revision?.businessFlows ?? []) as FlowShape[];
  const development = (revision?.developmentOrder ?? []) as StepShape[];
  const reviews = (revision?.reviews ?? []) as ReviewShape[];

  if (requirements.length) lines.push('## 需求', ...requirements.map((item) => `- ${item.summary}`), '');
  if (flows.length) {
    lines.push('## 业务流程');
    for (const flow of flows) {
      lines.push(`### ${flow.name}`);
      if (flow.trigger) lines.push(`触发：${flow.trigger}`, '');
      (flow.steps ?? []).forEach((step, index) => lines.push(`${index + 1}. ${step.actor ? `${step.actor}：` : ''}${step.action}${step.result ? ` → ${step.result}` : ''}`));
      if (flow.exceptions?.length) lines.push('', '异常流程：', ...flow.exceptions.map((item) => `- ${item}`));
      lines.push('');
    }
  }
  if (decisions.length) {
    lines.push('## 架构决策');
    for (const item of decisions) {
      lines.push(`### ${item.summary}${item.status ? `（${DECISION_LABEL[item.status] ?? item.status}）` : ''}`);
      if (item.choice) lines.push(`- 选择：${item.choice}`);
      if (item.rationale) lines.push(`- 理由：${item.rationale}`);
      if (item.alternatives?.length) lines.push(`- 备选：${item.alternatives.join('；')}`);
      if (item.tradeoffs?.length) lines.push(`- 代价：${item.tradeoffs.join('；')}`);
      if (item.revisitWhen?.length) lines.push(`- 重新评估：${item.revisitWhen.join('；')}`);
      lines.push('');
    }
  }
  if (questions.length) {
    lines.push('## 未决问题');
    for (const priority of ['blocker', 'important', 'suggestion'] as const) {
      const group = questions.filter((question) => question.priority === priority);
      if (group.length) lines.push(`### ${PRIORITY_LABEL[priority]}`, ...group.map((item) => `- ${item.summary}`), '');
    }
    const untagged = questions.filter((question) => !question.priority);
    if (untagged.length) lines.push('### 未标优先级', ...untagged.map((item) => `- ${item.summary}`), '');
  }
  if (development.length) {
    lines.push('## 开发顺序');
    development.forEach((step, index) => {
      const meta = [step.status ? STEP_LABEL[step.status] ?? step.status : '', step.dependsOn?.length ? `依赖 ${step.dependsOn.join('、')}` : ''].filter(Boolean).join('；');
      lines.push(`${index + 1}. **${step.name}**${meta ? `（${meta}）` : ''}${step.summary ? `：${step.summary}` : ''}`);
      for (const deliverable of step.deliverables ?? []) lines.push(`   - ${deliverable}`);
    });
    lines.push('');
  }
  if (reviews.length) {
    lines.push('## 评审记录');
    for (const item of reviews) {
      const decision = reviewDecision(item);
      lines.push('<details>', `<summary>${mdHtml(item.summary ?? '')}（${decision ? DECISION_LABEL[decision] ?? decision : '待处置'}）</summary>`, '');
      lines.push(`- 问题：${item.summary}${item.priority ? `（${PRIORITY_LABEL[item.priority] ?? item.priority}）` : ''}`);
      for (const opinion of item.opinions ?? []) lines.push(`- 意见：${opinion.author ? `${opinion.author}：` : ''}${opinion.text}`);
      const reason = item.disposition?.reason ?? (decision ? item.details : undefined);
      lines.push(`- 处置：${decision ? `${DECISION_LABEL[decision] ?? decision}${reason ? ` — ${reason}` : ''}` : '尚未处置'}`);
      lines.push('', '</details>', '');
    }
  }
  return `${lines.join('\n')}\n`;
}

const mdHtml = (text: string) => esc(text);
