// 阶段 0 样例：确保两个固定样例可被导入、通过校验，并满足路线图的验收要点。
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { cleanup, makeTempDir, repoRoot, runCli } from './helpers.mjs';

const booking = path.join(repoRoot, 'examples', 'booking-system', 'design.json');
const existing = path.join(repoRoot, 'examples', 'existing-code', 'explanation.json');

test('预约系统样例：异常流程、带备选的决策、被拒绝且有理由的评审', async () => {
  const dir = await makeTempDir('zhusi-sample-');
  try {
    await runCli(['init', '--project', dir]);
    const submit = await runCli(['design', 'submit', '--project', dir, '--input', booking, '--json']);
    assert.equal(submit.code, 0, submit.stdout + submit.stderr);
    const design = JSON.parse((await runCli(['design', 'show', '--project', dir, '--json'])).stdout).revision;
    assert.ok(design.businessFlows.some((flow) => flow.exceptions.length > 0));
    assert.ok(design.decisions.some((decision) => decision.alternatives?.length > 0 && decision.rationale));
    const rejected = design.reviews.find((review) => review.disposition?.decision === 'rejected');
    assert.ok(rejected?.disposition.reason, '被拒绝的评审必须有理由');
    assert.ok(design.developmentOrder.length >= 3);
    assert.deepEqual(JSON.parse((await runCli(['validate', '--project', dir, '--json'])).stdout).errors, []);
    const report = JSON.parse((await runCli(['report', '--project', dir, '--json'])).stdout);
    const html = await readFile(report.path, 'utf8');
    for (const text of ['业务流程', '开发顺序', '已拒绝', '两名患者同时抢同一时段']) assert.ok(html.includes(text), text);
  } finally { await cleanup(dir); }
});

test('已有代码样例：回答启动/流转/依赖，含 unknown 项并区分 fact 与 intent', async () => {
  const sample = JSON.parse(await readFile(existing, 'utf8'));
  const all = [...sample.walkthrough, ...sample.deepDive];
  assert.ok(all.some((item) => item.classification === 'fact'));
  assert.ok(all.some((item) => item.classification === 'intent'));
  const unknown = all.find((item) => item.classification === 'unknown');
  assert.ok(unknown && !unknown.evidence, 'unknown 项不应伪造证据');
  for (const item of all.filter((entry) => entry.classification === 'fact')) {
    for (const ref of item.evidence) {
      const file = ref.split(/[#:]/)[0];
      await readFile(path.join(repoRoot, file), 'utf8'); // 证据文件必须真实存在
    }
  }

  const dir = await makeTempDir('zhusi-sample-');
  try {
    await runCli(['init', '--project', dir]);
    const result = await runCli(['explain', '--project', dir, '--existing', repoRoot, '--input', existing, '--json']);
    assert.equal(result.code, 0, result.stdout + result.stderr);
    const report = JSON.parse((await runCli(['report', '--project', dir, '--json'])).stdout);
    const html = await readFile(report.path, 'utf8');
    assert.match(html, /已有架构讲解/);
    assert.match(html, /网络文件系统/);
  } finally { await cleanup(dir); }
});
