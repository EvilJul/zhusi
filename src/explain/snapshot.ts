import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
const excluded = new Set(['.git', '.zhusi', 'node_modules', 'dist', 'coverage', '.next', 'vendor']);
const MAX_FILES = 20_000;
const MAX_FILE_BYTES = 1024 * 1024;

// 直接读取 Git 元数据，避免为获取 commit 而执行任何子进程。
async function readGitCommit(root: string): Promise<string | undefined> {
  try {
    const dotGit = path.join(root, '.git');
    const info = await stat(dotGit);
    let gitDir = dotGit;
    if (info.isFile()) {
      const content = await readFile(dotGit, 'utf8');
      const match = /^gitdir:\s*(.+)$/m.exec(content);
      if (!match) return undefined;
      gitDir = path.resolve(root, match[1]!.trim());
    }
    const head = (await readFile(path.join(gitDir, 'HEAD'), 'utf8')).trim();
    const ref = /^ref:\s*(.+)$/.exec(head);
    if (!ref) return /^[a-f0-9]{7,64}$/i.test(head) ? head : undefined;
    const refName = ref[1]!.trim();
    const direct = await readFile(path.join(gitDir, refName), 'utf8').then((value) => value.trim(), () => undefined);
    if (direct && /^[a-f0-9]{7,64}$/i.test(direct)) return direct;
    const packed = await readFile(path.join(gitDir, 'packed-refs'), 'utf8').catch(() => '');
    for (const line of packed.split(/\r?\n/)) {
      const match = /^([a-f0-9]{7,64})\s+(.+)$/i.exec(line.trim());
      if (match && match[2] === refName) return match[1];
    }
    return undefined;
  } catch {
    return undefined;
  }
}

async function listFiles(root: string, relative = ''): Promise<string[]> {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isSymbolicLink() || (entry.isDirectory() && excluded.has(entry.name))) continue;
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(root, child));
    else if (entry.isFile()) files.push(child);
    if (files.length > MAX_FILES) throw new Error(`Project exceeds the ${MAX_FILES} file snapshot limit.`);
  }
  return files;
}

export interface CodeSnapshot {
  root: string;
  gitCommit?: string;
  fingerprint?: string;
  generatedAt: string;
  tool: string;
  readScope: string[];
  fileCount: number;
}

export async function captureCodeSnapshot(root: string): Promise<CodeSnapshot> {
  const gitCommit = await readGitCommit(root);
  const files = await listFiles(root);
  let fingerprint: string | undefined;
  if (!gitCommit) {
    const hash = createHash('sha256');
    for (const file of files) {
      hash.update(file.replaceAll(path.sep, '/'));
      try {
        const content = await readFile(path.join(root, file));
        hash.update(content.byteLength <= MAX_FILE_BYTES ? content : `oversized:${content.byteLength}`);
      } catch { hash.update('unreadable'); }
    }
    fingerprint = hash.digest('hex');
  }
  return { root, ...(gitCommit ? { gitCommit } : { fingerprint }), generatedAt: new Date().toISOString(), tool: 'zhusi/0.1.0', readScope: files, fileCount: files.length };
}

export async function isSnapshotStale(snapshot: { root: string; gitCommit?: string; fingerprint?: string }): Promise<boolean> {
  const current = await captureCodeSnapshot(snapshot.root);
  return snapshot.gitCommit ? current.gitCommit !== snapshot.gitCommit : current.fingerprint !== snapshot.fingerprint;
}

export function normalizeExplanation(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Explanation input must be a JSON object.');
  const input = payload as Record<string, unknown>;
  const normalizeItems = (key: 'walkthrough' | 'deepDive') => {
    const values = Array.isArray(input[key]) ? input[key] as Record<string, unknown>[] : [];
    return values.map((item, index) => ({
      id: typeof item.id === 'string' ? item.id : `${key}-${index + 1}`,
      summary: typeof item.summary === 'string' ? item.summary : '',
      details: typeof item.details === 'string' ? item.details : undefined,
      evidence: Array.isArray(item.evidence) ? item.evidence.filter((part): part is string => typeof part === 'string') : [],
      classification: item.classification === 'fact' || item.classification === 'intent' ? item.classification : (item.evidence ? 'inferred' : 'unknown'),
      confidence: typeof item.confidence === 'number' ? Math.max(0, Math.min(1, item.confidence)) : 0,
    }));
  };
  return {
    summary: typeof input.summary === 'string' ? input.summary : '',
    walkthrough: normalizeItems('walkthrough'),
    deepDive: normalizeItems('deepDive'),
    limitations: Array.isArray(input.limitations) ? input.limitations.filter((part): part is string => typeof part === 'string') : ['Evidence was not supplied; unsupported conclusions are unknown.'],
    comparisons: Array.isArray(input.comparisons) ? input.comparisons : [],
  };
}
