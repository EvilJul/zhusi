import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { DesignRevisionInputSchema, DesignRevisionSchema, ExplanationInputSchema, ExplanationSchema, MAX_SNAPSHOT_BYTES, parseVersioned, ProjectConfigSchema, SCHEMA_VERSION, StateSchema, type DesignRevision, type Explanation, type ProjectConfig, type WorkspaceState } from '../domain/schema.js';
import { ZhusiError } from '../domain/errors.js';

const workspaceName = '.zhusi';
const isoNow = () => new Date().toISOString();
const pad = (value: number) => String(value).padStart(6, '0');

export async function resolveProjectRoot(project = process.cwd()): Promise<string> {
  const resolved = path.resolve(project);
  await mkdir(resolved, { recursive: true });
  return realpath(resolved);
}

export class Workspace {
  readonly root: string;
  readonly dir: string;

  private constructor(root: string) {
    this.root = root;
    this.dir = path.join(root, workspaceName);
  }

  static async at(project = process.cwd()): Promise<Workspace> {
    return new Workspace(await resolveProjectRoot(project));
  }

  async initialize(): Promise<{ config: ProjectConfig; state: WorkspaceState; created: boolean }> {
    const exists = await stat(this.dir).then(() => true, () => false);
    if (exists) return { ...(await this.readCore()), created: false };
    await mkdir(this.dir, { recursive: false });
    await Promise.all(['revisions', 'architecture-explanations', 'reports', 'lock'].map((name) => mkdir(path.join(this.dir, name), { recursive: true })));
    const now = isoNow();
    const config = ProjectConfigSchema.parse({ schemaVersion: SCHEMA_VERSION, projectId: randomUUID(), createdAt: now, root: this.root });
    const state = StateSchema.parse({ schemaVersion: SCHEMA_VERSION, projectId: config.projectId, currentRevision: 0, currentExplanation: 0, updatedAt: now });
    await this.writeJsonAtomic(path.join(this.dir, 'config.json'), config);
    await this.writeJsonAtomic(path.join(this.dir, 'state.json'), state);
    return { config, state, created: true };
  }

  async readCore(): Promise<{ config: ProjectConfig; state: WorkspaceState }> {
    return { config: await this.readJson('config.json', ProjectConfigSchema), state: await this.readJson('state.json', StateSchema) };
  }

  async readRevision(revision?: number): Promise<DesignRevision | null> {
    const { state } = await this.readCore();
    const number = revision ?? state.currentRevision;
    if (!number) return null;
    return this.readJson(path.join('revisions', `${pad(number)}.json`), DesignRevisionSchema);
  }

  async readExplanation(revision?: number): Promise<Explanation | null> {
    const { state } = await this.readCore();
    const number = revision ?? state.currentExplanation;
    if (!number) return null;
    return this.readJson(path.join('architecture-explanations', `${pad(number)}.json`), ExplanationSchema);
  }

  async withLock<T>(operation: () => Promise<T>, timeoutMs = 3000): Promise<T> {
    const lockPath = path.join(this.dir, 'lock', 'owner.json');
    await mkdir(path.dirname(lockPath), { recursive: true });
    // 进程被信号中断时也要释放锁，避免留下陈旧锁。
    const releaseOnExit = () => { try { rmSync(lockPath, { force: true }); } catch { /* 已释放 */ } };
    const started = Date.now();
    let handle;
    while (!handle) {
      try {
        handle = await open(lockPath, 'wx');
        await handle.writeFile(JSON.stringify({ pid: process.pid, createdAt: isoNow() }));
        process.once('exit', releaseOnExit);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        if (Date.now() - started >= timeoutMs) throw new ZhusiError('项目正被另一个进程占用，请稍后重试或查看 .zhusi/lock/owner.json。', 'PROJECT_BUSY', true);
        await delay(50);
      }
    }
    try { return await operation(); }
    finally {
      await handle.close();
      process.removeListener('exit', releaseOnExit);
      await rm(lockPath, { force: true });
    }
  }

  async commitRevision(input: unknown, expectedRevision: number): Promise<{ revision: DesignRevision; created: boolean }> {
    return this.withLock(async () => {
      const { config, state } = await this.readCore();
      const parsed = DesignRevisionInputSchema.parse(input);
      if (parsed.projectId !== config.projectId) throw new ZhusiError('提交的 projectId 与当前工作空间不一致。', 'INVALID_INPUT');
      const prior = await this.findRequest<DesignRevision>('revisions', parsed.requestId);
      if (prior) return { revision: prior, created: false };
      if (state.currentRevision !== expectedRevision) throw new ZhusiError('版本已变化，请重新读取最新 revision 后再提交。', 'REVISION_CONFLICT', false, state.currentRevision);
      const revision = DesignRevisionSchema.parse({ ...parsed, revision: state.currentRevision + 1, createdAt: isoNow() });
      await this.writeJsonAtomic(path.join(this.dir, 'revisions', `${pad(revision.revision)}.json`), revision);
      await this.writeJsonAtomic(path.join(this.dir, 'state.json'), { ...state, currentRevision: revision.revision, updatedAt: isoNow() });
      return { revision, created: true };
    });
  }

