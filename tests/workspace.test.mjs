import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Workspace } from '../dist/storage/workspace.js';
import { captureCodeSnapshot, isSnapshotStale, normalizeExplanation } from '../dist/explain/snapshot.js';
import { cleanup, makeTempDir } from './helpers.mjs';

function revisionInput(projectId, requestId) {
  return {
    schemaVersion: 1, projectId, revision: 0, createdAt: new Date().toISOString(), actor: { client: 'test' },
    requestId, stage: 'drafting', summary: `请求 ${requestId}`, requirements: [], decisions: [], questions: [], reviews: [], architecture: {},
  };
}

test('init 非破坏性且重复运行保持文件哈希', async () => {
  const dir = await makeTempDir();
  try {
    const workspace = await Workspace.at(dir);
    const first = await workspace.initialize();
    assert.equal(first.created, true);
    const statePath = path.join(dir, '.zhusi', 'state.json');
    const before = await readFile(statePath, 'utf8');
    const second = await workspace.initialize();
    assert.equal(second.created, false);
    assert.equal(await readFile(statePath, 'utf8'), before);
  } finally { await cleanup(dir); }
});

test('相同 requestId 幂等，不产生第二个 revision', async () => {
  const dir = await makeTempDir();
  try {
    const workspace = await Workspace.at(dir);
    const { config } = await workspace.initialize();
    const input = revisionInput(config.projectId, 'req-1');
    const a = await workspace.commitRevision(input, 0);
    const b = await workspace.commitRevision({ ...input, revision: 0 }, 0);
    assert.equal(a.revision.revision, 1);
    assert.equal(a.created, true);
    assert.equal(b.revision.revision, 1);
    assert.equal(b.created, false);
    const { state } = await workspace.readCore();
    assert.equal(state.currentRevision, 1);
  } finally { await cleanup(dir); }
});

test('过期 expectedRevision 返回冲突且保留旧快照', async () => {
  const dir = await makeTempDir();
  try {
    const workspace = await Workspace.at(dir);
    const { config } = await workspace.initialize();
    await workspace.commitRevision(revisionInput(config.projectId, 'req-1'), 0);
    await assert.rejects(
      () => workspace.commitRevision(revisionInput(config.projectId, 'req-2'), 0),
      (error) => error.code === 'REVISION_CONFLICT' && error.latestRevision === 1,
    );
    const prior = await workspace.readRevision(1);
    assert.equal(prior.requestId, 'req-1');
    const { state } = await workspace.readCore();
    assert.equal(state.currentRevision, 1);
  } finally { await cleanup(dir); }
});

