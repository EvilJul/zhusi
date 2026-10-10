import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createZhusiServer } from '../dist/mcp/server.js';
import { cliPath, cleanup, makeTempDir, runCli } from './helpers.mjs';

const EXPECTED_TOOLS = [
  'zhusi_read_design',
  'zhusi_render_report',
  'zhusi_save_explanation',
  'zhusi_status',
  'zhusi_submit_design',
  'zhusi_validate',
];

async function initializedProject() {
  const dir = await makeTempDir('zhusi-mcp-');
  await runCli(['init', '--project', dir, '--json']);
  return dir;
}

async function connect(dir) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createZhusiServer(dir);
  await server.connect(serverTransport);
  const client = new Client({ name: 'zhusi-test', version: '1.0.0' });
  await client.connect(clientTransport);
  return { client, server };
}

const payload = (result) => JSON.parse(result.content[0].text);

test('服务器列出全部 zhusi 工具并带输入 schema', async () => {
  const dir = await initializedProject();
  const { client, server } = await connect(dir);
  try {
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), EXPECTED_TOOLS);
    const submit = tools.tools.find((tool) => tool.name === 'zhusi_submit_design');
    assert.ok(submit.inputSchema.properties.expectedRevision, '提交工具应声明 expectedRevision');
  } finally { await client.close(); await server.close(); await cleanup(dir); }
});

test('读取设计在空项目返回 expectedRevision 0', async () => {
  const dir = await initializedProject();
  const { client, server } = await connect(dir);
  try {
    const data = payload(await client.callTool({ name: 'zhusi_read_design', arguments: {} }));
    assert.equal(data.expectedRevision, 0);
    assert.equal(data.revision, null);
  } finally { await client.close(); await server.close(); await cleanup(dir); }
});

test('提交设计写入 revision 并可读回', async () => {
  const dir = await initializedProject();
  const { client, server } = await connect(dir);
  try {
    const submitted = payload(await client.callTool({
      name: 'zhusi_submit_design',
      arguments: { expectedRevision: 0, requestId: 'mcp-1', stage: 'drafting', summary: '通过 MCP 提交' },
    }));
    assert.equal(submitted.created, true);
    assert.equal(submitted.revision, 1);

    const read = payload(await client.callTool({ name: 'zhusi_read_design', arguments: {} }));
    assert.equal(read.expectedRevision, 1);
    assert.equal(read.revision.summary, '通过 MCP 提交');
  } finally { await client.close(); await server.close(); await cleanup(dir); }
});

test('过期提交返回冲突错误且服务器仍可用', async () => {
  const dir = await initializedProject();
  const { client, server } = await connect(dir);
  try {
    await client.callTool({ name: 'zhusi_submit_design', arguments: { expectedRevision: 0, requestId: 'a' } });
    const conflict = await client.callTool({ name: 'zhusi_submit_design', arguments: { expectedRevision: 0, requestId: 'b' } });
    assert.equal(conflict.isError, true);
    const envelope = payload(conflict);
    assert.equal(envelope.code, 'REVISION_CONFLICT');
    assert.equal(envelope.latestRevision, 1);

    // 失败后连接仍可继续使用
    const read = payload(await client.callTool({ name: 'zhusi_read_design', arguments: {} }));
    assert.equal(read.expectedRevision, 1);
  } finally { await client.close(); await server.close(); await cleanup(dir); }
});

test('相同 requestId 重试不新增 revision', async () => {
  const dir = await initializedProject();
  const { client, server } = await connect(dir);
  try {
    const args = { expectedRevision: 0, requestId: 'same', stage: 'drafting' };
    const first = payload(await client.callTool({ name: 'zhusi_submit_design', arguments: args }));
    const retry = payload(await client.callTool({ name: 'zhusi_submit_design', arguments: args }));
    assert.equal(first.created, true);
    assert.equal(retry.created, false);
    assert.equal(retry.revision, 1);
  } finally { await client.close(); await server.close(); await cleanup(dir); }
});

