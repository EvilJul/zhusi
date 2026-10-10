import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createDesignTemplate, DesignRevisionSchema, DesignSubmissionSchema, SCHEMA_VERSION } from '../dist/domain/schema.js';
import { unresolvedBlockerQuestions } from '../dist/domain/integrity.js';
import { createTemplate, readDesign, submitDesign } from '../dist/services/design.js';
import { Workspace } from '../dist/storage/workspace.js';
import { cleanup, makeTempDir } from './helpers.mjs';

async function freshWorkspace() {
  const dir = await makeTempDir();
  const workspace = await Workspace.at(dir);
  const { config } = await workspace.initialize();
  return { dir, workspace, config };
}

test('最小提交载荷解析为可用的默认结构', () => {
  const submission = DesignSubmissionSchema.parse({});
  assert.equal(submission.stage, 'idea');
  assert.deepEqual(submission.requirements, []);
  assert.deepEqual(submission.decisions, []);
  assert.deepEqual(submission.questions, []);
  assert.deepEqual(submission.reviews, []);
  assert.deepEqual(submission.architecture, { modules: [], dependencies: [], links: [] });
});

test('提交载荷拒绝服务端管理的字段', () => {
  for (const key of ['revision', 'projectId', 'schemaVersion', 'createdAt']) {
    assert.throws(() => DesignSubmissionSchema.parse({ [key]: 1 }), /Unrecognized key|unrecognized/i, `应拒绝 ${key}`);
  }
});

test('模板骨架无需修改即可通过校验', () => {
  const template = createDesignTemplate(3, 'req-template');
  const parsed = DesignSubmissionSchema.parse(template);
  assert.equal(parsed.expectedRevision, 3);
  assert.equal(parsed.requestId, 'req-template');
  assert.equal(parsed.stage, 'drafting');
});

test('ready 闸门只拦未解决的阻塞问题', () => {
  const revision = (questions) => DesignRevisionSchema.parse({
    schemaVersion: SCHEMA_VERSION, projectId: 'p1', revision: 1, createdAt: new Date().toISOString(),
    actor: {}, requestId: 'r1', stage: 'ready', summary: '', requirements: [], decisions: [], reviews: [], architecture: {},
    questions,
  });
  assert.equal(unresolvedBlockerQuestions(revision([{ id: 'q1', summary: 'a', priority: 'blocker', status: 'open' }])).length, 1);
  assert.equal(unresolvedBlockerQuestions(revision([{ id: 'q1', summary: 'a', priority: 'blocker', status: 'resolved' }])).length, 0);
  assert.equal(unresolvedBlockerQuestions(revision([{ id: 'q1', summary: 'a', priority: 'important', status: 'open' }])).length, 0);
});

test('空项目读取返回 expectedRevision 0 且无 revision', async () => {
  const { dir } = await freshWorkspace();
  try {
    const result = await readDesign(dir);
    assert.equal(result.expectedRevision, 0);
    assert.equal(result.revision, null);
  } finally { await cleanup(dir); }
});

test('read → submit 回路推进一个 revision 且保留旧快照', async () => {
  const { dir, workspace } = await freshWorkspace();
  try {
    await submitDesign({ project: dir, payload: JSON.stringify({ expectedRevision: 0, requestId: 'a', stage: 'drafting', summary: '第一版' }), dryRun: false });
    const firstBytes = await readFile(path.join(dir, '.zhusi', 'revisions', '000001.json'), 'utf8');
    const read = await readDesign(dir);
    assert.equal(read.expectedRevision, 1);
    assert.equal(read.revision.summary, '第一版');

    const second = await submitDesign({ project: dir, payload: JSON.stringify({ expectedRevision: read.expectedRevision, requestId: 'b', stage: 'reviewing', summary: '第二版' }), dryRun: false });
    assert.equal(second.created, true);
    assert.equal(second.revision.revision, 2);
    assert.equal(await readFile(path.join(dir, '.zhusi', 'revisions', '000001.json'), 'utf8'), firstBytes);
    assert.deepEqual(await workspace.validate(), []);
  } finally { await cleanup(dir); }
});