test('并行写入一次成功一次冲突且数据不损坏', async () => {
  const dir = await makeTempDir();
  try {
    const workspace = await Workspace.at(dir);
    const { config } = await workspace.initialize();
    const results = await Promise.allSettled([
      workspace.commitRevision(revisionInput(config.projectId, 'p-a'), 0),
      workspace.commitRevision(revisionInput(config.projectId, 'p-b'), 0),
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');
    assert.equal(ok.length, 1);
    assert.equal(failed.length, 1);
    assert.equal(failed[0].reason.code, 'REVISION_CONFLICT');
    assert.deepEqual(await workspace.validate(), []);
    const { state } = await workspace.readCore();
    assert.equal(state.currentRevision, 1);
  } finally { await cleanup(dir); }
});

test('提交后旧 revision 保持不变且新 revision 可完整读取', async () => {
  const dir = await makeTempDir();
  try {
    const workspace = await Workspace.at(dir);
    const { config } = await workspace.initialize();
    await workspace.commitRevision(revisionInput(config.projectId, 'r1'), 0);
    const firstBytes = await readFile(path.join(dir, '.zhusi', 'revisions', '000001.json'), 'utf8');
    await workspace.commitRevision(revisionInput(config.projectId, 'r2'), 1);
    assert.equal(await readFile(path.join(dir, '.zhusi', 'revisions', '000001.json'), 'utf8'), firstBytes);
    const second = await workspace.readRevision(2);
    assert.equal(second.requestId, 'r2');
  } finally { await cleanup(dir); }
});

test('损坏 JSON 被 validate 报告且不被替换', async () => {
  const dir = await makeTempDir();
  try {
    const workspace = await Workspace.at(dir);
    await workspace.initialize();
    const broken = path.join(dir, '.zhusi', 'revisions', '000009.json');
    await writeFile(broken, '{ not json', 'utf8');
    const errors = await workspace.validate();
    assert.ok(errors.some((line) => line.includes('000009.json')));
    assert.equal(await readFile(broken, 'utf8'), '{ not json');
  } finally { await cleanup(dir); }
});

test('repair dry-run 报告孤立快照且不修改文件系统', async () => {
  const dir = await makeTempDir();
  try {
    const workspace = await Workspace.at(dir);
    const { config } = await workspace.initialize();
    await workspace.commitRevision(revisionInput(config.projectId, 'r1'), 0);
    const orphan = path.join(dir, '.zhusi', 'revisions', '000005.json');
    const orphanBytes = JSON.stringify(revisionInput(config.projectId, 'orphan'));
    await writeFile(orphan, orphanBytes, 'utf8');
    const actions = await workspace.repairPlan();
    assert.ok(actions.some((line) => line.includes('000005.json')));
    assert.equal(await readFile(orphan, 'utf8'), orphanBytes);
  } finally { await cleanup(dir); }
});

test('锁被占用时返回 PROJECT_BUSY 而不是覆盖', async () => {
  const dir = await makeTempDir();
  try {
    const workspace = await Workspace.at(dir);
    await workspace.initialize();
    const lockFile = path.join(dir, '.zhusi', 'lock', 'owner.json');
    await mkdir(path.dirname(lockFile), { recursive: true });
    await writeFile(lockFile, JSON.stringify({ pid: 999999, createdAt: new Date().toISOString() }), 'utf8');
    await assert.rejects(() => workspace.withLock(async () => 'ok', 200), (error) => error.code === 'PROJECT_BUSY');
  } finally { await cleanup(dir); }
});

test('代码快照排除 .git 与 .zhusi 并检测陈旧', async () => {
  const dir = await makeTempDir();
  try {
    await writeFile(path.join(dir, 'index.js'), 'export const a = 1;\n', 'utf8');
    await mkdir(path.join(dir, '.git'), { recursive: true });
    await mkdir(path.join(dir, '.zhusi'), { recursive: true });
    await writeFile(path.join(dir, '.zhusi', 'config.json'), '{}', 'utf8');
    const snapshot = await captureCodeSnapshot(dir);
    assert.deepEqual(snapshot.readScope, ['index.js']);
    assert.equal(snapshot.gitCommit, undefined);
    assert.equal(await isSnapshotStale(snapshot), false);
    await writeFile(path.join(dir, 'index.js'), 'export const a = 2;\n', 'utf8');
    assert.equal(await isSnapshotStale(snapshot), true);
  } finally { await cleanup(dir); }
});

test('从 Git 元数据直接读取 commit，不执行子进程', async () => {
  const dir = await makeTempDir();
  try {
    await writeFile(path.join(dir, 'index.js'), 'export const a = 1;\n', 'utf8');
    await mkdir(path.join(dir, '.git', 'refs', 'heads'), { recursive: true });
    await mkdir(path.join(dir, '.zhusi'), { recursive: true });
    await writeFile(path.join(dir, '.git', 'HEAD'), 'ref: refs/heads/main\n', 'utf8');
    await writeFile(path.join(dir, '.git', 'refs', 'heads', 'main'), `${'a'.repeat(40)}\n`, 'utf8');
    const snapshot = await captureCodeSnapshot(dir);
    assert.equal(snapshot.gitCommit, 'a'.repeat(40));
    assert.equal(snapshot.fingerprint, undefined);
    assert.deepEqual(snapshot.readScope, ['index.js']);
  } finally { await cleanup(dir); }
});

test('缺失证据的结论被归一化为 inferred/unknown', () => {
  const normalized = normalizeExplanation({
    summary: 's',
    walkthrough: [{ summary: '有证据', evidence: ['a.ts:1'] }, { summary: '无证据' }],
  });
  assert.equal(normalized.walkthrough[0].classification, 'inferred');
  assert.equal(normalized.walkthrough[1].classification, 'unknown');
  assert.ok(normalized.limitations.length > 0);
});
