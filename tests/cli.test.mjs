import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { cleanup, cliPath, makeTempDir, repoRoot, runCli } from './helpers.mjs';

test('--help 在非项目目录退出 0 并输出到 stdout', async () => {
  const dir = await makeTempDir();
  try {
    const result = await runCli(['--help'], { cwd: dir });
    assert.equal(result.code, 0);
    assert.match(result.stdout, /init/);
    assert.match(result.stdout, /explain/);
    assert.equal(result.stderr, '');
  } finally { await cleanup(dir); }
});

test('--version 输出包版本', async () => {
  const result = await runCli(['--version']);
  assert.equal(result.code, 0);
  assert.equal(result.stdout.trim(), '0.2.0');
});

test('npm bin 符号链接入口仍输出版本', async (t) => {
  const dir = await makeTempDir();
  const link = path.join(dir, 'zhusi');
  try {
    try {
      await symlink(cliPath, link);
    } catch (error) {
      if (error && (error.code === 'EPERM' || error.code === 'ENOTSUP')) {
        t.skip('当前环境不能创建符号链接');
        return;
      }
      throw error;
    }
    const result = await runCli(['--version'], { entry: link, cwd: dir });
    assert.equal(result.code, 0);
    assert.equal(result.stdout.trim(), '0.2.0');
    assert.equal(result.stderr, '');
  } finally {
    await cleanup(dir);
  }
});

test('未知命令返回非零并给出帮助提示', async () => {
  const result = await runCli(['bogus']);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /zhusi --help/);
  assert.equal(result.stdout, '');
});

