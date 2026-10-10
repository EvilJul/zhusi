import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { cleanup, makeTempDir, runCli } from './helpers.mjs';

async function initializedProject() {
  const dir = await makeTempDir('zhusi-author-');
  await runCli(['init', '--project', dir, '--json']);
  return dir;
}

async function submit(dir, payload, extra = []) {
  const file = path.join(dir, `payload-${Math.random().toString(16).slice(2)}.json`);
  await writeFile(file, JSON.stringify(payload), 'utf8');
  return runCli(['design', 'submit', '--project', dir, '--input', file, '--json', ...extra]);
}

test('design show 在空项目返回 expectedRevision 0', async () => {
  const dir = await initializedProject();
  try {
    const result = await runCli(['design', 'show', '--project', dir, '--json']);
    assert.equal(result.code, 0);
    const data = JSON.parse(result.stdout);
    assert.equal(data.expectedRevision, 0);
    assert.equal(data.revision, null);
    assert.equal(result.stderr, '');
  } finally { await cleanup(dir); }
});

test('design template 输出的骨架可直接解析且带 expectedRevision', async () => {
  const dir = await initializedProject();
  try {
    const result = await runCli(['design', 'template', '--project', dir]);
    assert.equal(result.code, 0);
    const skeleton = JSON.parse(result.stdout);
    assert.equal(skeleton.expectedRevision, 0);
    assert.equal(typeof skeleton.requestId, 'string');
    assert.deepEqual(skeleton.architecture, { modules: [], dependencies: [], links: [] });
  } finally { await cleanup(dir); }
});

test('design template --out 写入文件', async () => {
  const dir = await initializedProject();
  try {
    const out = path.join(dir, 'skeleton.json');
    const result = await runCli(['design', 'template', '--project', dir, '--out', out, '--json']);
    assert.equal(result.code, 0);
    assert.equal(JSON.parse(result.stdout).path, out);
    assert.equal(JSON.parse(await readFile(out, 'utf8')).expectedRevision, 0);
  } finally { await cleanup(dir); }
});

test('design submit 写入 revision 且 design show 能读回', async () => {
  const dir = await initializedProject();
  try {
    const result = await submit(dir, {
      expectedRevision: 0, requestId: 'cli-1', stage: 'drafting', summary: '预约系统',
      requirements: [{ id: 'req_01', summary: '顾客可预约' }],
    });
    assert.equal(result.code, 0);
    const envelope = JSON.parse(result.stdout);
    assert.equal(envelope.created, true);
    assert.equal(envelope.revision, 1);

    const show = await runCli(['design', 'show', '--project', dir, '--json']);
    const shown = JSON.parse(show.stdout);
    assert.equal(shown.expectedRevision, 1);
    assert.equal(shown.revision.summary, '预约系统');
    assert.equal(shown.revision.requirements[0].summary, '顾客可预约');
  } finally { await cleanup(dir); }
});

test('过期 expectedRevision 返回退出码 3 与 latestRevision', async () => {
  const dir = await initializedProject();
  try {
    await submit(dir, { expectedRevision: 0, requestId: 'a' });
    const conflict = await submit(dir, { expectedRevision: 0, requestId: 'b' });
    assert.equal(conflict.code, 3);
    const envelope = JSON.parse(conflict.stdout);
    assert.equal(envelope.code, 'REVISION_CONFLICT');
    assert.equal(envelope.latestRevision, 1);
  } finally { await cleanup(dir); }
});

test('schema 非法返回退出码 2 且不写入', async () => {
  const dir = await initializedProject();
  try {
    const result = await submit(dir, { expectedRevision: 0, requestId: 'x', decisions: [{ id: 'd1' }] });
    assert.equal(result.code, 2);
    const envelope = JSON.parse(result.stdout);
    assert.equal(envelope.code, 'INVALID_INPUT');
    const show = JSON.parse((await runCli(['design', 'show', '--project', dir, '--json'])).stdout);
    assert.equal(show.expectedRevision, 0);
  } finally { await cleanup(dir); }
});

test('ready 阶段存在未解决 blocker 返回退出码 4', async () => {
  const dir = await initializedProject();
  try {
    const result = await submit(dir, {
      expectedRevision: 0, requestId: 'r', stage: 'ready',
      questions: [{ id: 'q1', summary: '是否支持取消', priority: 'blocker', status: 'open' }],
    });
    assert.equal(result.code, 4);
    assert.equal(JSON.parse(result.stdout).code, 'STAGE_NOT_READY');
  } finally { await cleanup(dir); }
});

test('--dry-run 通过校验但不写入', async () => {
  const dir = await initializedProject();
  try {
    const result = await submit(dir, { expectedRevision: 0, requestId: 'dry', stage: 'drafting' }, ['--dry-run']);
    assert.equal(result.code, 0);
    assert.equal(JSON.parse(result.stdout).dryRun, true);
    const show = JSON.parse((await runCli(['design', 'show', '--project', dir, '--json'])).stdout);
    assert.equal(show.expectedRevision, 0);
  } finally { await cleanup(dir); }
});

test('--input - 从 stdin 读取提交载荷', async () => {
  const dir = await initializedProject();
  try {
    const result = await runCli(
      ['design', 'submit', '--project', dir, '--input', '-', '--json'],
      { stdin: JSON.stringify({ expectedRevision: 0, requestId: 'stdin-1', stage: 'clarifying', summary: '来自 stdin' }) },
    );
    assert.equal(result.code, 0);
    assert.equal(JSON.parse(result.stdout).revision, 1);
  } finally { await cleanup(dir); }
});

test('提交的设计内容会出现在生成的报告中', async () => {
  const dir = await initializedProject();
  try {
    await submit(dir, {
      expectedRevision: 0, requestId: 'report-1', stage: 'reviewing', summary: '预约系统。第一版只做单店。',
      decisions: [{
        id: 'dec_01', summary: '模块化单体', status: 'accepted', choice: '模块化单体',
        rationale: '一人维护，边界还在变', alternatives: ['微服务'], tradeoffs: ['共享发布'], revisitWhen: ['需要独立扩容'],
      }],
      questions: [{ id: 'q1', summary: '是否支持取消', priority: 'blocker', status: 'open' }],
      architecture: {
        modules: [{ id: 'api', name: 'HTTP API', responsibility: '路由', layer: '入口' }],
        dependencies: [],
      },
    });
    const report = await runCli(['report', '--project', dir, '--json']);
    assert.equal(report.code, 0);
    const html = await readFile(JSON.parse(report.stdout).path, 'utf8');
    assert.match(html, /模块化单体/);
    assert.match(html, /一人维护，边界还在变/);
    assert.match(html, /需要独立扩容/);
    assert.match(html, /HTTP API/);
    assert.match(html, /阻塞/);
    assert.ok(!/<script/i.test(html));
  } finally { await cleanup(dir); }
});
