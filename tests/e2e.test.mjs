// 端到端：通过真实 stdio 进程模拟“需求→提案→评审→修订”，以及第二个客户端的异步评审。
// 这是协议级自动化模拟，不等同于在 Codex / Claude / Cursor 中的真人驾驶验证。
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { cliPath, cleanup, makeTempDir, runCli } from './helpers.mjs';

const payload = (result) => {
  assert.notEqual(result.isError, true, result.content?.[0]?.text);
  return JSON.parse(result.content[0].text);
};

async function spawnClient(name, project) {
  const transport = new StdioClientTransport({ command: process.execPath, args: [cliPath, 'mcp', '--project', project], stderr: 'pipe' });
  const client = new Client({ name, version: '1.0.0' });
  await client.connect(transport);
  return client;
}

test('需求→提案→评审→修订→ready，两个 stdio 客户端异步协作', async () => {
  const dir = await makeTempDir('zhusi-e2e-');
  await runCli(['init', '--project', dir]);
  const author = await spawnClient('author-client', dir);
  let reviewer;
  try {
    // 1. 需求：作者客户端读取空项目并记录需求与阻塞问题
    let read = payload(await author.callTool({ name: 'zhusi_read_design', arguments: {} }));
    assert.equal(read.expectedRevision, 0);
    payload(await author.callTool({ name: 'zhusi_submit_design', arguments: {
      expectedRevision: 0, requestId: 'req', actor: { client: 'author-client' }, stage: 'clarifying',
      summary: '会议室预约。', requirements: [{ id: 'req1', summary: '员工可预约会议室' }],
      questions: [{ id: 'q1', summary: '是否允许跨天预约？', priority: 'blocker', status: 'open' }],
    } }));

    // 2. 提案：补充流程、架构、决策、开发顺序
    read = payload(await author.callTool({ name: 'zhusi_read_design', arguments: {} }));
    const proposal = {
      ...read.revision, expectedRevision: read.expectedRevision, requestId: 'proposal', actor: { client: 'author-client' }, stage: 'reviewing',
      questions: [{ id: 'q1', summary: '是否允许跨天预约？', priority: 'blocker', status: 'resolved', details: '不允许' }],
      businessFlows: [{ id: 'f1', name: '预约会议室', steps: [{ actor: '员工', action: '选择时段' }], exceptions: ['时段冲突：提示换时段'] }],
      architecture: { modules: [{ id: 'api', name: 'API' }, { id: 'db', name: 'DB' }], dependencies: [{ from: 'api', to: 'db' }], links: [] },
      decisions: [{ id: 'd1', summary: '使用 SQLite', status: 'proposed', alternatives: ['PostgreSQL'] }],
      developmentOrder: [{ id: 's1', name: '数据层' }, { id: 's2', name: 'API', dependsOn: ['s1'] }],
    };
    for (const key of ['schemaVersion', 'projectId', 'revision', 'createdAt']) delete proposal[key];
    assert.equal(payload(await author.callTool({ name: 'zhusi_submit_design', arguments: proposal })).revision, 2);

    // 3. 第二个客户端（独立进程）异步读取同一项目并提出评审
    reviewer = await spawnClient('reviewer-client', dir);
    const seen = payload(await reviewer.callTool({ name: 'zhusi_read_design', arguments: {} }));
    assert.equal(seen.expectedRevision, 2);
    assert.equal(seen.revision.actor.client, 'author-client', '评审者能看到提案来源');

    // 并发：作者在评审者提交前先修改了设计 → 评审者提交冲突
    payload(await author.callTool({ name: 'zhusi_add_reviews', arguments: { expectedRevision: 2, requestId: 'self-note', actor: { client: 'author-client' }, reviews: [{ id: 'note', summary: '自查：补充取消流程', priority: 'suggestion' }] } }));
    const conflict = await reviewer.callTool({ name: 'zhusi_add_reviews', arguments: { expectedRevision: 2, requestId: 'rv', reviews: [{ id: 'rv1', summary: 'SQLite 并发写' }] } });
    assert.equal(conflict.isError, true);
    assert.equal(JSON.parse(conflict.content[0].text).code, 'REVISION_CONFLICT');
    assert.equal(JSON.parse(conflict.content[0].text).latestRevision, 3);

    // 评审者重新读取后提交
    const latest = payload(await reviewer.callTool({ name: 'zhusi_read_design', arguments: {} }));
    const reviewArgs = { expectedRevision: latest.expectedRevision, requestId: 'rv-2', actor: { client: 'reviewer-client' }, reviews: [
      { id: 'rv1', summary: 'SQLite 多实例并发写受限', priority: 'important', opinions: [{ author: 'reviewer-client', text: '部署两个实例会锁库' }] },
      { id: 'rv2', summary: '建议引入消息队列', priority: 'suggestion', opinions: [{ author: 'reviewer-client', text: '方便扩展通知' }] },
    ] };
    assert.equal(payload(await reviewer.callTool({ name: 'zhusi_add_reviews', arguments: reviewArgs })).revision, 4);
    // 网络重试：同 requestId 不重复
    const retried = payload(await reviewer.callTool({ name: 'zhusi_add_reviews', arguments: reviewArgs }));
    assert.equal(retried.created, false);

    // 4. 修订：作者处置评审并修订决策，最终 ready
    let current = payload(await author.callTool({ name: 'zhusi_read_design', arguments: {} }));
    assert.equal(current.revision.reviews.length, 3);
    payload(await author.callTool({ name: 'zhusi_dispose_reviews', arguments: { expectedRevision: current.expectedRevision, requestId: 'dispose', actor: { client: 'author-client' }, dispositions: [
      { reviewId: 'rv1', decision: 'accepted', reason: '改用 PostgreSQL' },
      { reviewId: 'rv2', decision: 'rejected', reason: '当前规模不需要队列' },
      { reviewId: 'note', decision: 'deferred' },
    ] } }));
    current = payload(await author.callTool({ name: 'zhusi_read_design', arguments: {} }));
    const revised = { ...current.revision, expectedRevision: current.expectedRevision, requestId: 'revise', stage: 'ready',
      decisions: [{ id: 'd1', summary: '使用 PostgreSQL', status: 'accepted', alternatives: ['SQLite'], rationale: '采纳 rv1' }] };
    for (const key of ['schemaVersion', 'projectId', 'revision', 'createdAt']) delete revised[key];
    const final = payload(await author.callTool({ name: 'zhusi_submit_design', arguments: revised }));
    assert.equal(final.stage, 'ready');
    assert.equal(final.revision, 6);

    // 5. 第二客户端读取最终结果并生成报告：轮次、来源与处置均可追溯
    const view = payload(await reviewer.callTool({ name: 'zhusi_read_design', arguments: {} }));
    assert.deepEqual(view.revision.reviews.map((item) => item.status), ['deferred', 'accepted', 'rejected']);
    assert.equal(view.revision.reviews.find((item) => item.id === 'rv2').disposition.by, 'author-client');
    const report = payload(await reviewer.callTool({ name: 'zhusi_render_report', arguments: {} }));
    const html = await readFile(report.path, 'utf8');
    assert.match(html, /当前规模不需要队列/);
    assert.match(html, /预约会议室/);
    assert.match(html, /部署两个实例会锁库/);
    const validation = payload(await reviewer.callTool({ name: 'zhusi_validate', arguments: {} }));
    assert.deepEqual(validation.errors, []);
  } finally {
    await author.close();
    if (reviewer) await reviewer.close();
    await cleanup(dir);
  }
});

test('客户端重启后可从磁盘状态继续', async () => {
  const dir = await makeTempDir('zhusi-e2e-');
  await runCli(['init', '--project', dir]);
  try {
    const first = await spawnClient('c1', dir);
    payload(await first.callTool({ name: 'zhusi_submit_design', arguments: { expectedRevision: 0, requestId: 'a', summary: '重启前' } }));
    await first.close();
    const second = await spawnClient('c2', dir);
    try {
      const read = payload(await second.callTool({ name: 'zhusi_read_design', arguments: {} }));
      assert.equal(read.expectedRevision, 1);
      assert.equal(read.revision.summary, '重启前');
    } finally { await second.close(); }
  } finally { await cleanup(dir); }
});
