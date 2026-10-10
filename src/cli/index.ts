#!/usr/bin/env node
import { Command, CommanderError, Option } from 'commander';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ZodError } from 'zod';
import { EXIT_CODES, ZhusiError } from '../domain/errors.js';
import {
  createReport,
  explainExisting,
  exportMarkdown,
  getStatus,
  initializeProject,
  repairProject,
  validateProject,
} from '../services/project.js';
import { createTemplate, loadPayload, readDesign, submitDesign } from '../services/design.js';
import { installSkill } from '../services/skill.js';
import { Workspace } from '../storage/workspace.js';
import { serveZhusiMcp } from '../mcp/server.js';
import { VERSION } from '../version.js';

export function isJson(argv: readonly string[]): boolean {
  return argv.includes('--json');
}

function emit(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function human(text: string): void {
  process.stdout.write(`${text}\n`);
}

/** 把 Zod 校验失败压缩成一行，供结构化错误使用。 */
function describeZodError(error: ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('；');
}

const ACTION_LABEL: Record<string, string> = {
  created: '新建',
  updated: '更新',
  unchanged: '未变',
  skipped: '跳过（已存在且内容不同，加 --force 覆盖）',
};

export function createProgram(): Command {
  const program = new Command();
  program
    .name('zhusi')
    .description('本地优先的项目设计与架构讲解工具')
    .version(VERSION, '-v, --version', '显示版本号')
    .addOption(new Option('--json', '以机器可读 JSON 输出结构化结果'))
    .showHelpAfterError('运行 zhusi --help 查看用法。')
    .showSuggestionAfterError();

  program.configureOutput({
    writeOut: (text) => process.stdout.write(text),
    writeErr: (text) => process.stderr.write(text),
    outputError: (text, write) => write(text),
  });

  program.exitOverride();

  program
    .command('init')
    .description('初始化 .zhusi 项目空间（非破坏性）')
    .option('-p, --project <path>', '项目根目录，默认当前目录')
    .action(async (options: { project?: string }) => {
      const result = await initializeProject(options.project);
      const message = result.created ? '项目空间已初始化。' : '项目已初始化，现有数据保持不变。';
      if (isJson(process.argv)) {
        emit({ ok: true, created: result.created, message, projectId: result.config.projectId, root: result.workspace.root });
      } else {
        human(`${message} ${result.workspace.root}`);
      }
    });

  program
    .command('status')
    .description('显示阶段、revision、未决问题与陈旧指示')
    .option('-p, --project <path>', '项目根目录，默认当前目录')
    .action(async (options: { project?: string }) => {
      const result = await getStatus(options.project);
      if (isJson(process.argv)) {
        emit({
          ok: true,
          projectId: result.projectId,
          root: result.root,
          revision: result.revision,
          stage: result.stage,
          unresolvedQuestions: result.unresolvedQuestions,
          stale: result.stale,
          warnings: result.warnings,
        });
      } else {
        human(`项目 ${result.projectId}\n阶段 ${result.stage} · revision ${result.revision}\n未决问题 ${result.unresolvedQuestions}${result.stale.explanation ? '\n架构讲解已陈旧' : ''}`);
      }
    });

  program
    .command('validate')
    .description('只读校验工作空间结构与引用')
    .option('-p, --project <path>', '项目根目录，默认当前目录')
    .action(async (options: { project?: string }) => {
      const { errors } = await validateProject(options.project);
      if (isJson(process.argv)) emit({ ok: errors.length === 0, errors });
      else human(errors.length ? errors.join('\n') : '项目数据有效。');
      if (errors.length) process.exitCode = EXIT_CODES.INVALID_INPUT;
    });

  program
    .command('report')
    .description('生成可离线打开的静态 HTML 报告')
    .option('-p, --project <path>', '项目根目录，默认当前目录')
    .action(async (options: { project?: string }) => {
      const result = await createReport(options.project);
      if (isJson(process.argv)) emit({ ok: true, path: result.path, revision: result.revision?.revision ?? 0 });
      else human(`报告已生成：${result.path}`);
    });

  program
    .command('export')
    .description('导出人类可读的派生文件')
    .option('-p, --project <path>', '项目根目录，默认当前目录')
    .option('-f, --format <format>', '导出格式', 'markdown')
    .action(async (options: { project?: string; format: string }) => {
      if (options.format !== 'markdown') throw new ZhusiError('支持的导出格式：markdown', 'INVALID_INPUT');
      const result = await exportMarkdown(options.project);
      if (isJson(process.argv)) emit({ ok: true, path: result.path, revision: result.revision?.revision ?? 0 });
      else human(`Markdown 已导出：${result.path}`);
    });

  program
    .command('repair')
    .description('报告孤立快照与陈旧锁；默认只读')
    .option('-p, --project <path>', '项目根目录，默认当前目录')
    .option('--dry-run', '只报告，不做任何修改（默认行为）', false)
    .option('--apply', '显式归档孤立快照，保留原始文件', false)
    .action(async (options: { project?: string; apply: boolean; dryRun: boolean }) => {
      if (options.apply && options.dryRun) throw new ZhusiError('--apply 与 --dry-run 不能同时使用', 'INVALID_INPUT');
      const result = await repairProject(options.project, options.apply);
      if (isJson(process.argv)) emit({ ok: true, applied: result.applied, actions: result.actions });
      else human(result.actions.length ? result.actions.join('\n') : '无需修复。');
    });

  program
    .command('explain')
    .description('保存已有代码项目的架构讲解快照')
    .requiredOption('--existing <path>', '需要讲解的代码项目路径')
    .requiredOption('--input <path>', '结构化讲解 JSON 文件')
    .option('-p, --project <path>', '保存讲解的 Zhusi 项目根目录，默认当前目录')
    .action(async (options: { existing: string; input: string; project?: string }) => {
      const explanation = await explainExisting({ project: options.project, existing: options.existing, inputFile: options.input });
      if (isJson(process.argv)) emit({ ok: true, revision: explanation.revision, sourceSnapshot: explanation.sourceSnapshot });
      else human(`架构讲解已保存，revision ${explanation.revision}`);
    });

  program
    .command('mcp')
    .description('启动绑定项目根的 MCP stdio 服务器')
    .option('-p, --project <path>', '项目根目录，默认当前目录')
    .action(async (options: { project?: string }) => {
      const root = path.resolve(options.project ?? process.cwd());
      const workspace = await Workspace.at(root);
      const ready = await workspace.readCore().then(() => true, () => false);
      if (!ready) {
        process.stderr.write(`MCP 服务器启动失败：${root} 尚未初始化，请先运行 zhusi init --project "${root}"。\n`);
        process.exitCode = EXIT_CODES.INVALID_INPUT;
        return;
      }
      await serveZhusiMcp(root);
    });

  const design = program.command('design').description('读取、生成骨架与提交设计 revision');

  design
    .command('show')
    .description('读取当前完整 revision 与 expectedRevision')
    .option('-p, --project <path>', '项目根目录，默认当前目录')
    .action(async (options: { project?: string }) => {
      const result = await readDesign(options.project);
      if (isJson(process.argv)) {
        emit({ ok: true, projectId: result.projectId, expectedRevision: result.expectedRevision, revision: result.revision });
      } else if (result.revision) {
        const { revision } = result;
        human(`revision ${revision.revision} · 阶段 ${revision.stage} · 需求 ${revision.requirements.length} · 决策 ${revision.decisions.length} · 未决问题 ${revision.questions.length}`);
      } else {
        human('尚无 revision（expectedRevision 0）。运行 zhusi design template 生成提交骨架。');
      }
    });

  design
    .command('template')
    .description('生成可直接填写的提交骨架')
    .option('-p, --project <path>', '项目根目录，默认当前目录')
    .option('-o, --out <path>', '写入文件；省略则打印到 stdout')
    .action(async (options: { project?: string; out?: string }) => {
      const { template } = await createTemplate(options.project);
      const text = `${JSON.stringify(template, null, 2)}\n`;
      if (!options.out) {
        process.stdout.write(text);
        return;
      }
      const target = path.resolve(options.out);
      await writeFile(target, text, 'utf8');
      if (isJson(process.argv)) emit({ ok: true, path: target, expectedRevision: template.expectedRevision });
      else human(`骨架已写入：${target}`);
    });

  design
    .command('submit')
    .description('校验并提交一份设计 revision')
    .requiredOption('-i, --input <path>', '提交载荷文件，或用 - 从 stdin 读取')
    .option('-p, --project <path>', '项目根目录，默认当前目录')
    .option('-e, --expected-revision <number>', '期望的当前 revision；省略时取载荷中的值', (value: string) => {
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 0) throw new ZhusiError(`--expected-revision 需要非负整数，收到 ${value}`, 'INVALID_INPUT');
      return parsed;
    })
    .option('--dry-run', '只校验，不写入', false)
    .action(async (options: { input: string; project?: string; expectedRevision?: number; dryRun: boolean }) => {
      const payload = await loadPayload(options.input);
      const result = await submitDesign({
        project: options.project,
        payload,
        ...(options.expectedRevision === undefined ? {} : { expectedRevision: options.expectedRevision }),
        dryRun: options.dryRun,
      });
      if (isJson(process.argv)) {
        emit({ ok: true, dryRun: result.dryRun, created: result.created, revision: result.revision.revision, stage: result.revision.stage });
      } else if (result.dryRun) {
        human(`校验通过（dry-run，未写入）：revision ${result.revision.revision} · ${result.revision.stage}`);
      } else {
        human(`revision ${result.revision.revision} 已提交 · ${result.revision.stage}`);
      }
    });

  program
    .command('install-skill')
    .description('把 zhusi 注册给 AI 客户端：安装 Skill 与指令文件')
    .option('--host <host>', '宿主：codex | claude | cursor | all', 'codex')
    .option('-p, --project <path>', '项目根目录，默认当前目录（--user 时忽略）')
    .option('--user', '安装到用户级配置目录，而非当前项目', false)
    .option('--force', '覆盖已存在且内容不同的 Skill 文件', false)
    .option('--dry-run', '只报告将要写入的文件，不做修改', false)
    .action(async (options: { host: string; project?: string; user: boolean; force: boolean; dryRun: boolean }) => {
      const result = await installSkill({
        host: options.host,
        ...(options.project === undefined ? {} : { project: options.project }),
        user: options.user,
        force: options.force,
        dryRun: options.dryRun,
      });
      if (isJson(process.argv)) {
        emit({ ok: true, scope: result.scope, base: result.base, dryRun: result.dryRun, actions: result.actions });
        return;
      }
      const lines = result.actions.map((action) => `${ACTION_LABEL[action.status] ?? action.status} · ${action.kind === 'skill' ? 'skill' : 'instructions'} · ${action.path}`);
      human(`${result.dryRun ? '[dry-run，未写入] ' : ''}作用域 ${result.scope}：${result.base}`);
      human(lines.join('\n'));
    });

  return program;
}