test('ready 阶段存在未解决 blocker 返回阶段错误', async () => {
  const dir = await initializedProject();
  const { client, server } = await connect(dir);
  try {
    const result = await client.callTool({
      name: 'zhusi_submit_design',
      arguments: { expectedRevision: 0, requestId: 'r', stage: 'ready', questions: [{ id: 'q1', summary: '是否支持取消', priority: 'blocker', status: 'open' }] },
    });
    assert.equal(result.isError, true);
    assert.equal(payload(result).code, 'STAGE_NOT_READY');
  } finally { await client.close(); await server.close(); await cleanup(dir); }
});

test('validate 与 render_report 返回可用结果', async () => {
  const dir = await initializedProject();
  const { client, server } = await connect(dir);
  try {
    const validation = payload(await client.callTool({ name: 'zhusi_validate', arguments: {} }));
    assert.equal(validation.ok, true);
    assert.deepEqual(validation.errors, []);

    const report = payload(await client.callTool({ name: 'zhusi_render_report', arguments: {} }));
    assert.equal(report.ok, true);
    assert.ok(report.path.endsWith('index.html'));
  } finally { await client.close(); await server.close(); await cleanup(dir); }
});

test('status 返回阶段与陈旧指示', async () => {
  const dir = await initializedProject();
  const { client, server } = await connect(dir);
  try {
    const data = payload(await client.callTool({ name: 'zhusi_status', arguments: {} }));
    assert.equal(data.ok, true);
    assert.equal(data.revision, 0);
    assert.equal(data.stage, 'idea');
    assert.equal(data.stale.explanation, false);
  } finally { await client.close(); await server.close(); await cleanup(dir); }
});

test('save_explanation 保存讲解快照', async () => {
  const dir = await initializedProject();
  const code = await makeTempDir('zhusi-code-');
  const { client, server } = await connect(dir);
  try {
    await mkdir(code, { recursive: true });
    await writeFile(path.join(code, 'main.js'), 'export const run = () => 1;\n', 'utf8');
    const saved = payload(await client.callTool({
      name: 'zhusi_save_explanation',
      arguments: { existing: code, summary: '单一入口脚本', walkthrough: [{ id: 'w1', summary: '调用 run', evidence: ['main.js:1'] }] },
    }));
    assert.equal(saved.ok, true);
    assert.equal(saved.revision, 1);
    assert.ok(saved.sourceSnapshot.fingerprint || saved.sourceSnapshot.gitCommit);
  } finally { await client.close(); await server.close(); await cleanup(dir); await cleanup(code); }
});

test('非法参数返回输入错误而不是崩溃', async () => {
  const dir = await initializedProject();
  const { client, server } = await connect(dir);
  try {
    const result = await client.callTool({ name: 'zhusi_submit_design', arguments: { expectedRevision: -1 } });
    assert.equal(result.isError, true);
    const still = payload(await client.callTool({ name: 'zhusi_validate', arguments: {} }));
    assert.equal(still.ok, true);
  } finally { await client.close(); await server.close(); await cleanup(dir); }
});

test('进程级 stdio 握手成功且 stdout 只承载协议', async () => {
  const dir = await initializedProject();
  const transport = new StdioClientTransport({ command: process.execPath, args: [cliPath, 'mcp', '--project', dir] });
  const client = new Client({ name: 'zhusi-stdio-test', version: '1.0.0' });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), EXPECTED_TOOLS);
    const data = payload(await client.callTool({ name: 'zhusi_read_design', arguments: {} }));
    assert.equal(data.expectedRevision, 0);
  } finally { await client.close(); await cleanup(dir); }
});

test('未初始化目录拒绝启动且不污染 stdout', async () => {
  const dir = await makeTempDir('zhusi-mcp-');
  try {
    const result = await runCli(['mcp', '--project', dir]);
    assert.equal(result.code, 2);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /尚未初始化/);
  } finally { await cleanup(dir); }
});
