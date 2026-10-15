import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DesignRevisionSchema, DesignSubmissionSchema } from '../dist/domain/schema.js';
import { renderHtml, renderMarkdown } from '../dist/report/render.js';
import { describeChanges } from '../dist/report/changes.js';
import { renderArchitectureDiagram } from '../dist/report/diagram.js';
import { Workspace } from '../dist/storage/workspace.js';
import { submitDesign, readDesign } from '../dist/services/design.js';
import { createReport, saveExplanation } from '../dist/services/project.js';
import { makeTempDir, cleanup, runCli } from './helpers.mjs';

const now = '2026-10-14T00:00:00.000Z';
const state = { schemaVersion: 1, projectId: 'p', currentRevision: 2, currentExplanation: 0, updatedAt: now };
const revision = (overrides = {}) => ({ schemaVersion: 1, projectId: 'p', revision: 2, createdAt: now, actor: {}, requestId: 'r', stage: 'reviewing', summary: '预约系统。只做单店。', requirements: [], decisions: [], questions: [], reviews: [], architecture: {}, ...overrides });
const render = (data, extras = {}) => renderHtml({ state, revision: revision(data), explanation: null, warnings: [], ...extras });
const section = (html, id) => html.match(new RegExp(`<section id="${id}">([\\s\\S]*?)</section>`))?.[1] ?? '';

test('新提交拒绝长摘要、长要点和段落，旧快照仍可读取', () => {
  assert.throws(() => DesignSubmissionSchema.parse({ summary: '长'.repeat(121) }), /120/);
  assert.throws(() => DesignSubmissionSchema.parse({ requirements: [{ id: 'r', summary: '长'.repeat(81) }] }), /80/);
  assert.throws(() => DesignSubmissionSchema.parse({ summary: '第一段\n第二段' }), /一行/);
  assert.throws(() => DesignSubmissionSchema.parse({ decisions: [{ id: 'd', summary: '选择', rationale: '长'.repeat(121) }] }), /120/);
  assert.throws(() => DesignSubmissionSchema.parse({ requirements: [{ id: 'r', summary: '简短', details: '长'.repeat(121) }] }), /禁止大段文字/);
  assert.throws(() => DesignSubmissionSchema.parse({ architecture: { notes: Array(7).fill('一条').join('\n') } }), /6/);
  assert.equal(DesignRevisionSchema.parse(revision({ summary: '旧'.repeat(500) })).summary.length, 500);
});

test('精炼详情允许少量分行要点，不把上限当作截断器', () => {
  const input = { expectedRevision: 0, summary: '只做单店预约。', requirements: [{ id: 'r', summary: '允许取消', details: '- 提前一天\n- 自动释放时段' }] };
  assert.equal(DesignSubmissionSchema.parse(input).requirements[0].details, input.requirements[0].details);
  const boundary = Array(6).fill('字'.repeat(120)).join('\r\n');
  assert.equal(DesignSubmissionSchema.parse({ requirements: [{ id: 'r', summary: '边界', details: boundary }] }).requirements[0].details, boundary);
});

test('所有详情默认收起，空章节与无警告占位不出现', () => {
  const html = render({ architecture: { modules: [{ name: '入口' }] }, decisions: [{ id: 'd', summary: '单体', choice: '单体', rationale: '一人维护', alternatives: ['微服务'] }] });
  assert.doesNotMatch(html, /<details\s+open/);
  assert.ok(html.includes('<details>'));
  for (const id of ['warnings', 'questions', 'requirements', 'history', 'next-steps']) assert.equal(section(html, id), '');
  assert.equal((html.match(/>单体</g) ?? []).length, 1, '选择与标题相同不重复');
});

test('已解决问题进入历史且不再带阻塞标签，全部未解决重要项仍显示', () => {
  const questions = [{ id: 'resolved', summary: '已经处理', status: 'resolved', priority: 'blocker' }, ...Array.from({ length: 8 }, (_, i) => ({ id: `q${i}`, summary: `待处理${i}`, priority: i === 0 ? 'blocker' : 'important', status: 'open' }))];
  const html = render({ questions });
  const pending = section(html, 'questions');
  assert.match(pending, /待决问题 · 8/);
  assert.doesNotMatch(pending, /已经处理/);
  for (let i = 0; i < 8; i++) assert.ok(pending.includes(`待处理${i}`));
  assert.match(section(html, 'history'), /已解决/);
  assert.doesNotMatch(section(html, 'history'), /阻塞/);
  const md = renderMarkdown({ state, revision: revision({ questions }), warnings: [] });
  assert.doesNotMatch(md.split('## 已解决问题')[0], /已经处理/);
});