export async function run(argv: readonly string[]): Promise<number> {
  const program = createProgram();
  // mcp 命令下 stdout 属于协议通道，任何情况下都不能写入结构化输出。
  const structured = isJson(argv) && !argv.includes('mcp');
  const onSignal = (signal: NodeJS.Signals) => {
    process.stderr.write(`操作已取消（${signal}）。\n`);
    process.exit(130);
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  try {
    await program.parseAsync(argv as string[]);
    return typeof process.exitCode === 'number' ? process.exitCode : 0;
  } catch (error) {
    if (error instanceof CommanderError) {
      return error.exitCode;
    }
    const issue = error instanceof ZhusiError
      ? error
      : error instanceof ZodError
        ? new ZhusiError(`输入不符合 schema：${describeZodError(error)}`, 'INVALID_INPUT')
        : new ZhusiError((error as Error).message || '未知错误');
    if (structured) {
      emit({
        ok: false,
        code: issue.code,
        message: issue.message,
        retryable: issue.retryable,
        ...(issue.latestRevision === undefined ? {} : { latestRevision: issue.latestRevision }),
      });
    } else {
      process.stderr.write(`${issue.message}\n`);
    }
    return EXIT_CODES[issue.code];
  } finally {
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
  }
}

const invokedPath = process.argv[1];
if (invokedPath && /(?:^|[\\/])cli[\\/]index\.(?:js|ts)$/.test(invokedPath)) {
  run(process.argv).then((code) => {
    if (code !== 0) process.exitCode = code;
  });
}
