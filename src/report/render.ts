import type { DesignRevision, Explanation, WorkspaceState } from '../domain/schema.js';
import { renderArchitectureDiagram } from './diagram.js';
import { clipText, escapeHtml, safeUrl } from './escape.js';
import { describeChanges } from './changes.js';

const esc = escapeHtml;
interface DetailItem {
  id?: string; summary?: string; status?: string; priority?: string; details?: string;
  evidence?: string[]; classification?: string; confidence?: number;
  choice?: string; rationale?: string; alternatives?: string[]; tradeoffs?: string[]; revisitWhen?: string[];
}
interface ArchitectureShape {
  modules?: Array<{ id?: string; name?: string; responsibility?: string; layer?: string }>;
  dependencies?: Array<{ from?: string; to?: string; label?: string }>;
  links?: Array<{ label?: string; url?: string }>; notes?: string;
}
const DECISION_TONE: Record<string, string> = { accepted: 'ok', proposed: 'warn', rejected: 'muted', deferred: 'muted' };
const DECISION_LABEL: Record<string, string> = { accepted: '已采纳', proposed: '待确认', rejected: '已拒绝', deferred: '已延期' };
const PRIORITY_LABEL: Record<string, string> = { blocker: '阻塞', important: '重要', suggestion: '建议' };
const STATUS_LABEL: Record<string, string> = { ...DECISION_LABEL, confirmed: '已确认', assumed: '假设', unknown: '未知', resolved: '已解决', open: '待解决', pending: '待办', done: '已完成' };
const CLASSIFICATION_LABEL: Record<string, string> = { fact: '代码事实', inferred: '推断', unknown: '未知', intent: '设计意图' };
const STAGE_LABEL: Record<string, string> = { idea: '想法', clarifying: '澄清中', drafting: '草拟中', reviewing: '评审中', ready: '已就绪' };
const badge = (text: string, tone = 'muted') => `<span class="badge ${tone}">${esc(text)}</span>`;
const detail = (summary: string, body: string) => body ? `<details><summary>${esc(summary)}</summary>${body}</details>` : '';
const field = (label: string, body: string) => body ? `<div><dt>${esc(label)}</dt><dd>${body}</dd></div>` : '';

