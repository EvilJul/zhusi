import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DesignRevisionSchema, ExplanationSchema, ProjectConfigSchema, StateSchema, SCHEMA_VERSION, parseVersioned,
} from '../dist/domain/schema.js';
import { renderHtml, renderMarkdown } from '../dist/report/render.js';

const now = new Date().toISOString();

test('有效的项目配置与状态通过校验', () => {
  const config = ProjectConfigSchema.parse({ schemaVersion: SCHEMA_VERSION, projectId: 'p1', createdAt: now, root: '/tmp/p' });
  assert.equal(config.projectId, 'p1');
  const state = StateSchema.parse({ schemaVersion: SCHEMA_VERSION, projectId: 'p1', currentRevision: 0, currentExplanation: 0, updatedAt: now });
  assert.equal(state.currentRevision, 0);
});

test('未知的更高 schema 主版本被拒绝', () => {
  assert.throws(() => parseVersioned(StateSchema, { schemaVersion: 99, projectId: 'p1', currentRevision: 0, updatedAt: now }), /不支持的 schema 主版本 99/);
});

test('缺少必填字段的设计 revision 被拒绝', () => {
  assert.throws(() => DesignRevisionSchema.parse({ schemaVersion: 1, projectId: 'p1', revision: 1 }));
});

test('讲解缺少 Git commit 与 fingerprint 时被拒绝', () => {
  assert.throws(() => ExplanationSchema.parse({
    schemaVersion: 1, projectId: 'p1', revision: 1, createdAt: now, requestId: 'r1',
    sourceSnapshot: { root: '/tmp', generatedAt: now, tool: 'x', readScope: [], fileCount: 0 },
    summary: 's', walkthrough: [], deepDive: [], limitations: [],
  }));
});

test('报告转义脚本闭合负载与危险链接协议', () => {
  const hostile = '<script>alert(1)</script>';
  const html = renderHtml({
    state: { schemaVersion: 1, projectId: 'p1', currentRevision: 1, currentExplanation: 0, updatedAt: now },
    revision: {
      schemaVersion: 1, projectId: 'p1', revision: 1, createdAt: now, actor: {}, requestId: 'r1', stage: 'ready',
      summary: hostile, requirements: [], decisions: [], reviews: [], questions: [],
      architecture: { links: [{ label: hostile, url: 'javascript:alert(1)' }] },
    },
    explanation: null,
    warnings: [hostile],
  });
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!html.includes('javascript:alert(1)'));
  assert.ok(!html.includes('http://') && !html.includes('https://') && !html.includes('src="http'));
});

test('Markdown 导出包含源 revision 与警告', () => {
  const md = renderMarkdown({
    state: { schemaVersion: 1, projectId: 'p1', currentRevision: 4, currentExplanation: 0, updatedAt: now },
    revision: { schemaVersion: 1, projectId: 'p1', revision: 4, createdAt: now, actor: {}, requestId: 'r1', stage: 'reviewing', summary: 'S', requirements: [], decisions: [], reviews: [], questions: [{ id: 'q1', summary: '未决', priority: 'important' }], architecture: {} },
    warnings: ['有孤立快照'],
  });
  assert.ok(md.includes('源 revision：4'));
  assert.ok(md.includes('有孤立快照'));
  assert.ok(md.includes('未决'));
});
