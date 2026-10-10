import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z, ZodError } from 'zod';
import { ZhusiError } from '../domain/errors.js';
import { ActorSchema, ArchitectureSchema, ItemSchema, StageSchema } from '../domain/schema.js';
import { readDesign, submitDesign } from '../services/design.js';
import { createReport, getStatus, saveExplanation, validateProject } from '../services/project.js';
import { Workspace } from '../storage/workspace.js';
import { VERSION } from '../version.js';

const textResult = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] });

function toZhusiError(error: unknown): ZhusiError {
  if (error instanceof ZhusiError) return error;
  if (error instanceof ZodError) {
    const detail = error.issues.slice(0, 5).map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('；');
    return new ZhusiError(`输入不符合 schema：${detail}`, 'INVALID_INPUT');
  }
  return new ZhusiError((error as Error)?.message || '未知错误');
}

/** 工具失败返回结构化结果，服务器进程继续存活。 */
function failure(error: unknown) {
  const issue = toZhusiError(error);
  return {
    isError: true as const,
    content: [{
      type: 'text' as const,
      text: JSON.stringify({
        ok: false,
        code: issue.code,
        message: issue.message,
        retryable: issue.retryable,
        ...(issue.latestRevision === undefined ? {} : { latestRevision: issue.latestRevision }),
      }, null, 2),
    }],
  };
}

export function createZhusiServer(projectRoot: string): McpServer {
  const server = new McpServer({ name: 'zhusi', version: VERSION });

  server.registerTool('zhusi_status', {
    title: '项目状态',
    description: '返回项目 id、阶段、当前 revision、未决问题数量、陈旧指示与警告。',
    inputSchema: {},
  }, async () => {
    try {
      const status = await getStatus(projectRoot);
      return textResult({
        ok: true, projectId: status.projectId, root: status.root, revision: status.revision,
        stage: status.stage, unresolvedQuestions: status.unresolvedQuestions, stale: status.stale, warnings: status.warnings,
      });
    } catch (error) { return failure(error); }
  });

  server.registerTool('zhusi_read_design', {
    title: '读取设计',
    description: '返回当前完整设计 revision 与 expectedRevision。提交前必须先读取，并把 expectedRevision 原样带回。',
    inputSchema: {},
  }, async () => {
    try {
      const result = await readDesign(projectRoot);
      return textResult({ ok: true, projectId: result.projectId, expectedRevision: result.expectedRevision, revision: result.revision });
    } catch (error) { return failure(error); }
  });

  server.registerTool('zhusi_submit_design', {
    title: '提交设计',
    description: '校验并提交一份完整设计 revision。必须带 expectedRevision（等于刚读到的值）；不要提供 schemaVersion/projectId/revision/createdAt；带 requestId 以支持幂等重试。',
    inputSchema: {
      expectedRevision: z.number().int().nonnegative().describe('刚读取到的 expectedRevision'),
      requestId: z.string().min(1).max(200).optional().describe('幂等标识，重试时沿用同一个值'),
      actor: ActorSchema.optional(),
      stage: StageSchema.optional(),
      summary: z.string().max(100_000).optional(),
      requirements: z.array(ItemSchema).max(10_000).optional(),
      decisions: z.array(ItemSchema).max(10_000).optional(),
      questions: z.array(ItemSchema).max(10_000).optional(),
      reviews: z.array(ItemSchema).max(10_000).optional(),
      architecture: ArchitectureSchema.optional(),
      dryRun: z.boolean().optional().describe('只校验，不写入'),
    },
  }, async (args) => {
    try {
      const { dryRun, ...payload } = args as Record<string, unknown>;
      const result = await submitDesign({ project: projectRoot, payload: JSON.stringify(payload), dryRun: Boolean(dryRun) });
      return textResult({ ok: true, dryRun: result.dryRun, created: result.created, revision: result.revision.revision, stage: result.revision.stage });
    } catch (error) { return failure(error); }
  });

  server.registerTool('zhusi_validate', {
    title: '校验工作空间',
    description: '只读校验项目结构与引用，返回错误列表。',
    inputSchema: {},
  }, async () => {
    try {
      const result = await validateProject(projectRoot);
      return textResult({ ok: result.errors.length === 0, errors: result.errors });
    } catch (error) { return failure(error); }
  });

  server.registerTool('zhusi_render_report', {
    title: '生成报告',
    description: '生成可离线打开的静态 HTML 报告，返回文件路径。',
    inputSchema: {},
  }, async () => {
    try {
      const result = await createReport(projectRoot);
      return textResult({ ok: true, path: result.path, revision: result.revision?.revision ?? 0 });
    } catch (error) { return failure(error); }
  });

  server.registerTool('zhusi_save_explanation', {
    title: '保存架构讲解',
    description: '为已有代码项目保存一份架构讲解快照，并记录 Git commit 或目录指纹用于陈旧检测。',
    inputSchema: {
      existing: z.string().min(1).describe('要讲解的代码项目路径'),
      summary: z.string().max(100_000).optional(),
      walkthrough: z.array(z.record(z.string(), z.unknown())).max(10_000).optional(),
      deepDive: z.array(z.record(z.string(), z.unknown())).max(10_000).optional(),
      limitations: z.array(z.string().max(10_000)).max(1_000).optional(),
      comparisons: z.array(z.record(z.string(), z.unknown())).optional(),
    },
  }, async (args) => {
    try {
      const { existing, ...payload } = args as Record<string, unknown>;
      const explanation = await saveExplanation({ project: projectRoot, existing: String(existing), payload });
      return textResult({ ok: true, revision: explanation.revision, sourceSnapshot: explanation.sourceSnapshot });
    } catch (error) { return failure(error); }
  });

  return server;
}

export async function serveZhusiMcp(project: string): Promise<void> {
  const workspace = await Workspace.at(project);
  const { config } = await workspace.readCore();
  process.stderr.write(`zhusi mcp：已绑定项目 ${workspace.root}（${config.projectId}）\n`);
  const server = createZhusiServer(workspace.root);
  await server.connect(new StdioServerTransport());
}
