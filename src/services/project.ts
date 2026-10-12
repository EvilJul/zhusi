import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { captureCodeSnapshot, isSnapshotStale, normalizeExplanation } from '../explain/snapshot.js';
import { SCHEMA_VERSION, type DesignRevision, type Explanation } from '../domain/schema.js';
import { Workspace } from '../storage/workspace.js';
import { renderHtml, renderMarkdown } from '../report/render.js';

export async function initializeProject(project?: string) {
  const workspace = await Workspace.at(project);
  return { workspace, ...(await workspace.initialize()) };
}

export async function getStatus(project?: string) {
  const workspace = await Workspace.at(project);
  const { config, state } = await workspace.readCore();
  const [design, explanation, warnings] = await Promise.all([
    workspace.readRevision(),
    workspace.readExplanation(),
    workspace.validate(),
  ]);
  const explanationStale = explanation ? await isSnapshotStale(explanation.sourceSnapshot) : false;
  return {
    workspace,
    projectId: config.projectId,
    root: workspace.root,
    revision: state.currentRevision,
    stage: design?.stage ?? 'idea' as const,
    unresolvedQuestions: design?.questions.filter((item) => item.status !== 'resolved').length ?? 0,
    stale: { report: false, explanation: explanationStale },
    warnings,
    state,
    design,
    explanation,
  };
}

export async function validateProject(project?: string) {
  const workspace = await Workspace.at(project);
  await workspace.ensureInitialized(); // 未初始化属于输入错误，不作为校验结果返回
  return { workspace, errors: await workspace.validate() };
}

export async function createReport(project?: string) {
  const status = await getStatus(project);
  const reportPath = path.join(status.workspace.dir, 'reports', 'index.html');
  const html = renderHtml({
    state: status.state,
    revision: status.design,
    explanation: status.explanation,
    warnings: status.warnings,
    explanationStale: status.stale.explanation,
  });
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, html, 'utf8');
  return { path: reportPath, revision: status.design, warnings: status.warnings };
}

export async function exportMarkdown(project?: string) {
  const status = await getStatus(project);
  const exportPath = path.join(status.workspace.dir, 'reports', `revision-${status.state.currentRevision || 'draft'}.md`);
  await mkdir(path.dirname(exportPath), { recursive: true });
  await writeFile(exportPath, renderMarkdown({ state: status.state, revision: status.design, warnings: status.warnings }), 'utf8');
  return { path: exportPath, revision: status.design, warnings: status.warnings };
}

export async function repairProject(project: string | undefined, apply: boolean) {
  const workspace = await Workspace.at(project);
  await workspace.ensureInitialized(); // 未初始化时给出明确提示，而不是把错误混进修复清单
  const actions = await workspace.repairPlan();
  if (apply) {
    for (const item of actions) {
      const match = /^Orphan snapshot: (.+)$/.exec(item);
      if (!match) continue;
      const file = path.resolve(workspace.dir, match[1]!);
      if (!file.startsWith(`${workspace.dir}${path.sep}`)) continue;
      const content = await readFile(file, 'utf8');
      JSON.parse(content);
      await writeFile(`${file}.orphan`, content, { flag: 'wx' });
    }
  }
  return { actions, applied: apply };
}

export async function saveExplanation(input: { project?: string; existing: string; payload: unknown }): Promise<Explanation> {
  const workspace = await Workspace.at(input.project);
  const { config, state } = await workspace.readCore();
  const normalized = normalizeExplanation(input.payload);
  const sourceSnapshot = await captureCodeSnapshot(path.resolve(input.existing));
  return workspace.commitExplanation({
    schemaVersion: SCHEMA_VERSION,
    projectId: config.projectId,
    revision: state.currentExplanation + 1,
    createdAt: new Date().toISOString(),
    requestId: randomUUID(),
    designRevision: state.currentRevision || null,
    sourceSnapshot,
    ...normalized,
  });
}

export async function explainExisting(input: { project?: string; existing: string; inputFile: string }): Promise<Explanation> {
  const raw = JSON.parse(await readFile(path.resolve(input.inputFile), 'utf8')) as unknown;
  return saveExplanation({ ...(input.project === undefined ? {} : { project: input.project }), existing: input.existing, payload: raw });
}

export function unresolvedHighPriority(revision: DesignRevision | null) {
  return revision?.questions.filter((item) => item.priority === 'blocker' || item.priority === 'important') ?? [];
}

export type { DesignRevision, Explanation };
