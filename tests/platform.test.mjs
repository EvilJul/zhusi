import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Workspace } from '../dist/storage/workspace.js';
import { captureCodeSnapshot } from '../dist/explain/snapshot.js';
import { cleanup, makeTempDir, runCli } from './helpers.mjs';

test('含空格与 Unicode 的项目路径可完成 init/status/report', async () => {
  const base = await makeTempDir();
  const dir = path.join(base, '项目 with spaces 你好');
  try {
    await mkdir(dir, { recursive: true });
    const init = await runCli(['init', '--project', dir, '--json']);
    assert.equal(init.code, 0);
    assert.equal(JSON.parse(init.stdout).created, true);

    const status = await runCli(['status', '--project', dir, '--json']);
    assert.equal(status.code, 0);
    assert.ok(JSON.parse(status.stdout).root.includes('你好'));

    const report = await runCli(['report', '--project', dir, '--json']);
    assert.equal(report.code, 0);
    assert.ok((await readFile(JSON.parse(report.stdout).path, 'utf8')).length > 0);
  } finally { await cleanup(base); }
});

test('CRLF 行结尾的 JSON 与 LF 等价解析', async () => {
  const dir = await makeTempDir();
  try {
    const workspace = await Workspace.at(dir);
    await workspace.initialize();
    const statePath = path.join(dir, '.zhusi', 'state.json');
    const lf = await readFile(statePath, 'utf8');
    await writeFile(statePath, lf.replace(/\n/g, '\r\n'), 'utf8');
    const { state } = await workspace.readCore();
    assert.equal(state.currentRevision, 0);
    assert.deepEqual(await workspace.validate(), []);
  } finally { await cleanup(dir); }
});

test('相对路径与绝对路径 --project 解析到同一项目根', async () => {
  const base = await makeTempDir();
  const dir = path.join(base, 'proj');
  try {
    await mkdir(dir, { recursive: true });
    const fromCwd = await runCli(['init', '--project', '.', '--json'], { cwd: dir });
    assert.equal(fromCwd.code, 0);
    const absolute = await runCli(['status', '--project', dir, '--json'], { cwd: base });
    const relative = await runCli(['status', '--project', 'proj', '--json'], { cwd: base });
    assert.equal(JSON.parse(absolute.stdout).projectId, JSON.parse(fromCwd.stdout).projectId);
    assert.equal(JSON.parse(relative.stdout).projectId, JSON.parse(fromCwd.stdout).projectId);
  } finally { await cleanup(base); }
});

test('代码快照跳过符号链接，不越过项目边界', async (t) => {
  const dir = await makeTempDir();
  const outside = await makeTempDir('zhusi-outside-');
  try {
    await writeFile(path.join(dir, 'inside.js'), 'export const x = 1;\n', 'utf8');
    await writeFile(path.join(outside, 'secret.js'), 'export const secret = 1;\n', 'utf8');
    await mkdir(path.join(dir, 'nested'), { recursive: true });
    try {
      await symlink(outside, path.join(dir, 'nested', 'link'), 'junction');
    } catch (error) {
      if (error.code === 'EPERM' || error.code === 'ENOTSUP') { t.skip('当前平台不允许创建符号链接'); return; }
      throw error;
    }
    const snapshot = await captureCodeSnapshot(dir);
    assert.ok(snapshot.readScope.includes('inside.js'));
    assert.ok(!snapshot.readScope.some((entry) => entry.includes('secret')));
  } finally { await cleanup(dir); await cleanup(outside); }
});

test('只读项目目录下的权限错误给出明确诊断', async (t) => {
  if (process.platform === 'win32') { t.skip('Windows 权限模型与 POSIX 不同，由 CI 在其他平台覆盖'); return; }
  const dir = await makeTempDir();
  try {
    const workspace = await Workspace.at(dir);
    await workspace.initialize();
    const { chmod } = await import('node:fs/promises');
    await chmod(path.join(dir, '.zhusi', 'state.json'), 0o000);
    const result = await runCli(['validate', '--project', dir, '--json']);
    assert.notEqual(result.code, 0);
    const envelope = JSON.parse(result.stdout);
    assert.equal(envelope.ok, false);
  } finally { await cleanup(dir); }
});

test('生成的报告不引用网络资源，可离线打开', async () => {
  const dir = await makeTempDir();
  try {
    await runCli(['init', '--project', dir, '--json']);
    const report = await runCli(['report', '--project', dir, '--json']);
    const html = await readFile(JSON.parse(report.stdout).path, 'utf8');
    assert.ok(html.startsWith('<!doctype html>'));
    assert.ok(!/https?:\/\//i.test(html), '报告不应包含外部 URL');
    assert.ok(!/<script/i.test(html), '报告不应包含脚本标签');
  } finally { await cleanup(dir); }
});
