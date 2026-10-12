import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { cleanup, makeTempDir, runCli } from './helpers.mjs';

async function projectWithReviews() {
  const dir = await makeTempDir('zhusi-review-');
  await runCli(['init', '--project', dir, '--json']);
  const payload = {
    expectedRevision: 0, requestId: 'base', stage: 'reviewing', summary: '评审测试',
    reviews: [
      { id: 'r1', summary: '缓存失效策略不明确', priority: 'important' },
      { id: 'r2', summary: '建议拆分微服务', priority: 'suggestion' },
    ],
  };
  const file = path.join(dir, 'base.json');
  await writeFile(file, JSON.stringify(payload), 'utf8');
  const result = await runCli(['design', 'submit', '--project', dir, '--input', file, '--json']);
  assert.equal(result.code, 0, result.stderr);
  return dir;
}

const json = (result) => JSON.parse(result.stdout);
const show = async (dir) => json(await runCli(['design', 'show', '--project', dir, '--json']));

test('design dispose 把处置写回新 revision 并保留历史', async () => {
  const dir = await projectWithReviews();
  try {
    const result = await runCli(['design', 'dispose', '--project', dir, '-r', 'r2', '-d', 'reject', '-m', '单体已足够', '-e', '1', '--request-id', 'd1', '--json']);
    assert.equal(result.code, 0, result.stdout + result.stderr);
    assert.deepEqual({ ...json(result), stage: undefined }, { ok: true, dryRun: false, created: true, revision: 2, stage: undefined });
    const current = await show(dir);
    const r2 = current.revision.reviews.find((item) => item.id === 'r2');
    assert.equal(r2.status, 'rejected');
    assert.equal(r2.disposition.decision, 'rejected');
    assert.equal(r2.disposition.reason, '单体已足够');
    assert.equal(r2.disposition.revision, 2);
    const r1 = current.revision.reviews.find((item) => item.id === 'r1');
    assert.equal(r1.disposition, undefined);
    const original = JSON.parse(await readFile(path.join(dir, '.zhusi', 'revisions', '000001.json'), 'utf8'));
    assert.equal(original.reviews[1].disposition, undefined, '旧 revision 不可变');
  } finally { await cleanup(dir); }
});

test('dispose 相同 requestId 重试幂等，过期 expectedRevision 冲突', async () => {
  const dir = await projectWithReviews();
  try {
    const args = ['design', 'dispose', '--project', dir, '-r', 'r1', '-d', 'accept', '-e', '1', '--request-id', 'same', '--json'];
    assert.equal(json(await runCli(args)).created, true);
    const retry = await runCli(args);
    assert.equal(retry.code, 0);
    assert.equal(json(retry).created, false);
    assert.equal(json(retry).revision, 2);
    const stale = await runCli(['design', 'dispose', '--project', dir, '-r', 'r2', '-d', 'defer', '-e', '1', '--request-id', 'other', '--json']);
    assert.equal(stale.code, 3);
    assert.equal(json(stale).code, 'REVISION_CONFLICT');
    assert.equal(json(stale).latestRevision, 2);
  } finally { await cleanup(dir); }
});

test('dispose 拒绝未知评审、未知决定与缺失 expectedRevision', async () => {
  const dir = await projectWithReviews();
  try {
    const unknown = await runCli(['design', 'dispose', '--project', dir, '-r', 'nope', '-d', 'accept', '-e', '1', '--json']);
    assert.equal(unknown.code, 2);
    assert.match(json(unknown).message, /nope/);
    const badDecision = await runCli(['design', 'dispose', '--project', dir, '-r', 'r1', '-d', 'maybe', '-e', '1', '--json']);
    assert.equal(badDecision.code, 2);
    const noRevision = await runCli(['design', 'dispose', '--project', dir, '-r', 'r1', '-d', 'accept', '--json']);
    assert.equal(noRevision.code, 2);
    assert.equal((await show(dir)).expectedRevision, 1, '失败不写入');
  } finally { await cleanup(dir); }
});

test('dispose --input 批量处置，--dry-run 不写入', async () => {
  const dir = await projectWithReviews();
  try {
    const batch = path.join(dir, 'batch.json');
    await writeFile(batch, JSON.stringify({ expectedRevision: 1, requestId: 'b', dispositions: [
      { reviewId: 'r1', decision: 'accept', reason: '补充 TTL' }, { reviewId: 'r2', decision: 'defer' },
    ] }), 'utf8');
    const dry = await runCli(['design', 'dispose', '--project', dir, '--input', batch, '--dry-run', '--json']);
    assert.equal(json(dry).dryRun, true);
    assert.equal((await show(dir)).expectedRevision, 1);
    const applied = await runCli(['design', 'dispose', '--project', dir, '--input', batch, '--json']);
    assert.equal(json(applied).revision, 2);
    const statuses = (await show(dir)).revision.reviews.map((item) => item.status);
    assert.deepEqual(statuses, ['accepted', 'deferred']);
  } finally { await cleanup(dir); }
});

test('design review 追加新评审，同 id 只追加意见', async () => {
  const dir = await projectWithReviews();
  try {
    const file = path.join(dir, 'review.json');
    await writeFile(file, JSON.stringify({ expectedRevision: 1, requestId: 'rv', actor: { client: 'second' }, reviews: [
      { id: 'r1', summary: '忽略的摘要', opinions: [{ author: 'B', text: '同意需要 TTL' }] },
      { id: 'r3', summary: '缺少审计日志', priority: 'important', opinions: [{ author: 'B', text: '合规要求' }] },
    ] }), 'utf8');
    const result = await runCli(['design', 'review', '--project', dir, '--input', file, '--json']);
    assert.equal(result.code, 0, result.stdout + result.stderr);
    const reviews = (await show(dir)).revision.reviews;
    assert.equal(reviews.length, 3);
    assert.equal(reviews[0].summary, '缓存失效策略不明确');
    assert.deepEqual(reviews[0].opinions, [{ author: 'B', text: '同意需要 TTL' }]);
    assert.equal(reviews[2].id, 'r3');
  } finally { await cleanup(dir); }
});

test('ready 阶段追加评审自动回到 reviewing', async () => {
  const dir = await makeTempDir('zhusi-review-');
  try {
    await runCli(['init', '--project', dir]);
    const base = path.join(dir, 'b.json');
    await writeFile(base, JSON.stringify({ expectedRevision: 0, stage: 'ready', summary: 'x' }), 'utf8');
    await runCli(['design', 'submit', '--project', dir, '--input', base]);
    const file = path.join(dir, 'r.json');
    await writeFile(file, JSON.stringify({ expectedRevision: 1, reviews: [{ id: 'r', summary: '新问题' }] }), 'utf8');
    const result = json(await runCli(['design', 'review', '--project', dir, '--input', file, '--json']));
    assert.equal(result.stage, 'reviewing');
  } finally { await cleanup(dir); }
});
