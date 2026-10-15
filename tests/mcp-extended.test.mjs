import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createZhusiServer } from '../dist/mcp/server.js';
import { cleanup, makeTempDir, runCli } from './helpers.mjs';

async function initialized() {
  const dir = await makeTempDir('zhusi-mcpx-');
  const init = JSON.parse((await runCli(['init', '--project', dir, '--json'])).stdout);
  return { dir, projectId: init.projectId };
}

async function connect(roots) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createZhusiServer(roots);
  await server.connect(serverTransport);
  const client = new Client({ name: 'zhusi-test', version: '1.0.0' });
  await client.connect(clientTransport);
  return { client, server };
}

const payload = (result) => JSON.parse(result.content[0].text);

test('多项目：project 参数选择项目，默认使用第一个，拒绝未注册路径', async () => {
  const a = await initialized();
  const b = await initialized();
  const outside = await makeTempDir('zhusi-outside-');
  const { client, server } = await connect([a.dir, b.dir]);
  try {
    const listed = payload(await client.callTool({ name: 'zhusi_list_projects', arguments: {} }));
    assert.deepEqual(listed.projects.map((entry) => entry.projectId), [a.projectId, b.projectId]);
    assert.equal(listed.projects[0].default, true);

    await client.callTool({ name: 'zhusi_submit_design', arguments: { project: b.dir, expectedRevision: 0, requestId: 'b1', summary: 'B 项目' } });
    assert.equal(payload(await client.callTool({ name: 'zhusi_status', arguments: { project: b.dir } })).revision, 1);
    assert.equal(payload(await client.callTool({ name: 'zhusi_status', arguments: {} })).revision, 0, '默认项目不受影响');

    const denied = await client.callTool({ name: 'zhusi_read_design', arguments: { project: outside } });
    assert.equal(denied.isError, true);
    assert.equal(payload(denied).code, 'INVALID_INPUT');
    assert.match(payload(denied).message, /未在此 MCP 服务器注册/);
  } finally { await client.close(); await server.close(); await cleanup(a.dir); await cleanup(b.dir); await cleanup(outside); }
});

test('资源：项目列表、设计 JSON、Markdown 摘要与讲解', async () => {
  const a = await initialized();
  const { client, server } = await connect(a.dir);
  try {
    await client.callTool({ name: 'zhusi_submit_design', arguments: { expectedRevision: 0, requestId: 'x', summary: '资源测试。', businessFlows: [{ id: 'f', name: '登录流程', steps: [{ action: '输入密码' }] }] } });
    const resources = await client.listResources();
    const uris = resources.resources.map((entry) => entry.uri);
    assert.ok(uris.includes('zhusi://projects'));
    assert.ok(uris.includes(`zhusi://projects/${a.projectId}/design`));
    assert.ok(uris.includes(`zhusi://projects/${a.projectId}/summary.md`));
    const templates = await client.listResourceTemplates();
    assert.equal(templates.resourceTemplates.length, 3);

    const projects = JSON.parse((await client.readResource({ uri: 'zhusi://projects' })).contents[0].text);
    assert.equal(projects[0].projectId, a.projectId);
    const design = JSON.parse((await client.readResource({ uri: `zhusi://projects/${a.projectId}/design` })).contents[0].text);
    assert.equal(design.expectedRevision, 1);
    const md = (await client.readResource({ uri: `zhusi://projects/${a.projectId}/summary.md` })).contents[0];
    assert.equal(md.mimeType, 'text/markdown');
    assert.match(md.text, /## 业务流程\n### 登录流程/);
    const explanation = JSON.parse((await client.readResource({ uri: `zhusi://projects/${a.projectId}/explanation` })).contents[0].text);
    assert.equal(explanation.explanation, null);
    await assert.rejects(client.readResource({ uri: 'zhusi://projects/unknown-id/design' }));
  } finally { await client.close(); await server.close(); await cleanup(a.dir); }
});

test('提示：三个工作流提示带参数并引用对应工具', async () => {
  const a = await initialized();
  const { client, server } = await connect(a.dir);
  try {
    const prompts = (await client.listPrompts()).prompts.map((entry) => entry.name).sort();
    assert.deepEqual(prompts, ['zhusi_design_session', 'zhusi_explain_codebase', 'zhusi_review_design']);
    const session = await client.getPrompt({ name: 'zhusi_design_session', arguments: { requirement: '做一个预约系统' } });
    assert.match(session.messages[0].content.text, /做一个预约系统/);
    assert.match(session.messages[0].content.text, /zhusi_submit_design/);
    const review = await client.getPrompt({ name: 'zhusi_review_design', arguments: { reviewer: 'B' } });
    assert.match(review.messages[0].content.text, /zhusi_add_reviews/);
    const explain = await client.getPrompt({ name: 'zhusi_explain_codebase', arguments: { existing: '/src/app' } });
    assert.match(explain.messages[0].content.text, /\/src\/app/);
  } finally { await client.close(); await server.close(); await cleanup(a.dir); }
});

test('dispose_reviews 工具：未知评审返回结构化错误，成功后写回', async () => {
  const a = await initialized();
  const { client, server } = await connect(a.dir);
  try {
    await client.callTool({ name: 'zhusi_submit_design', arguments: { expectedRevision: 0, requestId: 's', reviews: [{ id: 'r1', summary: '问题' }] } });
    const bad = await client.callTool({ name: 'zhusi_dispose_reviews', arguments: { expectedRevision: 1, dispositions: [{ reviewId: 'zz', decision: 'accepted' }] } });
    assert.equal(bad.isError, true);
    const ok = payload(await client.callTool({ name: 'zhusi_dispose_reviews', arguments: { expectedRevision: 1, requestId: 'd', dispositions: [{ reviewId: 'r1', decision: 'deferred', reason: '下期' }] } }));
    assert.equal(ok.revision, 2);
    const read = payload(await client.callTool({ name: 'zhusi_read_design', arguments: {} }));
    assert.equal(read.revision.reviews[0].disposition.reason, '下期');
  } finally { await client.close(); await server.close(); await cleanup(a.dir); }
});

test('CLI mcp 任一项目未初始化即拒绝启动', async () => {
  const a = await initialized();
  const empty = await makeTempDir('zhusi-empty-');
  try {
    const result = await runCli(['mcp', '--project', a.dir, '--project', empty]);
    assert.equal(result.code, 2);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /尚未初始化/);
  } finally { await cleanup(a.dir); await cleanup(empty); }
});
