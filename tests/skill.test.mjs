import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { BLOCK_END, BLOCK_START, HOST_IDS, INSTRUCTION_BLOCK, resolveHosts } from '../dist/integrations/hosts.js';
import { installSkill, mergeInstructionBlock, readSkillContent, SKILL_SOURCE } from '../dist/services/skill.js';
import { cleanup, makeTempDir, runCli } from './helpers.mjs';

test('宿主注册表解析单个、全部与未知宿主', () => {
  assert.deepEqual(resolveHosts('codex').map((host) => host.id), ['codex']);
  assert.deepEqual(resolveHosts('all').map((host) => host.id), HOST_IDS);
  assert.throws(() => resolveHosts('vscode'), /codex.*claude.*cursor.*all/);
});

test('受管块在无块文件中追加且保留原有内容', () => {
  const original = '# 我的项目\n\n原有说明。\n';
  const merged = mergeInstructionBlock(original);
  assert.ok(merged.startsWith(original.slice(0, -1)));
  assert.ok(merged.includes('原有说明。'));
  assert.ok(merged.includes(BLOCK_START) && merged.includes(BLOCK_END));
});

test('重复合并不产生第二个受管块', () => {
  const once = mergeInstructionBlock('# 项目\n\n说明。\n');
  const twice = mergeInstructionBlock(once);
  assert.equal(twice, once);
  assert.equal(once.split(BLOCK_START).length - 1, 1);
});

test('受管块内容变化时原地替换，块外内容不变', () => {
  const withOld = `# 项目\n\n说明。\n\n${BLOCK_START}\n旧的块内容\n${BLOCK_END}\n\n尾部说明。\n`;
  const merged = mergeInstructionBlock(withOld);
  assert.ok(merged.includes('旧的') === false);
  assert.ok(merged.includes('说明。'));
  assert.ok(merged.includes('尾部说明。'));
  assert.equal(merged.split(BLOCK_START).length - 1, 1);
});

test('随包 Skill 内容可读取并写明关键规则', async () => {
  const content = await readSkillContent();
  assert.ok(content.includes('design show'));
  assert.ok(content.includes('design submit'));
  assert.ok(content.includes('expectedRevision'));
  assert.ok(content.includes('requestId'));
  assert.ok(SKILL_SOURCE.includes(path.join('skills', 'zhusi', 'SKILL.md')));
});

test('安装 Skill 与指令文件，重复安装未变', async () => {
  const dir = await makeTempDir('zhusi-install-');
  try {
    await writeFile(path.join(dir, 'AGENTS.md'), '# 项目\n\n原有说明。\n', 'utf8');
    const first = await installSkill({ host: 'codex', project: dir });
    assert.deepEqual(first.actions.map((action) => action.status), ['created', 'updated']);
    const skill = await readFile(path.join(dir, '.agents', 'skills', 'zhusi', 'SKILL.md'), 'utf8');
    assert.ok(skill.includes('design submit'));
    const agents = await readFile(path.join(dir, 'AGENTS.md'), 'utf8');
    assert.ok(agents.includes('原有说明。'));
    assert.ok(agents.includes(BLOCK_START));

    const second = await installSkill({ host: 'codex', project: dir });
    assert.deepEqual(second.actions.map((action) => action.status), ['unchanged', 'unchanged']);
  } finally { await cleanup(dir); }
});

test('本地修改后跳过，加 --force 才覆盖', async () => {
  const dir = await makeTempDir('zhusi-install-');
  try {
    await installSkill({ host: 'codex', project: dir });
    const skillPath = path.join(dir, '.agents', 'skills', 'zhusi', 'SKILL.md');
    await writeFile(skillPath, '本地修改\n', 'utf8');

    const skipped = await installSkill({ host: 'codex', project: dir });
    assert.equal(skipped.actions[0].status, 'skipped');
    assert.equal(await readFile(skillPath, 'utf8'), '本地修改\n');

    const forced = await installSkill({ host: 'codex', project: dir, force: true });
    assert.equal(forced.actions[0].status, 'updated');
    assert.ok((await readFile(skillPath, 'utf8')).includes('design submit'));
  } finally { await cleanup(dir); }
});

test('dry-run 报告计划但不写入', async () => {
  const dir = await makeTempDir('zhusi-install-');
  try {
    const result = await installSkill({ host: 'all', project: dir, dryRun: true });
    assert.equal(result.dryRun, true);
    assert.ok(result.actions.length > 0);
    assert.ok(result.actions.every((action) => action.status === 'created'));
    await assert.rejects(() => readFile(path.join(dir, '.agents', 'skills', 'zhusi', 'SKILL.md')));
  } finally { await cleanup(dir); }
});

test('CLI 安装 codex 并输出 JSON 动作列表', async () => {
  const dir = await makeTempDir('zhusi-install-');
  try {
    const result = await runCli(['install-skill', '--host', 'codex', '--project', dir, '--json']);
    assert.equal(result.code, 0);
    const data = JSON.parse(result.stdout);
    assert.equal(data.scope, 'project');
    assert.deepEqual(data.actions.map((action) => action.status), ['created', 'created']);
    assert.equal(result.stderr, '');
  } finally { await cleanup(dir); }
});

test('CLI 未知宿主返回退出码 2 并列出可用值', async () => {
  const dir = await makeTempDir('zhusi-install-');
  try {
    const result = await runCli(['install-skill', '--host', 'vscode', '--project', dir, '--json']);
    assert.equal(result.code, 2);
    const envelope = JSON.parse(result.stdout);
    assert.equal(envelope.code, 'INVALID_INPUT');
    assert.match(envelope.message, /codex、claude、cursor、all/);
  } finally { await cleanup(dir); }
});

test('CLI --dry-run 不创建任何文件', async () => {
  const dir = await makeTempDir('zhusi-install-');
  try {
    const result = await runCli(['install-skill', '--host', 'all', '--project', dir, '--dry-run', '--json']);
    assert.equal(result.code, 0);
    assert.equal(JSON.parse(result.stdout).dryRun, true);
    await assert.rejects(() => readFile(path.join(dir, '.cursor', 'rules', 'zhusi.mdc')));
  } finally { await cleanup(dir); }
});

test('CLI --user 写入用户配置目录而非项目', async () => {
  const home = await makeTempDir('zhusi-home-');
  const project = await makeTempDir('zhusi-install-');
  try {
    const result = await runCli(
      ['install-skill', '--host', 'codex', '--user', '--json'],
      { cwd: project, env: { HOME: home, USERPROFILE: home } },
    );
    assert.equal(result.code, 0);
    const skill = await readFile(path.join(home, '.codex', 'skills', 'zhusi', 'SKILL.md'), 'utf8');
    assert.ok(skill.includes('design show'));
    await assert.rejects(() => readFile(path.join(project, '.agents', 'skills', 'zhusi', 'SKILL.md')));
  } finally { await cleanup(home); await cleanup(project); }
});

test('指令块内容包含作者命令与退出码说明', () => {
  assert.ok(INSTRUCTION_BLOCK.includes('design show'));
  assert.ok(INSTRUCTION_BLOCK.includes('design submit'));
  assert.ok(INSTRUCTION_BLOCK.includes('expectedRevision'));
  assert.ok(INSTRUCTION_BLOCK.includes(BLOCK_START) && INSTRUCTION_BLOCK.includes(BLOCK_END));
});
