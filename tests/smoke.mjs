#!/usr/bin/env node
// 打包冒烟：构建 -> npm pack -> 在临时项目安装 tarball -> 运行核心命令。
import assert from 'node:assert/strict';
import { execFileSync, execSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

// Windows 的 cmd.exe 与 POSIX sh 使用不同的引号规则，这里按平台生成安全命令。
const quote = (value) => process.platform === 'win32'
  ? `"${String(value).replace(/"/g, '""')}"`
  : `'${String(value).replace(/'/g, `'\\''`)}'`;
const run = (args, cwd = root) => execSync([npm, ...args].map(quote).join(' '), { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const cliRun = (cliPath, args, cwd) => execFileSync(process.execPath, [cliPath, ...args], { cwd, encoding: 'utf8' });

let projectDir;
const createdTarballs = [];
try {
  console.log('[1/8] 构建与打包');
  run(['run', 'build']);
  const packOutput = run(['pack', '--json']);
  const tarball = path.join(root, JSON.parse(packOutput)[0].filename);
  createdTarballs.push(tarball);

  console.log('[2/8] 在临时项目安装 tarball');
  projectDir = await mkdtemp(path.join(os.tmpdir(), 'zhusi-smoke-'));
  await writeFile(path.join(projectDir, 'package.json'), JSON.stringify({ name: 'smoke', private: true, version: '1.0.0' }), 'utf8');
  run(['install', '--no-audit', '--no-fund', '--no-save', tarball], projectDir);
  const installedCli = path.join(projectDir, 'node_modules', 'zhusi', 'dist', 'cli', 'index.js');

  console.log('[3/8] init 幂等');
  const first = JSON.parse(cliRun(installedCli, ['init', '--project', projectDir, '--json'], projectDir));
  assert.equal(first.created, true);
  const second = JSON.parse(cliRun(installedCli, ['init', '--project', projectDir, '--json'], projectDir));
  assert.equal(second.created, false);
  assert.equal(second.projectId, first.projectId);

  console.log('[4/8] status 与 validate');
  const status = JSON.parse(cliRun(installedCli, ['status', '--project', projectDir, '--json'], projectDir));
  assert.equal(status.revision, 0);
  const validate = JSON.parse(cliRun(installedCli, ['validate', '--project', projectDir, '--json'], projectDir));
  assert.deepEqual(validate.errors, []);

  console.log('[5/8] report 与 explain');
  const report = JSON.parse(cliRun(installedCli, ['report', '--project', projectDir, '--json'], projectDir));
  const html = await readFile(report.path, 'utf8');
  assert.ok(html.startsWith('<!doctype html>'));
  const codeDir = path.join(projectDir, 'existing-code');
  await mkdir(codeDir, { recursive: true });
  await writeFile(path.join(codeDir, 'main.js'), 'export const go = () => 42;\n', 'utf8');
  const inputPath = path.join(projectDir, 'explain.json');
  await writeFile(inputPath, JSON.stringify({ summary: '演示入口', walkthrough: [{ id: 'w1', summary: '调用 go', evidence: ['main.js:1'] }] }), 'utf8');
  const explain = JSON.parse(cliRun(installedCli, ['explain', '--project', projectDir, '--existing', codeDir, '--input', inputPath, '--json'], projectDir));
  assert.equal(explain.revision, 1);

  console.log('[6/8] install-skill 注册（验证 skills/ 随包发布）');
  const install = JSON.parse(cliRun(installedCli, ['install-skill', '--host', 'codex', '--project', projectDir, '--json'], projectDir));
  assert.ok(install.actions.some((action) => action.kind === 'skill' && action.status === 'created'));
  const installedSkill = await readFile(path.join(projectDir, '.agents', 'skills', 'zhusi', 'SKILL.md'), 'utf8');
  assert.ok(installedSkill.includes('design submit'));

  console.log('[7/8] MCP 握手（验证打包产物可作 stdio 服务器）');
  const mcpTransport = new StdioClientTransport({ command: process.execPath, args: [installedCli, 'mcp', '--project', projectDir] });
  const mcpClient = new Client({ name: 'zhusi-smoke', version: '1.0.0' });
  await mcpClient.connect(mcpTransport);
  try {
    const tools = await mcpClient.listTools();
    assert.ok(tools.tools.some((tool) => tool.name === 'zhusi_submit_design'));
    assert.ok(tools.tools.some((tool) => tool.name === 'zhusi_dispose_reviews'));
    assert.ok((await mcpClient.listPrompts()).prompts.length >= 3);
    assert.ok((await mcpClient.listResources()).resources.some((entry) => entry.uri === 'zhusi://projects'));
  } finally {
    await mcpClient.close();
  }

  console.log('[8/8] bin 入口可通过 npm exec 解析');
  const execOut = run(['exec', '--no', '--', 'zhusi', '--version'], projectDir);
  assert.equal(execOut.trim(), '0.1.0');

  console.log('冒烟测试通过：打包产物可独立安装并运行核心命令。');
} finally {
  if (projectDir) await rm(projectDir, { recursive: true, force: true, maxRetries: 3 });
  for (const tarball of createdTarballs) await rm(tarball, { force: true });
  for (const entry of await readdir(root)) {
    if (entry.startsWith('zhusi-') && entry.endsWith('.tgz')) await rm(path.join(root, entry), { force: true });
  }
}
