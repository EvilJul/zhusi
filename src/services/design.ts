import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ZhusiError } from '../domain/errors.js';
import { unresolvedBlockerQuestions } from '../domain/integrity.js';
import {
  createDesignTemplate,
  DesignRevisionSchema,
  DesignSubmissionSchema,
  SCHEMA_VERSION,
} from '../domain/schema.js';
import { Workspace } from '../storage/workspace.js';

/** 读取当前设计 revision 及后续提交需要回带的 expectedRevision。只读。 */
export async function readDesign(project?: string) {
  const workspace = await Workspace.at(project);
  const { config, state } = await workspace.readCore();
  const revision = await workspace.readRevision();
  return { workspace, projectId: config.projectId, expectedRevision: state.currentRevision, revision };
}

export async function createTemplate(project?: string) {
  const { workspace, expectedRevision } = await readDesign(project);
  return { workspace, expectedRevision, template: createDesignTemplate(expectedRevision, randomUUID()) };
}

/** 读取提交载荷：文件路径，或 `-` 表示从 stdin 读取。 */
export async function loadPayload(inputFile: string): Promise<string> {
  if (inputFile === '-') {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk as Buffer));
    return Buffer.concat(chunks).toString('utf8');
  }
  return readFile(path.resolve(inputFile), 'utf8');
}

export async function submitDesign(input: { project?: string; payload: string; expectedRevision?: number; dryRun: boolean }) {
  let raw: unknown;
  try {
    raw = JSON.parse(input.payload);
  } catch (error) {
    throw new ZhusiError(`提交内容不是合法 JSON：${(error as Error).message}`, 'INVALID_INPUT');
  }

  const submission = DesignSubmissionSchema.parse(raw);
  const expected = input.expectedRevision ?? submission.expectedRevision;
  if (expected === undefined) {
    throw new ZhusiError('提交需要 expectedRevision：请在载荷中提供，或使用 --expected-revision。', 'INVALID_INPUT');
  }

  const workspace = await Workspace.at(input.project);
  const { config } = await workspace.readCore();

  // schemaVersion、projectId、revision、createdAt 一律由工具分配，不接受来自载荷。
  const document = {
    schemaVersion: SCHEMA_VERSION,
    projectId: config.projectId,
    revision: expected + 1,
    createdAt: new Date().toISOString(),
    requestId: submission.requestId ?? randomUUID(),
    actor: submission.actor ?? {},
    stage: submission.stage,
    summary: submission.summary,
    requirements: submission.requirements,
    decisions: submission.decisions,
    questions: submission.questions,
    reviews: submission.reviews,
    architecture: submission.architecture,
    ...(submission.scope ? { scope: submission.scope } : {}),
    ...(submission.nextSteps ? { nextSteps: submission.nextSteps } : {}),
  };

  const parsed = DesignRevisionSchema.parse(document);
  const blockers = unresolvedBlockerQuestions(parsed);
  if (parsed.stage === 'ready' && blockers.length > 0) {
    const detail = blockers.map((item) => item.summary ?? item.id ?? '未命名问题').join('；');
    throw new ZhusiError(`存在 ${blockers.length} 个未解决的阻塞问题，不能标记 ready：${detail}`, 'STAGE_NOT_READY');
  }

  if (input.dryRun) {
    const { state } = await workspace.readCore();
    if (state.currentRevision !== expected) {
      throw new ZhusiError('版本已变化，请重新读取后再提交。', 'REVISION_CONFLICT', false, state.currentRevision);
    }
    return { dryRun: true, created: false, revision: parsed, workspace };
  }

  const { revision: committed, created } = await workspace.commitRevision(document, expected);
  return { dryRun: false, created, revision: committed, workspace };
}