test('需求可信状态与讲解分类可见，拒绝与延期决策只出现在历史', () => {
  const explanation = { summary: '已有架构', sourceSnapshot: { gitCommit: 'abcdef123456', fileCount: 1 }, walkthrough: [{ id: 'e', summary: '路由可能来自入口', classification: 'inferred' }], deepDive: [], comparisons: [], limitations: [] };
  const html = render({ requirements: [{ id: 'r', summary: '尚未确认', status: 'unknown' }], decisions: [{ id: 'd', summary: '不采用微服务', status: 'rejected' }] }, { explanation });
  assert.match(section(html, 'requirements'), /未知/);
  assert.match(section(html, 'explanation'), /推断/);
  assert.doesNotMatch(section(html, 'decisions'), /不采用微服务/);
  assert.match(section(html, 'history'), /不采用微服务/);
});

test('旧长文以明确的原文预览呈现，完整文本可展开且转义', () => {
  const long = '旧长文'.repeat(80) + '<img onerror=alert(1)>';
  const html = render({ summary: long, requirements: [{ id: 'r', summary: long }] });
  assert.match(html, /原文预览/);
  assert.ok(html.includes(long.replaceAll('<', '&lt;').replaceAll('>', '&gt;')));
  assert.doesNotMatch(html, /<img/);
});

test('范围和下一步有验收结果，已完成行动折叠保存', () => {
  const html = render({ scope: { included: ['单店预约'], excluded: ['多租户'] }, nextSteps: [{ id: 's1', summary: '实现占用', prerequisite: '确认时段规则', acceptance: '重复预约只成功一次', status: 'pending' }, { id: 's2', summary: '需求评审', acceptance: '确认范围', status: 'done' }] });
  assert.match(section(html, 'overview'), /单店预约/);
  assert.match(section(html, 'overview'), /多租户/);
  assert.match(section(html, 'next-steps'), /重复预约只成功一次/);
  assert.doesNotMatch(section(html, 'next-steps'), /需求评审/);
  assert.match(section(html, 'history'), /需求评审/);
  assert.throws(() => DesignSubmissionSchema.parse({ nextSteps: [{ id: 's', summary: '动作' }] }));
});

test('变更摘要比较实际字段，不因对象键顺序或条目顺序产生虚假更新', () => {
  const before = revision({ revision: 1, requirements: [{ id: 'r1', summary: 'A' }, { id: 'r2', summary: 'B' }], questions: [{ id: 'q', summary: '取消规则', status: 'open' }] });
  const reordered = revision({ ...before, revision: 2, requirements: [{ summary: 'B', id: 'r2' }, { summary: 'A', id: 'r1' }] });
  assert.deepEqual(describeChanges(before, reordered), []);
  const after = revision({ requirements: [{ id: 'r1', summary: '修改A' }, { id: 'r3', summary: 'C' }], questions: [{ id: 'q', summary: '取消规则', status: 'resolved' }] });
  assert.deepEqual(describeChanges(before, after), ['需求：新增 1 项，更新 1 项，移除 1 项', '问题：解决 1 项']);
});

test('架构图按真实引用登记流向，不将不可信模块名拼进 CSS', () => {
  const hostile = 'a"]{color:red}</style><script>x</script>';
  const svg = renderArchitectureDiagram([{ id: hostile, name: '入口' }, { id: 'svc', name: '服务' }, { id: 'db', name: '数据库' }], [{ from: hostile, to: '服务' }, { from: 'svc', to: 'db' }, { from: 'db', to: hostile }, { from: 'missing', to: 'db' }]);
  assert.match(svg, /class="edge" data-from="0" data-to="1"/);
  assert.match(svg, /class="edge" data-from="1" data-to="2"/);
  assert.match(svg, /class="edge" data-from="2" data-to="0"/);
  assert.equal((svg.match(/class="edge"/g) ?? []).length, 3);
  assert.equal((svg.match(/tabindex="0"/g) ?? []).length, 3);
  assert.doesNotMatch(svg, /<script|onmouseover|onclick|color:red/);
});

