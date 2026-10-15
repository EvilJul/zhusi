import path from 'node:path';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z, ZodError } from 'zod';
import { ZhusiError } from '../domain/errors.js';
import { ActorSchema, BriefExplanationContentSchema, BriefItemSchema, BriefSummarySchema, DesignSubmissionSchema, ReviewItemSchema } from '../domain/schema.js';
import { renderMarkdown } from '../report/render.js';
import { addReviews, DispositionInputSchema, disposeReviews } from '../services/review.js';
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

const projectParam = z.string().min(1).optional().describe('项目根目录；省略时使用启动时的第一个项目。必须是服务器已注册的项目之一。');

/**
 * 创建 MCP 服务器。可以绑定多个项目根：第一个为默认项目，其余通过工具的 project 参数选择。
 * 出于安全考虑，只能访问启动时注册的项目，不能通过参数指向任意目录。
 */
export function createZhusiServer(roots: string | readonly string[]): McpServer {
  const registered = [...new Set((typeof roots === 'string' ? [roots] : roots).map((root) => path.resolve(root)))];
  if (registered.length === 0) throw new ZhusiError('至少需要一个项目根。', 'INVALID_INPUT');
  const server = new McpServer({ name: 'zhusi', version: VERSION });

  const resolveProject = (project?: unknown): string => {
    if (project === undefined || project === null || project === '') return registered[0]!;
    const wanted = path.resolve(String(project));
    if (!registered.includes(wanted)) {
      throw new ZhusiError(`项目 ${wanted} 未在此 MCP 服务器注册。已注册：${registered.join('，')}`, 'INVALID_INPUT');
    }
    return wanted;
  };

  const listProjects = async () => Promise.all(registered.map(async (root, index) => {
    try {
      const status = await getStatus(root);
      return { root, default: index === 0, projectId: status.projectId, revision: status.revision, stage: status.stage };
    } catch (error) {
      return { root, default: index === 0, error: toZhusiError(error).message };
    }
  }));

  const rootById = async (projectId: string): Promise<string> => {
    const match = (await listProjects()).find((entry) => 'projectId' in entry && entry.projectId === projectId);
    if (!match) throw new ZhusiError(`未找到项目 ${projectId}`, 'INVALID_INPUT');
    return match.root;
  };

  server.registerTool('zhusi_status', {
    title: '项目状态',
    description: '返回项目 id、阶段、当前 revision、未决问题数量、陈旧指示与警告。',
    inputSchema: { project: projectParam },
  }, async ({ project }) => {
    try {
      const status = await getStatus(resolveProject(project));
      return textResult({
        ok: true, projectId: status.projectId, root: status.root, revision: status.revision,
        stage: status.stage, unresolvedQuestions: status.unresolvedQuestions, stale: status.stale, warnings: status.warnings,
      });
    } catch (error) { return failure(error); }
  });

  server.registerTool('zhusi_read_design', {
    title: '读取设计',
    description: '返回当前完整设计 revision 与 expectedRevision。提交前必须先读取，并把 expectedRevision 原样带回。',
    inputSchema: { project: projectParam },
  }, async ({ project }) => {
    try {
      const result = await readDesign(resolveProject(project));
      return textResult({ ok: true, projectId: result.projectId, expectedRevision: result.expectedRevision, revision: result.revision });
    } catch (error) { return failure(error); }
  });

  server.registerTool('zhusi_submit_design', {
    title: '提交设计',
    description: '校验并提交完整设计 revision。先提炼：摘要≤120字，要点≤80字；详情最多6行、每行≤120字。必须带刚读到的 expectedRevision；不提供 schemaVersion/projectId/revision/createdAt；带 requestId 支持幂等重试。',
    inputSchema: {
      ...DesignSubmissionSchema.shape,
      expectedRevision: z.number().int().nonnegative().describe('刚读取到的 expectedRevision'),
      project: projectParam,
      dryRun: z.boolean().optional().describe('只校验，不写入'),
    },
  }, async (args) => {
    try {
      const { dryRun, project, ...payload } = args as Record<string, unknown>;
      const result = await submitDesign({ project: resolveProject(project), payload: JSON.stringify(payload), dryRun: Boolean(dryRun) });
      return textResult({ ok: true, dryRun: result.dryRun, created: result.created, revision: result.revision.revision, stage: result.revision.stage });
    } catch (error) { return failure(error); }
  });

  server.registerTool('zhusi_validate', {
    title: '校验工作空间',
    description: '只读校验项目结构与引用，返回错误列表。',
    inputSchema: { project: projectParam },
  }, async ({ project }) => {
    try {
      const result = await validateProject(resolveProject(project));
      return textResult({ ok: result.errors.length === 0, errors: result.errors });
    } catch (error) { return failure(error); }
  });

  server.registerTool('zhusi_render_report', {
    title: '生成报告',
    description: '生成可离线打开的静态 HTML 报告，返回文件路径。',
    inputSchema: { project: projectParam },
  }, async ({ project }) => {
    try {
      const result = await createReport(resolveProject(project));
      return textResult({ ok: true, path: result.path, revision: result.revision?.revision ?? 0 });
    } catch (error) { return failure(error); }
  });

  server.registerTool('zhusi_save_explanation', {
    title: '保存架构讲解',
    description: '为已有代码项目保存一份架构讲解快照，并记录 Git commit 或目录指纹用于陈旧检测。',
    inputSchema: {
      existing: z.string().min(1).describe('要讲解的代码项目路径'),
      summary: BriefSummarySchema.optional(),
      walkthrough: z.array(BriefItemSchema.partial({ id: true })).max(10_000).optional(),
      deepDive: z.array(BriefItemSchema.partial({ id: true })).max(10_000).optional(),
      limitations: z.array(BriefSummarySchema).max(1_000).optional(),
      comparisons: BriefExplanationContentSchema.shape.comparisons.optional(),
      project: projectParam,
    },
  }, async (args) => {
    try {
      const { existing, project, ...payload } = args as Record<string, unknown>;
      const explanation = await saveExplanation({ project: resolveProject(project), existing: String(existing), payload });
      return textResult({ ok: true, revision: explanation.revision, sourceSnapshot: explanation.sourceSnapshot });
    } catch (error) { return failure(error); }
  });

  server.registerTool('zhusi_list_projects', {
    title: '列出项目',
    description: '列出此服务器注册的全部项目根、projectId、revision 与阶段；第一个为默认项目。',
    inputSchema: {},
  }, async () => {
    try { return textResult({ ok: true, projects: await listProjects() }); } catch (error) { return failure(error); }
  });

  server.registerTool('zhusi_add_reviews', {
    title: '追加评审',
    description: '基于 expectedRevision 追加评审问题或意见（异步评审），生成新 revision。相同 id 的评审只追加 opinions。',
    inputSchema: {
      expectedRevision: z.number().int().positive().describe('刚读取到的 expectedRevision'),
      requestId: z.string().min(1).max(200).optional(),
      actor: ActorSchema.optional(),
      reviews: z.array(ReviewItemSchema).min(1).max(1_000),
      project: projectParam,
      dryRun: z.boolean().optional(),
    },
  }, async (args) => {
    try {
      const { dryRun, project, ...batch } = args as Record<string, unknown>;
      const result = await addReviews({ project: resolveProject(project), batch, dryRun: Boolean(dryRun) });
      return textResult({ ok: true, dryRun: result.dryRun, created: result.created, revision: result.revision.revision, stage: result.revision.stage });
    } catch (error) { return failure(error); }
  });

  server.registerTool('zhusi_dispose_reviews', {
    title: '处置评审',
    description: '对评审作出 accepted / rejected / deferred 决定并写回设计，生成新 revision。语义与 zhusi design dispose 相同。',
    inputSchema: {
      expectedRevision: z.number().int().positive(),
      requestId: z.string().min(1).max(200).optional(),
      actor: ActorSchema.optional(),
      dispositions: z.array(DispositionInputSchema).min(1).max(1_000),
      project: projectParam,
      dryRun: z.boolean().optional(),
    },
  }, async (args) => {
    try {
      const { dryRun, project, ...batch } = args as Record<string, unknown>;
      const result = await disposeReviews({ project: resolveProject(project), batch, dryRun: Boolean(dryRun) });
      return textResult({ ok: true, dryRun: result.dryRun, created: result.created, revision: result.revision.revision, stage: result.revision.stage });
    } catch (error) { return failure(error); }
  });

  // ---- 资源：只读视图，客户端可直接挂载为上下文 ----
  server.registerResource('projects', 'zhusi://projects', {
    title: '已注册项目', description: '此服务器可访问的项目列表', mimeType: 'application/json',
  }, async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(await listProjects(), null, 2) }] }));

  const listUnder = (suffix: string, mimeType: string) => async () => ({
    resources: (await listProjects()).filter((entry): entry is typeof entry & { projectId: string } => 'projectId' in entry && Boolean(entry.projectId))
      .map((entry) => ({ uri: `zhusi://projects/${entry.projectId}/${suffix}`, name: `${path.basename(entry.root)} · ${suffix}`, mimeType })),
  });

  server.registerResource('design', new ResourceTemplate('zhusi://projects/{projectId}/design', { list: listUnder('design', 'application/json') }), {
    title: '当前设计', description: '当前设计 revision 与 expectedRevision（JSON）', mimeType: 'application/json',
  }, async (uri, variables) => {
    const result = await readDesign(await rootById(String(variables.projectId)));
    return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify({ projectId: result.projectId, expectedRevision: result.expectedRevision, revision: result.revision }, null, 2) }] };
  });

  server.registerResource('summary', new ResourceTemplate('zhusi://projects/{projectId}/summary.md', { list: listUnder('summary.md', 'text/markdown') }), {
    title: '设计摘要', description: '与 zhusi export 相同的 Markdown 摘要，不写文件', mimeType: 'text/markdown',
  }, async (uri, variables) => {
    const status = await getStatus(await rootById(String(variables.projectId)));
    return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text: renderMarkdown({ state: status.state, revision: status.design, warnings: status.warnings }) }] };
  });

  server.registerResource('explanation', new ResourceTemplate('zhusi://projects/{projectId}/explanation', { list: listUnder('explanation', 'application/json') }), {
    title: '架构讲解', description: '最新架构讲解快照与陈旧状态（JSON）', mimeType: 'application/json',
  }, async (uri, variables) => {
    const status = await getStatus(await rootById(String(variables.projectId)));
    return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify({ stale: status.stale.explanation, explanation: status.explanation }, null, 2) }] };
  });

  // ---- 提示：把 Skill 工作流打包成客户端可直接调用的模板 ----
  const promptText = (text: string) => ({ messages: [{ role: 'user' as const, content: { type: 'text' as const, text } }] });
  const promptProject = z.string().optional().describe('项目根目录，省略使用默认项目');

  server.registerPrompt('zhusi_design_session', {
    title: '需求→提案',
    description: '引导从一句需求开始澄清、提出方案并提交设计 revision。',
    argsSchema: { requirement: z.string().describe('一句话需求'), project: promptProject },
  }, ({ requirement, project }) => promptText([
    `用筑思为下面的需求做设计：${requirement}`,
    '',
    `1. 调用 zhusi_read_design${project ? `（project: ${project}）` : ''} 取得 expectedRevision。`,
    '2. 先提出最多 3 个最关键的澄清问题，记录为 questions（标注 blocker / important / suggestion）。',
    '3. 写出 requirements、businessFlows（含异常流程）、architecture（modules + dependencies）、decisions（choice、rationale、alternatives、tradeoffs、revisitWhen）和 developmentOrder。',
    '4. 用 zhusi_submit_design 提交，stage 设为 drafting 或 reviewing，带上 expectedRevision 与新的 requestId。',
    '5. 冲突（REVISION_CONFLICT）时重新读取再合并，不要覆盖他人修改。',
  ].join('\n')));

  server.registerPrompt('zhusi_review_design', {
    title: '评审设计',
    description: '以评审者身份读取当前设计，提出问题→意见，并用 zhusi_add_reviews 追加。',
    argsSchema: { reviewer: z.string().optional().describe('评审者名称，写入 opinions.author'), project: promptProject },
  }, ({ reviewer, project }) => promptText([
    `你是设计评审者${reviewer ? `「${reviewer}」` : ''}。`,
    `1. 调用 zhusi_read_design${project ? `（project: ${project}）` : ''}，记下 expectedRevision。`,
    '2. 找出风险、遗漏的异常流程、证据不足的决策；每个问题一条 review（id、summary、priority），理由写进 opinions。',
    '3. 对已有评审补充意见时沿用其 id，只追加 opinions。',
    '4. 调用 zhusi_add_reviews 提交；不要自行处置评审，处置由设计负责人用 zhusi_dispose_reviews 完成。',
  ].join('\n')));

  server.registerPrompt('zhusi_explain_codebase', {
    title: '讲解已有代码',
    description: '为已有代码项目生成带证据的架构讲解快照。',
    argsSchema: { existing: z.string().describe('代码项目路径'), project: promptProject },
  }, ({ existing, project }) => promptText([
    `为代码项目 ${existing} 生成架构讲解。`,
    '回答：系统从哪里启动、一次请求如何流转、模块为何这样依赖。',
    '每条结论附 evidence（文件:行 / 符号 / 配置），并用 classification 区分 fact（代码事实）、intent（设计意图）、inferred、unknown；未读到的范围写进 limitations。',
    `完成后调用 zhusi_save_explanation（existing: ${existing}${project ? `，project: ${project}` : ''}）。`,
  ].join('\n')));

  return server;
}

export async function serveZhusiMcp(projects: string | readonly string[]): Promise<void> {
  const roots: string[] = [];
  for (const project of typeof projects === 'string' ? [projects] : projects) {
    const workspace = await Workspace.at(project);
    const { config } = await workspace.readCore();
    process.stderr.write(`zhusi mcp：已绑定项目 ${workspace.root}（${config.projectId}）\n`);
    roots.push(workspace.root);
  }
  const server = createZhusiServer(roots);
  await server.connect(new StdioServerTransport());
}
