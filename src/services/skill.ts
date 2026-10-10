import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZhusiError } from '../domain/errors.js';
import { BLOCK_END, BLOCK_START, INSTRUCTION_BLOCK, resolveHosts, type HostDefinition } from '../integrations/hosts.js';

// dist/services/skill.js → 包根目录；仓库与已安装包中同样成立。
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
export const PACKAGE_ROOT = path.resolve(moduleDir, '..', '..');
export const SKILL_SOURCE = path.join(PACKAGE_ROOT, 'skills', 'zhusi', 'SKILL.md');

export type ActionStatus = 'created' | 'updated' | 'unchanged' | 'skipped';

export interface InstallAction {
  host: string;
  kind: 'skill' | 'instructions';
  path: string;
  status: ActionStatus;
}

interface PlannedFile extends InstallAction {
  content: string;
}

const normalize = (value: string) => value.replace(/\r\n/g, '\n');
const readText = (filePath: string): Promise<string | undefined> => readFile(filePath, 'utf8').then((value) => value, () => undefined);

export async function readSkillContent(): Promise<string> {
  try {
    return await readFile(SKILL_SOURCE, 'utf8');
  } catch {
    throw new ZhusiError(`找不到随包发布的 Skill 内容：${SKILL_SOURCE}`, 'RUNTIME_ERROR');
  }
}

/** 只替换受管块，块外的内容原样保留。 */
export function mergeInstructionBlock(existing: string | undefined, block = INSTRUCTION_BLOCK): string {
  if (existing === undefined || existing.trim() === '') return `${block}\n`;
  const start = existing.indexOf(BLOCK_START);
  const end = existing.indexOf(BLOCK_END);
  if (start !== -1 && end > start) {
    const before = existing.slice(0, start);
    const after = existing.slice(end + BLOCK_END.length).replace(/^\n+/, '\n');
    return `${before}${block}${after}`;
  }
  const separator = existing.endsWith('\n') ? '\n' : '\n\n';
  return `${existing}${separator}${block}\n`;
}

async function planSkillFile(host: HostDefinition, filePath: string, content: string, force: boolean): Promise<PlannedFile> {
  const existing = await readText(filePath);
  const status: ActionStatus = existing === undefined
    ? 'created'
    : normalize(existing) === normalize(content) ? 'unchanged' : (force ? 'updated' : 'skipped');
  return { host: host.id, kind: 'skill', path: filePath, status, content };
}

async function planInstructionsFile(host: HostDefinition, filePath: string): Promise<PlannedFile> {
  const existing = await readText(filePath);
  const content = mergeInstructionBlock(existing);
  const status: ActionStatus = existing === undefined
    ? 'created'
    : normalize(existing) === normalize(content) ? 'unchanged' : 'updated';
  return { host: host.id, kind: 'instructions', path: filePath, status, content };
}

export async function installSkill(options: {
  host: string;
  project?: string;
  user?: boolean;
  force?: boolean;
  dryRun?: boolean;
}): Promise<{ base: string; scope: 'project' | 'user'; dryRun: boolean; actions: InstallAction[] }> {
  let hosts: HostDefinition[];
  try {
    hosts = resolveHosts(options.host);
  } catch (error) {
    throw new ZhusiError((error as Error).message, 'INVALID_INPUT');
  }

  const scope = options.user ? 'user' : 'project';
  const base = scope === 'user' ? os.homedir() : path.resolve(options.project ?? process.cwd());
  const skillContent = await readSkillContent();
  const force = Boolean(options.force);

  const planned: PlannedFile[] = [];
  for (const host of hosts) {
    const skillPath = scope === 'user' ? host.userSkillPath : host.projectSkillPath;
    if (skillPath) planned.push(await planSkillFile(host, path.join(base, skillPath), skillContent, force));
    const instructionsPath = scope === 'user' ? host.userInstructionsPath : host.projectInstructionsPath;
    if (instructionsPath) planned.push(await planInstructionsFile(host, path.join(base, instructionsPath)));
  }

  if (!options.dryRun) {
    for (const file of planned) {
      if (file.status === 'skipped' || file.status === 'unchanged') continue;
      await mkdir(path.dirname(file.path), { recursive: true });
      await writeFile(file.path, file.content, 'utf8');
    }
  }

  return {
    base,
    scope,
    dryRun: Boolean(options.dryRun),
    actions: planned.map(({ host, kind, path: filePath, status }) => ({ host, kind, path: filePath, status })),
  };
}