// 历史长文仅作有标识的预览，不冒充摘要；完整文本仍可展开读取。
function compactText(value: unknown, limit = 120): string {
  if (typeof value !== 'string' || !value.trim()) return '';
  const text = value.trim();
  if (text.length <= limit && !text.includes('\n')) return `<span>${esc(text)}</span>`;
  const first = text.split(/[。！？\n]/)[0] ?? text;
  return detail(`原文预览：${clipText(first, 100)}`, `<div class="source-text">${esc(text)}</div>`);
}
function bullets(values: string[] | undefined): string {
  return values?.length ? `<ul class="plain">${values.map((value) => `<li>${compactText(value)}</li>`).join('')}</ul>` : '';
}
function pointDetails(value: string | undefined): string {
  return value ? bullets(value.split(/\r?\n/).map((line) => line.replace(/^\s*[-*•]\s*/, '').trim()).filter(Boolean)) : '';
}
function shortTitle(summary: string): string {
  return clipText(summary.split(/[。\n!?！？]/)[0]?.trim() || '项目设计', 100);
}
function itemTags(item: DetailItem): string {
  const tags = [];
  if (item.priority && item.status !== 'resolved') tags.push(badge(PRIORITY_LABEL[item.priority] ?? item.priority, item.priority === 'blocker' ? 'bad' : item.priority === 'important' ? 'warn' : 'muted'));
  if (item.status && STATUS_LABEL[item.status]) tags.push(badge(STATUS_LABEL[item.status]!, item.status === 'confirmed' || item.status === 'resolved' ? 'ok' : DECISION_TONE[item.status] ?? 'muted'));
  if (item.classification && CLASSIFICATION_LABEL[item.classification]) tags.push(badge(CLASSIFICATION_LABEL[item.classification]!));
  return tags.join(' ');
}
function itemList(items: DetailItem[]): string {
  if (!items.length) return '';
  return `<ul class="plain item-list">${items.map((item) => {
    const evidence = item.evidence?.length ? `<div class="tags">${item.evidence.map((ref) => `<span class="tag">${esc(ref)}</span>`).join('')}</div>` : '';
    return `<li>${compactText(item.summary, 80)} ${itemTags(item)}${detail('依据与说明', pointDetails(item.details) + evidence)}</li>`;
  }).join('')}</ul>`;
}
function limitedItems(items: DetailItem[], label: string): string {
  return itemList(items.slice(0, 5)) + (items.length > 5 ? detail(`${label}（另 ${items.length - 5} 项）`, itemList(items.slice(5))) : '');
}
function decisionCards(items: DetailItem[]): string {
  return items.map((item) => {
    const rows = [
      field('选择', item.choice && item.choice !== item.summary ? compactText(item.choice, 80) : ''),
      field('理由', compactText(item.rationale)),
      field('代价', bullets(item.tradeoffs?.slice(0, 1))),
    ].join('');
    const more = [
      field('其他代价', bullets(item.tradeoffs?.slice(1))),
      field('备选', bullets(item.alternatives)),
      field('重新评估', bullets(item.revisitWhen)),
      field('补充', pointDetails(item.details)),
      field('证据', bullets(item.evidence)),
    ].join('');
    return `<article class="card"><header><div class="decision-title">${compactText(item.summary, 80)}</div>${badge(DECISION_LABEL[item.status ?? 'proposed'] ?? item.status!, DECISION_TONE[item.status ?? 'proposed'] ?? 'muted')}</header>`
      + (rows ? `<dl>${rows}</dl>` : '') + detail('取舍依据', more ? `<dl>${more}</dl>` : '') + '</article>';
  }).join('');
}
function questionGroups(items: DetailItem[]): string {
  return ['blocker', 'important', 'suggestion', 'untagged'].map((priority) => {
    const rows = items.filter((item) => priority === 'untagged' ? !item.priority : item.priority === priority);
    if (!rows.length) return '';
    const body = itemList(rows);
    return priority === 'suggestion' ? detail(`建议（${rows.length}）`, body) : body;
  }).join('');
}
function architectureSection(architecture: ArchitectureShape): string {
  const modules = architecture.modules ?? [];
  const dependencies = architecture.dependencies ?? [];
  const links = architecture.links ?? [];
  if (!modules.length && !dependencies.length && !links.length && !architecture.notes) return '';
  const diagram = modules.length ? renderArchitectureDiagram(modules.map((module) => ({ ...module, name: module.name ?? '未命名模块' })), dependencies.map((dependency) => ({ ...dependency, from: dependency.from ?? '', to: dependency.to ?? '' }))) : '';
  const names = new Map(modules.map((module) => [module.id ?? module.name, module.name]));
  const moduleList = bullets(modules.map((module) => `${module.name}${module.responsibility ? `：${module.responsibility}` : ''}`));
  const dependencyList = bullets(dependencies.map((dependency) => `${names.get(dependency.from) ?? dependency.from} → ${names.get(dependency.to) ?? dependency.to}${dependency.label ? `：${dependency.label}` : ''}`));
  const linkList = links.length ? `<ul class="plain">${links.map((link) => `<li><a href="${esc(safeUrl(link.url))}" rel="noreferrer">${esc(link.label ?? link.url)}</a></li>`).join('')}</ul>` : '';
  return (diagram ? `<p class="flow-hint">悬停模块查看流向 · <span class="flow-in">蓝色流入</span> / <span class="flow-out">绿色流出</span><span class="touch-hint"> · 触屏可点选模块</span></p><div class="arch-scroll">${diagram}</div>` : '')
    + detail('模块与依赖', moduleList + dependencyList)
    + detail('架构补充', pointDetails(architecture.notes) + linkList);
}
function explanationSection(explanation: Explanation, stale: boolean): string {
  const snapshot = explanation.sourceSnapshot;
  const source = snapshot.gitCommit ? `commit ${snapshot.gitCommit.slice(0, 12)}` : `目录指纹 ${String(snapshot.fingerprint).slice(0, 12)}`;
  const labels = { consistent: '一致', divergent: '不一致', unknown: '未知', stale: '已陈旧' };
  const comparisons = explanation.comparisons.length ? `<ul class="plain">${explanation.comparisons.map((entry) => `<li>${badge(labels[entry.result], entry.result === 'divergent' ? 'warn' : 'muted')}${compactText(entry.design)} → ${compactText(entry.observation)}</li>`).join('')}</ul>` : '';
  return (stale ? `<p>${badge('源码已变化，讲解需复核', 'warn')}</p>` : '')
    + compactText(explanation.summary)
    + detail(`运行路径（${explanation.walkthrough.length}）`, itemList(explanation.walkthrough as DetailItem[]))
    + detail(`模块深度（${explanation.deepDive.length}）`, itemList(explanation.deepDive as DetailItem[]))
    + detail('设计与实现对照', comparisons)
    + detail('来源与限制', `<p class="muted">${esc(source)} · ${snapshot.fileCount} 个文件</p>` + bullets(explanation.limitations));
}
const STYLE = `
*,*::before,*::after{box-sizing:border-box}
:root{--ink:#16211d;--muted:#5f6d67;--line:#dde3df;--line-strong:#c6d0ca;--bg:#f4f6f3;--surface:#fff;--brand:#1d6a52;--brand-dark:#124b3a;--brand-soft:#e7f1ec;--bad:#b23c2c;--bad-soft:#fbeae6;--warn:#8a5a12;--warn-soft:#fbf1dd;--ok:#1d6a52;--ok-soft:#e7f1ec;--radius:8px}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.65 ui-sans-serif,system-ui,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
.wrap{max-width:1040px;margin:0 auto;padding:0 22px}
.hero{background:#124b3a;color:#fff;padding:28px 0 24px}
.hero .eyebrow{margin:0 0 10px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#a8cdbf}
.hero h1{margin:0;font-size:30px;line-height:1.32;font-weight:700;letter-spacing:0}
.chips{list-style:none;display:flex;flex-wrap:wrap;gap:8px;margin:18px 0 0;padding:0}
.chips li{background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.22);border-radius:999px;padding:3px 12px;font-size:13px}
.toc{position:sticky;top:0;z-index:5;background:rgba(255,255,255,.94);backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
.toc .wrap{display:flex;gap:4px;overflow-x:auto;padding-top:10px;padding-bottom:10px}
.toc a{flex:0 0 auto;color:var(--muted);text-decoration:none;font-size:13.5px;padding:5px 11px;border-radius:6px;white-space:nowrap}
.toc a:hover{background:var(--brand-soft);color:var(--brand-dark)}
section{scroll-margin-top:80px;padding:24px 0;border-top:1px solid var(--line)}
h2{margin:0 0 16px;font-size:20px;letter-spacing:0}
h3{margin:0;font-size:16px}
.lead{font-size:17px;margin:0 0 18px}
.muted{color:var(--muted)}
.empty{margin:0;padding:14px 16px;background:var(--surface);border:1px dashed var(--line-strong);border-radius:var(--radius);color:var(--muted)}
.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:16px 18px;margin-bottom:12px}
.card>header{display:flex;gap:12px;align-items:flex-start;justify-content:space-between}
.card dl{margin:12px 0 0;display:grid;gap:10px}
.card dl>div{display:grid;grid-template-columns:92px 1fr;gap:12px;align-items:start}
dt{color:var(--muted);font-size:13px;padding-top:2px}
dd{margin:0}
.badge{display:inline-block;border-radius:999px;padding:2px 10px;font-size:12px;font-weight:600;white-space:nowrap}
.badge.ok{background:var(--ok-soft);color:var(--ok)}
.badge.warn{background:var(--warn-soft);color:var(--warn)}
.badge.bad{background:var(--bad-soft);color:var(--bad)}
.badge.muted{background:#eef1ef;color:var(--muted)}
details{margin-top:14px;border-top:1px solid var(--line);padding-top:10px}
summary{cursor:pointer;font-size:13.5px;color:var(--brand);font-weight:600}
ul.plain{margin:8px 0 0;padding-left:18px}
ul.plain li{margin:3px 0}
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
footer{padding:26px 0 40px;color:var(--muted);font-size:13px;border-top:1px solid var(--line);margin-top:22px}
.scope-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}
.decision-title{font-weight:650}.source-text{white-space:pre-wrap;overflow-wrap:anywhere;max-height:18rem;overflow:auto;font-size:14px;line-height:1.7}
.item-list>li{margin:12px 0}.item-list details{margin-top:6px;padding-top:5px}
.actions{padding-left:24px}.actions li{padding:8px 0}.actions li div{font-size:14px}
.flow-hint{font-size:13px;color:var(--muted)}.flow-in{color:#377cad}.flow-out{color:#1d6a52}.touch-hint{display:none}
@media(hover:none){.touch-hint{display:inline}}
.chips .urgent{background:#fbeae6;color:#902e20;border-color:transparent}
main{overflow-wrap:anywhere}summary{overflow-wrap:anywhere}
@media (max-width:640px){.scope-grid{grid-template-columns:1fr;gap:14px}.hero h1{font-size:23px}.card dl>div{grid-template-columns:1fr;gap:2px}section{padding:24px 0}.arch{min-width:640px}}
@media print{.source-text{max-height:none;overflow:visible}.flow-hint{display:none}body{background:#fff}.toc{display:none}.hero{background:#fff;color:#000;border-bottom:2px solid #000;padding:0 0 12px}.hero .eyebrow{color:#000}.chips li{border-color:#000;color:#000}.card,.arch{break-inside:avoid}a{color:#000;text-decoration:none}}
`;