  async commitExplanation(input: unknown): Promise<Explanation> {
    return this.withLock(async () => {
      const { config, state } = await this.readCore();
      const parsed = ExplanationInputSchema.parse(input);
      if (parsed.projectId !== config.projectId) throw new ZhusiError('讲解的 projectId 与当前工作空间不一致。', 'INVALID_INPUT');
      const prior = await this.findRequest<Explanation>('architecture-explanations', parsed.requestId);
      if (prior) return prior;
      const revision = state.currentExplanation + 1;
      const explanation = ExplanationSchema.parse({ ...parsed, revision, createdAt: isoNow() });
      await this.writeJsonAtomic(path.join(this.dir, 'architecture-explanations', `${pad(revision)}.json`), explanation);
      await this.writeJsonAtomic(path.join(this.dir, 'state.json'), { ...state, currentExplanation: revision, updatedAt: isoNow() });
      return explanation;
    });
  }

  async validate(): Promise<string[]> {
    const errors: string[] = [];
    try {
      const { state } = await this.readCore();
      if (state.currentRevision && !(await this.readRevision())) errors.push('当前 revision 指针指向的快照缺失。');
      if (state.currentExplanation && !(await this.readExplanation())) errors.push('当前架构讲解指针指向的快照缺失。');
      for (const folder of ['revisions', 'architecture-explanations']) {
        const dir = path.join(this.dir, folder);
        for (const file of await readdir(dir).catch(() => [])) {
          if (!file.endsWith('.json')) continue;
          try { await this.readJson(path.join(folder, file), (folder === 'revisions' ? DesignRevisionSchema : ExplanationSchema) as never); }
          catch (error) { errors.push(`${path.join(folder, file)}: ${(error as Error).message}`); }
        }
      }
    } catch (error) { errors.push((error as Error).message); }
    return errors;
  }

  async repairPlan(): Promise<string[]> {
    const actions: string[] = [];
    try {
      const { state } = await this.readCore();
      for (const [folder, pointer] of [['revisions', state.currentRevision], ['architecture-explanations', state.currentExplanation]] as const) {
        const files = await readdir(path.join(this.dir, folder)).catch(() => []);
        for (const file of files.filter((entry) => entry.endsWith('.json'))) {
          if (file !== `${pad(pointer)}.json` && Number(file.slice(0, 6)) > pointer) actions.push(`Orphan snapshot: ${path.join(folder, file)}`);
        }
      }
    } catch (error) { actions.push(`Cannot inspect workspace: ${(error as Error).message}`); }
    const lock = path.join(this.dir, 'lock', 'owner.json');
    try {
      const info = await stat(lock);
      actions.push(`Lock exists (${Math.round((Date.now() - info.mtimeMs) / 1000)}s old); verify owner before removal.`);
    } catch { /* No lock to report. */ }
    return actions;
  }

  private async findRequest<T extends { requestId: string }>(folder: string, requestId: string): Promise<T | null> {
    for (const file of await readdir(path.join(this.dir, folder)).catch(() => [])) {
      if (!file.endsWith('.json')) continue;
      try {
        const value = JSON.parse(await readFile(path.join(this.dir, folder, file), 'utf8')) as T;
        if (value.requestId === requestId) return value;
      } catch { /* Validation reports malformed snapshots separately. */ }
    }
    return null;
  }

  private async readJson<T>(relative: string, schema: { parse: (value: unknown) => T }): Promise<T> {
    const filePath = path.resolve(this.dir, relative);
    if (!filePath.startsWith(`${this.dir}${path.sep}`)) throw new ZhusiError('拒绝访问工作空间之外的路径。', 'INVALID_INPUT');
    const info = await stat(filePath);
    if (info.size > MAX_SNAPSHOT_BYTES) throw new ZhusiError(`文件超过 ${MAX_SNAPSHOT_BYTES} 字节上限：${relative}`, 'INVALID_INPUT');
    const data = JSON.parse(await readFile(filePath, 'utf8')) as unknown;
    return parseVersioned(schema as never, data) as T;
  }

  private async writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
    const payload = `${JSON.stringify(value, null, 2)}\n`;
    if (Buffer.byteLength(payload) > MAX_SNAPSHOT_BYTES) throw new ZhusiError('快照超过 5 MiB 上限。', 'INVALID_INPUT');
    await mkdir(path.dirname(filePath), { recursive: true });
    const temp = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temp, payload, { flag: 'wx' });
    try { await rename(temp, filePath); }
    catch (error) { await rm(temp, { force: true }); throw error; }
  }
}