test('CLI 拒绝啰嗦提交且不创建 revision', async () => {
  const dir = await makeTempDir();
  try {
    await (await Workspace.at(dir)).initialize();
    const result = await runCli(['design', 'submit', '--project', dir, '--input', '-', '--json'], { stdin: JSON.stringify({ expectedRevision: 0, summary: '长'.repeat(121) }) });
    assert.equal(result.code, 2);
    assert.match(JSON.parse(result.stdout).message, /summary.*120/);
    assert.equal((await readDesign(dir)).expectedRevision, 0);
  } finally { await cleanup(dir); }
});

test('保存范围与行动、生成两版变更摘要且不改写旧快照', async () => {
  const dir = await makeTempDir();
  try {
    const workspace = await Workspace.at(dir);
    await workspace.initialize();
    const first = { expectedRevision: 0, requestId: 'a', summary: '预约系统', requirements: [{ id: 'r', summary: '预约' }] };
    await submitDesign({ project: dir, payload: JSON.stringify(first), dryRun: false });
    const priorPath = path.join(dir, '.zhusi/revisions/000001.json');
    const priorBytes = await readFile(priorPath, 'utf8');
    const scope = { included: ['单店'], excluded: ['多店'] };
    const nextSteps = [{ id: 's', summary: '实现预约', acceptance: '提交成功', status: 'pending' }];
    await submitDesign({ project: dir, payload: JSON.stringify({ ...first, expectedRevision: 1, requestId: 'b', scope, nextSteps }), dryRun: false });
    const read = await readDesign(dir);
    assert.deepEqual(read.revision.scope, scope);
    assert.deepEqual(read.revision.nextSteps, nextSteps);
    const report = await createReport(dir);
    const html = await readFile(report.path, 'utf8');
    assert.match(section(html, 'changes'), /行动：新增 1 项/);
    assert.match(section(html, 'changes'), /revision 1 → 2/);
    assert.equal(await readFile(priorPath, 'utf8'), priorBytes);
  } finally { await cleanup(dir); }
});

test('架构讲解也拒绝长段落，不创建讲解快照', async () => {
  const dir = await makeTempDir();
  const code = await makeTempDir();
  try {
    const workspace = await Workspace.at(dir);
    await workspace.initialize();
    await writeFile(path.join(code, 'main.js'), 'export const a = 1;');
    await assert.rejects(() => saveExplanation({ project: dir, existing: code, payload: { summary: '长'.repeat(121) } }), /120/);
    assert.equal((await workspace.readCore()).state.currentExplanation, 0);
  } finally { await cleanup(dir); await cleanup(code); }
});

test('显式未知分类不被证据字段改为推断', async () => {
  const { normalizeExplanation } = await import('../dist/explain/snapshot.js');
  const value = normalizeExplanation({ summary: '讲解', walkthrough: [{ summary: '尚未确定职责', classification: 'unknown', evidence: ['main.ts:1'] }, { summary: '缺少证据', evidence: [] }] });
  assert.equal(value.walkthrough[0].classification, 'unknown');
  assert.equal(value.walkthrough[1].classification, 'unknown');
});

test('同列流向从外侧连接，箭头落在目标边界而非被目标遮住', () => {
  const svg = renderArchitectureDiagram([{ name: 'A', layer: '业务' }, { name: 'B', layer: '业务' }], [{ from: 'A', to: 'B', label: '调用' }]);
  const edgePath = svg.match(/class="edge"[^>]*>[\s\S]*?<path d="([^"]+)"/)[1];
  const coordinates = [...edgePath.matchAll(/[\d.]+/g)].map((match) => Number(match[0]));
  assert.equal(coordinates[0], coordinates[6], '源和目标均从右侧边界连接');
  assert.ok(coordinates[2] > coordinates[0], '控制点向外绕行');
  assert.match(svg, /class="edge-label"[^>]*>调用/);
});