export function renderHtml(input: { state: WorkspaceState; revision: DesignRevision | null; explanation: Explanation | null; warnings: string[]; explanationStale?: boolean; previousRevision?: DesignRevision | null }): string {
  const { state, revision, explanation, warnings, explanationStale = false, previousRevision = null } = input;
  const summary = (revision?.summary || explanation?.summary || '').trim();
  const title = shortTitle(summary);
  const firstSentence = summary.split(/[。\n!?！？]/)[0]?.trim() ?? '';
  const remainder = summary.slice(firstSentence.length).replace(/^[。.!?！？\s]+/, '');
  const overview = title !== firstSentence ? compactText(summary) : remainder ? (remainder.length <= 120 ? `<p class="lead">${esc(remainder)}</p>` : compactText(remainder)) : '';
  const requirements = (revision?.requirements ?? []) as DetailItem[];
  const decisions = (revision?.decisions ?? []) as DetailItem[];
  const questions = (revision?.questions ?? []) as DetailItem[];
  const pending = questions.filter((question) => question.status !== 'resolved');
  const resolved = questions.filter((question) => question.status === 'resolved');
  const currentDecisions = decisions.filter((item) => !['rejected', 'deferred'].includes(item.status ?? ''));
  const oldDecisions = decisions.filter((item) => ['rejected', 'deferred'].includes(item.status ?? ''));
  const steps = revision?.nextSteps ?? [];
  const pendingSteps = steps.filter((step) => step.status !== 'done');
  const doneSteps = steps.filter((step) => step.status === 'done');
  const actions = (items: typeof steps) => items.length ? `<ol class="actions">${items.map((step) => `<li><b>${esc(step.summary)}</b>${step.prerequisite ? `<div class="muted">前置：${esc(step.prerequisite)}</div>` : ''}<div>验收：${esc(step.acceptance)}</div></li>`).join('')}</ol>` : '';
  const scope = revision?.scope;
  const scopeBody = (scope?.included.length ? `<div><h3>本期做</h3>${bullets(scope.included)}</div>` : '') + (scope?.excluded.length ? `<div><h3>暂不做</h3>${bullets(scope.excluded)}</div>` : '');
  const changes = revision && previousRevision ? describeChanges(previousRevision, revision) : [];
  const history = detail(`已解决问题（${resolved.length}）`, itemList(resolved))
    + detail(`已拒绝 / 延期决策（${oldDecisions.length}）`, decisionCards(oldDecisions))
    + detail(`评审记录（${revision?.reviews.length ?? 0}）`, itemList((revision?.reviews ?? []) as DetailItem[]))
    + detail(`已完成行动（${doneSteps.length}）`, actions(doneSteps));
  const sections: Array<{ id: string; title: string; body: string }> = [
    { id: 'overview', title: '目标与范围', body: overview + (scopeBody ? `<div class="scope-grid">${scopeBody}</div>` : '') },
    { id: 'questions', title: `待决问题 · ${pending.length}`, body: questionGroups(pending) },
    { id: 'warnings', title: '需留意', body: bullets(warnings) },
    { id: 'architecture', title: '核心架构', body: architectureSection((revision?.architecture ?? {}) as ArchitectureShape) },
    { id: 'decisions', title: '方案与取舍', body: decisionCards(currentDecisions.slice(0, 5)) + (currentDecisions.length > 5 ? detail(`更多决策（${currentDecisions.length - 5}）`, decisionCards(currentDecisions.slice(5))) : '') },
    { id: 'next-steps', title: '下一步', body: actions(pendingSteps) },
    { id: 'requirements', title: '需求要点', body: limitedItems(requirements, '更多需求') },
    { id: 'changes', title: '本次变更', body: changes.length ? `<p class="muted">revision ${previousRevision!.revision} → ${revision!.revision}</p>${bullets(changes)}` : '' },
    { id: 'explanation', title: '已有架构讲解', body: explanation ? explanationSection(explanation, explanationStale) : '' },
    { id: 'history', title: '历史与依据', body: history },
  ].filter((section) => section.body);
  const blockers = pending.filter((question) => question.priority === 'blocker').length;
  const questionStatus = blockers ? `${blockers} 项阻塞` : pending.length ? `${pending.length} 项待决` : '';
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>筑思设计报告 · revision ${state.currentRevision}</title><style>${STYLE}</style></head><body>
<header class="hero"><div class="wrap"><p class="eyebrow">筑思 · 设计简报</p><h1>${esc(title)}</h1><ul class="chips"><li>${esc(STAGE_LABEL[revision?.stage ?? 'idea'])}</li><li>Revision ${state.currentRevision || '—'}</li>${questionStatus ? `<li class="${blockers ? 'urgent' : ''}">${esc(questionStatus)}</li>` : ''}</ul></div></header>
${sections.length ? `<nav class="toc"><div class="wrap">${sections.map((section) => `<a href="#${section.id}">${esc(section.title)}</a>`).join('')}</div></nav>` : ''}
<main class="wrap">${sections.map((section) => `<section id="${section.id}"><h2>${esc(section.title)}</h2>${section.body}</section>`).join('')}</main>
<footer class="wrap">Zhusi · revision ${state.currentRevision || '—'} · 离线报告</footer></body></html>`;
}

export function renderMarkdown(input: { state: WorkspaceState; revision: DesignRevision | null; warnings: string[] }): string {
  const { state, revision, warnings } = input;
  const lines = [`# ${shortTitle(revision?.summary ?? '')}`, '', `源 revision：${state.currentRevision || '无'}  `, `阶段：${revision?.stage ?? 'idea'}  `, `警告：${warnings.length ? warnings.join('；') : '无'}`, '', revision?.summary || '', ''];
  const list = (title: string, values: string[]) => { if (values.length) lines.push(`## ${title}`, ...values.map((value) => `- ${value}`), ''); };
  list('本期范围', revision?.scope?.included ?? []);
  list('非目标', revision?.scope?.excluded ?? []);
  list('需求', revision?.requirements.map((item) => `${item.summary}${item.status ? `（${STATUS_LABEL[item.status] ?? item.status}）` : ''}`) ?? []);
  for (const item of (revision?.decisions ?? []) as DetailItem[]) {
    lines.push(`## ${item.summary}（${DECISION_LABEL[item.status ?? 'proposed'] ?? item.status}）`);
    if (item.choice && item.choice !== item.summary) lines.push(`- 选择：${item.choice}`);
    if (item.rationale) lines.push(`- 理由：${item.rationale}`);
    if (item.tradeoffs?.length) lines.push(`- 代价：${item.tradeoffs.join('；')}`);
    if (item.alternatives?.length) lines.push(`- 备选：${item.alternatives.join('；')}`);
    if (item.revisitWhen?.length) lines.push(`- 重新评估：${item.revisitWhen.join('；')}`);
    lines.push('');
  }
  const questions = revision?.questions ?? [];
  list('未决问题', questions.filter((item) => item.status !== 'resolved').map((item) => `${item.priority ? `[${PRIORITY_LABEL[item.priority]}] ` : ''}${item.summary}`));
  list('已解决问题', questions.filter((item) => item.status === 'resolved').map((item) => item.summary));
  list('下一步', (revision?.nextSteps ?? []).filter((step) => step.status !== 'done').map((step) => `${step.summary}${step.prerequisite ? `；前置：${step.prerequisite}` : ''}；验收：${step.acceptance}`));
  return `${lines.join('\n')}\n`;
}
