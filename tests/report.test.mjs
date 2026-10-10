import assert from 'node:assert/strict';
import test from 'node:test';
import { renderArchitectureDiagram } from '../dist/report/diagram.js';
import { renderHtml, renderMarkdown } from '../dist/report/render.js';

const now = new Date().toISOString();
const state = { schemaVersion: 1, projectId: 'p1', currentRevision: 1, currentExplanation: 0, updatedAt: now };

function revisionWith(overrides = {}) {
  return {
    schemaVersion: 1, projectId: 'p1', revision: 1, createdAt: now, actor: {}, requestId: 'r1',
    stage: 'ready', summary: '预约系统。第一版只做单店。',
    requirements: [], decisions: [], questions: [], reviews: [], architecture: {},
    ...overrides,
  };
}

test('架构图使用真实模块与依赖，而不是写死的占位框', () => {
  const svg = renderArchitectureDiagram(
    [
      { id: 'api', name: 'HTTP API', responsibility: '路由', layer: '入口' },
      { id: 'svc', name: '预约服务', responsibility: '占用时段', layer: '应用' },
      { id: 'db', name: '数据库', responsibility: '唯一约束', layer: '基础设施' },
    ],
    [{ from: 'api', to: 'svc', label: '提交预约' }, { from: 'svc', to: 'db', label: '写入预约' }],
  );
  assert.match(svg, /HTTP API/);
  assert.match(svg, /预约服务/);
  assert.match(svg, /数据库/);
  assert.match(svg, /提交预约/);
  assert.match(svg, /写入预约/);
  assert.match(svg, /入口/);
  assert.match(svg, /基础设施/);
  assert.doesNotMatch(svg, /核心模块/);
});

test('无 layer 时按依赖关系自动分层', () => {
  const svg = renderArchitectureDiagram(
    [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
    [{ from: 'A', to: 'B' }, { from: 'B', to: 'C' }],
  );
  const xs = [...svg.matchAll(/<rect x="(\d+)"/g)].map((match) => Number(match[1]));
  assert.equal(new Set(xs).size, 3, '三个连续模块应落在三列');
});

test('模块名与依赖标签中的 HTML 被转义', () => {
  const svg = renderArchitectureDiagram(
    [{ name: '<script>alert(1)</script>', responsibility: '"><img onerror=1>' }],
    [],
  );
  assert.ok(!svg.includes('<script>'));
  assert.ok(!svg.includes('onerror=1>'));
  assert.match(svg, /&lt;script&gt;/);
});

test('未提供模块时给出可读占位而不是空图', () => {
  const svg = renderArchitectureDiagram([], []);
  assert.match(svg, /未提供模块信息/);
  assert.ok(!svg.includes('<svg'));
});

test('依赖引用不存在的模块时被忽略而不报错', () => {
  const svg = renderArchitectureDiagram([{ name: 'A' }], [{ from: 'A', to: '不存在' }]);
  assert.match(svg, /A/);
  assert.match(svg, /<svg/);
});

test('决策卡片渲染理由、备选、代价与重新评估条件', () => {
  const html = renderHtml({
    state,
    revision: revisionWith({
      decisions: [{
        id: 'dec_01', summary: '模块化单体', status: 'accepted', choice: '模块化单体',
        rationale: '一人维护', alternatives: ['微服务'], tradeoffs: ['共享发布'], revisitWhen: ['需要独立扩容'],
      }],
    }),
    explanation: null,
    warnings: [],
  });
  assert.match(html, /模块化单体/);
  assert.match(html, /一人维护/);
  assert.match(html, /微服务/);
  assert.match(html, /共享发布/);
  assert.match(html, /需要独立扩容/);
  assert.match(html, /已采纳/);
});

test('未决问题按优先级分组并标注阻塞项', () => {
  const html = renderHtml({
    state,
    revision: revisionWith({
      questions: [
        { id: 'q1', summary: '取消规则', priority: 'blocker' },
        { id: 'q2', summary: '跨时区', priority: 'important' },
        { id: 'q3', summary: '界面语言', priority: 'suggestion' },
      ],
    }),
    explanation: null,
    warnings: [],
  });
  assert.match(html, /阻塞/);
  assert.match(html, /重要/);
  assert.match(html, /建议/);
  assert.match(html, /取消规则/);
  assert.match(html, /跨时区/);
});

test('评审记录含优先级与处置结果', () => {
  const html = renderHtml({
    state,
    revision: revisionWith({ reviews: [{ id: 'rev_1', summary: '索引会失效', priority: 'important', status: 'deferred', details: '记录触发条件' }] }),
    explanation: null,
    warnings: [],
  });
  assert.match(html, /索引会失效/);
  assert.match(html, /已延期/);
  assert.match(html, /记录触发条件/);
});

test('报告不含脚本标签与外部资源，且拒绝危险链接协议', () => {
  const html = renderHtml({
    state,
    revision: revisionWith({
      summary: '<script>alert(1)</script>',
      architecture: { links: [{ label: 'x', url: 'javascript:alert(1)' }], modules: [{ name: '<img src=x onerror=1>' }] },
    }),
    explanation: null,
    warnings: ['<script>alert(2)</script>'],
  });
  assert.ok(!/<script/i.test(html));
  assert.ok(!html.includes('javascript:'));
  assert.ok(!/src=["']http/i.test(html));
  assert.ok(!html.includes('onerror=1>'));
});

test('Markdown 导出保留决策理由与问题优先级', () => {
  const md = renderMarkdown({
    state,
    revision: revisionWith({
      decisions: [{ id: 'd1', summary: '模块化单体', status: 'accepted', choice: '单体', rationale: '一人维护' }],
      questions: [{ id: 'q1', summary: '取消规则', priority: 'blocker' }],
    }),
    warnings: [],
  });
  assert.match(md, /理由：一人维护/);
  assert.match(md, /阻塞/);
  assert.match(md, /取消规则/);
});

test('概览不重复页头已经展示的首句', () => {
  const html = renderHtml({ state, revision: revisionWith({ summary: '第一句。第二句。' }), explanation: null, warnings: [] });
  const h1 = /<h1>(.*?)<\/h1>/.exec(html)?.[1];
  assert.equal(h1, '第一句');
  assert.match(html, /<p class="lead">第二句。<\/p>/);
});
