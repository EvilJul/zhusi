import assert from 'node:assert/strict';
import test from 'node:test';
import { renderHtml, renderMarkdown } from '../dist/report/render.js';
import { DesignRevisionSchema } from '../dist/domain/schema.js';

const state = { schemaVersion: 1, projectId: 'p', currentRevision: 3, currentExplanation: 0, updatedAt: '2026-10-12T00:00:00.000Z' };

function revision(extra) {
  return DesignRevisionSchema.parse({
    schemaVersion: 1, projectId: 'p', revision: 3, createdAt: '2026-10-12T00:00:00.000Z', actor: {}, requestId: 'r', stage: 'reviewing',
    summary: '报告测试。', ...extra,
  });
}

const flows = [{ id: 'f1', name: '下单', trigger: '用户点击购买', steps: [{ actor: '用户', action: '提交订单', result: '订单 pending' }], exceptions: ['库存不足：提示并回到购物车'] }];
const development = [
  { id: 'd1', name: '数据层', deliverables: ['迁移脚本'], status: 'done' },
  { id: 'd2', name: '接口层', dependsOn: ['d1'], status: 'in-progress' },
];
const reviews = [
  { id: 'r1', summary: '缺少幂等', priority: 'important', opinions: [{ author: 'A', text: '重复下单风险' }] },
  { id: 'r2', summary: '拆微服务', status: 'rejected', opinions: [{ author: 'B', text: '扩展性' }], disposition: { decision: 'rejected', reason: '规模不需要', by: 'lead', revision: 3 } },
];

test('旧 revision 缺少新字段时取默认空数组', () => {
  const parsed = revision({});
  assert.deepEqual(parsed.businessFlows, []);
  assert.deepEqual(parsed.developmentOrder, []);
});

test('非法处置决定与非法步骤状态被 schema 拒绝', () => {
  assert.throws(() => revision({ reviews: [{ id: 'x', summary: 's', disposition: { decision: 'maybe' } }] }));
  assert.throws(() => revision({ developmentOrder: [{ id: 'd', name: 'n', status: 'later' }] }));
});

test('HTML 报告渲染业务流程、开发顺序与折叠评审', () => {
  const html = renderHtml({ state, revision: revision({ businessFlows: flows, developmentOrder: development, reviews }), explanation: null, warnings: [] });
  assert.match(html, /id="flows"/);
  assert.match(html, /下单/);
  assert.match(html, /异常流程（1）/);
  assert.match(html, /库存不足/);
  assert.match(html, /id="development"/);
  assert.match(html, /依赖 d1/);
  assert.match(html, /已完成/);
  assert.match(html, /<details class="thread" open><summary>缺少幂等/, '未处置评审默认展开');
  assert.match(html, /<details class="thread"><summary>拆微服务/, '已处置评审默认折叠');
  assert.match(html, /<dt>问题<\/dt>.*<dt>意见<\/dt>.*<dt>处置<\/dt>/s);
  assert.match(html, /规模不需要/);
  assert.match(html, /待处置/);
  assert.doesNotMatch(html, /<script/i);
});

test('新字段中的恶意内容被转义', () => {
  const html = renderHtml({ state, revision: revision({
    businessFlows: [{ id: 'f', name: '<script>alert(1)</script>', steps: [{ action: '</details><img src=x onerror=alert(1)>' }] }],
    reviews: [{ id: 'r', summary: 's', opinions: [{ author: '<b>x</b>', text: '<script>' }] }],
  }), explanation: null, warnings: [] });
  assert.doesNotMatch(html, /<script>alert/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;script&gt;/);
});

test('没有新字段时不输出空的业务流程与开发顺序节', () => {
  const html = renderHtml({ state, revision: revision({}), explanation: null, warnings: [] });
  assert.doesNotMatch(html, /id="flows"/);
  assert.doesNotMatch(html, /id="development"/);
});

test('Markdown 导出包含业务流程、开发顺序与问题→意见→处置', () => {
  const md = renderMarkdown({ state, revision: revision({ businessFlows: flows, developmentOrder: development, reviews }), warnings: [] });
  assert.match(md, /## 业务流程\n### 下单\n触发：用户点击购买/);
  assert.match(md, /1\. 用户：提交订单 → 订单 pending/);
  assert.match(md, /- 库存不足/);
  assert.match(md, /## 开发顺序\n1\. \*\*数据层\*\*（已完成）\n   - 迁移脚本\n2\. \*\*接口层\*\*（进行中；依赖 d1）/);
  assert.match(md, /<summary>缺少幂等（待处置）<\/summary>/);
  assert.match(md, /- 意见：A：重复下单风险/);
  assert.match(md, /- 处置：尚未处置/);
  assert.match(md, /- 处置：已拒绝 — 规模不需要/);
});