test('过期 expectedRevision 返回冲突与最新 revision', async () => {
  const { dir } = await freshWorkspace();
  try {
    await submitDesign({ project: dir, payload: JSON.stringify({ expectedRevision: 0, requestId: 'a' }), dryRun: false });
    await assert.rejects(
      () => submitDesign({ project: dir, payload: JSON.stringify({ expectedRevision: 0, requestId: 'b' }), dryRun: false }),
      (error) => error.code === 'REVISION_CONFLICT' && error.latestRevision === 1,
    );
  } finally { await cleanup(dir); }
});

test('相同 requestId 重试不新增 revision', async () => {
  const { dir, workspace } = await freshWorkspace();
  try {
    const payload = JSON.stringify({ expectedRevision: 0, requestId: 'same', stage: 'drafting', summary: '一次' });
    const first = await submitDesign({ project: dir, payload, dryRun: false });
    const retry = await submitDesign({ project: dir, payload, dryRun: false });
    assert.equal(first.created, true);
    assert.equal(retry.created, false);
    assert.equal(retry.revision.revision, 1);
    const { state } = await workspace.readCore();
    assert.equal(state.currentRevision, 1);
  } finally { await cleanup(dir); }
});

test('缺少 expectedRevision 时拒绝写入', async () => {
  const { dir, workspace } = await freshWorkspace();
  try {
    await assert.rejects(
      () => submitDesign({ project: dir, payload: JSON.stringify({ stage: 'drafting' }), dryRun: false }),
      (error) => error.code === 'INVALID_INPUT' && /expectedRevision/.test(error.message),
    );
    const { state } = await workspace.readCore();
    assert.equal(state.currentRevision, 0);
  } finally { await cleanup(dir); }
});

test('dry-run 通过全部检查但不写入', async () => {
  const { dir, workspace } = await freshWorkspace();
  try {
    const result = await submitDesign({ project: dir, payload: JSON.stringify({ expectedRevision: 0, requestId: 'dry', stage: 'drafting' }), dryRun: true });
    assert.equal(result.dryRun, true);
    assert.equal(result.revision.stage, 'drafting');
    const { state } = await workspace.readCore();
    assert.equal(state.currentRevision, 0);
  } finally { await cleanup(dir); }
});

test('dry-run 同样检测过期 revision', async () => {
  const { dir } = await freshWorkspace();
  try {
    await submitDesign({ project: dir, payload: JSON.stringify({ expectedRevision: 0, requestId: 'a' }), dryRun: false });
    await assert.rejects(
      () => submitDesign({ project: dir, payload: JSON.stringify({ expectedRevision: 0, requestId: 'b' }), dryRun: true }),
      (error) => error.code === 'REVISION_CONFLICT',
    );
  } finally { await cleanup(dir); }
});

test('ready 阶段存在未解决 blocker 时拒绝写入', async () => {
  const { dir, workspace } = await freshWorkspace();
  try {
    await assert.rejects(
      () => submitDesign({
        project: dir,
        payload: JSON.stringify({ expectedRevision: 0, requestId: 'r', stage: 'ready', questions: [{ id: 'q1', summary: '取消规则', priority: 'blocker', status: 'open' }] }),
        dryRun: false,
      }),
      (error) => error.code === 'STAGE_NOT_READY' && /取消规则/.test(error.message),
    );
    const { state } = await workspace.readCore();
    assert.equal(state.currentRevision, 0);
  } finally { await cleanup(dir); }
});

test('blocker 标记 resolved 后可以进入 ready', async () => {
  const { dir } = await freshWorkspace();
  try {
    const result = await submitDesign({
      project: dir,
      payload: JSON.stringify({ expectedRevision: 0, requestId: 'r', stage: 'ready', questions: [{ id: 'q1', summary: '取消规则', priority: 'blocker', status: 'resolved' }] }),
      dryRun: false,
    });
    assert.equal(result.revision.stage, 'ready');
  } finally { await cleanup(dir); }
});

test('非法 JSON 返回可读的输入错误', async () => {
  const { dir } = await freshWorkspace();
  try {
    await assert.rejects(
      () => submitDesign({ project: dir, payload: '{ 不是 json', dryRun: false }),
      (error) => error.code === 'INVALID_INPUT' && /JSON/.test(error.message),
    );
  } finally { await cleanup(dir); }
});