test('init/status/validate/report/export 全链路且 JSON 只写 stdout', async () => {
  const dir = await makeTempDir();
  try {
    const init = await runCli(['init', '--project', dir, '--json']);
    assert.equal(init.code, 0);
    assert.equal(JSON.parse(init.stdout).created, true);
    assert.equal(init.stderr, '');

    const status = await runCli(['status', '--project', dir, '--json']);
    assert.equal(status.code, 0);
    const statusData = JSON.parse(status.stdout);
    assert.equal(statusData.revision, 0);
    assert.equal(statusData.stage, 'idea');
    assert.equal(statusData.stale.explanation, false);
    assert.equal(status.stderr, '');

    const validate = await runCli(['validate', '--project', dir, '--json']);
    assert.equal(validate.code, 0);
    assert.deepEqual(JSON.parse(validate.stdout).errors, []);

    const report = await runCli(['report', '--project', dir, '--json']);
    assert.equal(report.code, 0);
    const reportPath = JSON.parse(report.stdout).path;
    const html = await readFile(reportPath, 'utf8');
    assert.ok(html.startsWith('<!doctype html>'));
    assert.ok(!/src=["']http/.test(html), '报告不应引用网络资源');

    const md = await runCli(['export', '--project', dir, '--format', 'markdown', '--json']);
    assert.equal(md.code, 0);
    assert.ok((await readFile(JSON.parse(md.stdout).path, 'utf8')).includes('源 revision'));
  } finally { await cleanup(dir); }
});

test('不支持的导出格式返回无效输入码且不修改快照', async () => {
  const dir = await makeTempDir();
  try {
    await runCli(['init', '--project', dir, '--json']);
    const result = await runCli(['export', '--project', dir, '--format', 'pdf', '--json']);
    assert.equal(result.code, 2);
    const envelope = JSON.parse(result.stdout);
    assert.equal(envelope.ok, false);
    assert.equal(envelope.code, 'INVALID_INPUT');
    assert.equal(envelope.retryable, false);
  } finally { await cleanup(dir); }
});

test('validate 对损坏数据返回退出码 2 且 JSON 仍在 stdout', async () => {
  const dir = await makeTempDir();
  try {
    await runCli(['init', '--project', dir, '--json']);
    await writeFile(path.join(dir, '.zhusi', 'state.json'), '{ broken', 'utf8');
    const result = await runCli(['validate', '--project', dir, '--json']);
    assert.equal(result.code, 2);
    const envelope = JSON.parse(result.stdout);
    assert.equal(envelope.ok, false);
    assert.ok(envelope.errors.length > 0);
  } finally { await cleanup(dir); }
});

test('explain 保存讲解快照且 status 能检测陈旧', async () => {
  const dir = await makeTempDir();
  const code = await makeTempDir('zhusi-code-');
  try {
    await runCli(['init', '--project', dir, '--json']);
    await writeFile(path.join(code, 'main.js'), 'export const run = () => 1;\n', 'utf8');
    const inputPath = path.join(dir, 'explain-input.json');
    await writeFile(inputPath, JSON.stringify({ summary: '入口脚本', walkthrough: [{ id: 'w1', summary: '调用 run', evidence: ['main.js:1'] }] }), 'utf8');

    const explain = await runCli(['explain', '--project', dir, '--existing', code, '--input', inputPath, '--json']);
    assert.equal(explain.code, 0);
    assert.equal(JSON.parse(explain.stdout).revision, 1);

    const stale = await runCli(['status', '--project', dir, '--json']);
    assert.equal(JSON.parse(stale.stdout).stale.explanation, false);

    await writeFile(path.join(code, 'main.js'), 'export const run = () => 2;\n', 'utf8');
    const changed = await runCli(['status', '--project', dir, '--json']);
    assert.equal(JSON.parse(changed.stdout).stale.explanation, true);
  } finally { await cleanup(dir); await cleanup(code); }
});

test('repair 默认只读，孤立快照在 dry-run 中保持原样', async () => {
  const dir = await makeTempDir();
  try {
    await runCli(['init', '--project', dir, '--json']);
    const orphan = path.join(dir, '.zhusi', 'revisions', '000004.json');
    await writeFile(orphan, JSON.stringify({ schemaVersion: 1 }), 'utf8');
    const result = await runCli(['repair', '--project', dir, '--dry-run', '--json']);
    assert.equal(result.code, 0);
    const envelope = JSON.parse(result.stdout);
    assert.equal(envelope.applied, false);
    assert.ok(envelope.actions.some((line) => line.includes('000004.json')));
    assert.ok((await readFile(orphan, 'utf8')).includes('schemaVersion'));
  } finally { await cleanup(dir); }
});

test('打包入口在仓库外运行同一行为', async () => {
  const result = await runCli(['--help'], { cwd: repoRoot });
  assert.equal(result.code, 0);
  assert.match(result.stdout, /Usage: zhusi/);
});

test('未初始化目录的命令给出友好提示并返回 2（含 --json）', async () => {
  const dir = await makeTempDir('zhusi-uninit-');
  try {
    for (const args of [['status'], ['validate'], ['report'], ['design', 'show'], ['export'], ['repair']]) {
      const human = await runCli([...args, '--project', dir]);
      assert.equal(human.code, 2, `${args.join(' ')}: ${human.stderr}`);
      assert.match(human.stderr, /尚未初始化，请先运行 zhusi init/);
      assert.doesNotMatch(human.stderr, /ENOENT/);
      const json = await runCli([...args, '--project', dir, '--json']);
      assert.equal(json.code, 2);
      const envelope = JSON.parse(json.stdout);
      assert.equal(envelope.ok, false);
      assert.equal(envelope.code, 'INVALID_INPUT');
      assert.match(envelope.message, /尚未初始化，请先运行 zhusi init/);
    }
  } finally { await cleanup(dir); }
});

test('用法错误（缺必填选项、未知命令、未知选项）返回 2，help/version 返回 0', async () => {
  assert.equal((await runCli(['explain', '--existing', '.'])).code, 2);
  assert.equal((await runCli(['frobnicate'])).code, 2);
  assert.equal((await runCli(['status', '--no-such-option'])).code, 2);
  assert.equal((await runCli(['--help'])).code, 0);
  assert.equal((await runCli(['--version'])).code, 0);
});
