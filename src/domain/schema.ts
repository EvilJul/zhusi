import { z } from 'zod';

export const SCHEMA_VERSION = 1;
export const MAX_SNAPSHOT_BYTES = 5 * 1024 * 1024;

export const ActorSchema = z.object({
  client: z.string().max(200).optional(),
  model: z.string().max(200).optional(),
  session: z.string().max(200).optional(),
}).strict();

export const StageSchema = z.enum(['idea', 'clarifying', 'drafting', 'reviewing', 'ready']);

export const ProjectConfigSchema = z.object({
  schemaVersion: z.number().int().positive(),
  projectId: z.string().min(1).max(100),
  createdAt: z.string().datetime(),
  root: z.string().min(1),
}).strict();

export const StateSchema = z.object({
  schemaVersion: z.number().int().positive(),
  projectId: z.string().min(1),
  currentRevision: z.number().int().nonnegative(),
  currentExplanation: z.number().int().nonnegative().default(0),
  updatedAt: z.string().datetime(),
}).strict();

export const ItemSchema = z.object({
  id: z.string().min(1).max(200),
  summary: z.string().max(20_000),
  status: z.string().max(100).optional(),
  priority: z.enum(['blocker', 'important', 'suggestion']).optional(),
  details: z.string().max(100_000).optional(),
  evidence: z.array(z.string().max(2_000)).max(100).optional(),
  classification: z.enum(['fact', 'inferred', 'unknown', 'intent']).optional(),
  confidence: z.number().min(0).max(1).optional(),
}).passthrough();

export const ArchitectureModuleSchema = z.object({
  id: z.string().min(1).max(200).optional(),
  name: z.string().min(1).max(200),
  responsibility: z.string().max(2_000).optional(),
  layer: z.string().max(100).optional(),
}).strict();

export const ArchitectureDependencySchema = z.object({
  from: z.string().min(1).max(200),
  to: z.string().min(1).max(200),
  label: z.string().max(200).optional(),
}).strict();

export const ArchitectureLinkSchema = z.object({
  label: z.string().min(1).max(200),
  url: z.string().min(1).max(2_000),
}).strict();

export const ArchitectureSchema = z.object({
  modules: z.array(ArchitectureModuleSchema).max(200).default([]),
  dependencies: z.array(ArchitectureDependencySchema).max(500).default([]),
  links: z.array(ArchitectureLinkSchema).max(100).default([]),
  notes: z.string().max(20_000).optional(),
}).catchall(z.unknown());

// 阅读旧快照仍使用原上限；只对新提交施加简写约束，不改写历史资料。
export const BriefTextSchema = z.string().max(80, '请提炼为不超过 80 字的单条要点').refine((value) => !/[\r\n]/.test(value), '每条要点只写一行');
export const BriefSummarySchema = z.string().max(120, '请把摘要提炼为不超过 120 字的目标与范围').refine((value) => !/[\r\n]/.test(value), '摘要只写一行，禁止大段文字');
export const BriefDetailsSchema = z.string().max(730, '详情最多 6 条要点，每条不超过 120 字').refine(
  (value) => { const lines = value.split(/\r?\n/).filter((line) => line.trim()); return lines.length <= 6 && lines.every((line) => line.length <= 120); },
  '禁止大段文字：详情最多 6 行，每行一个不超过 120 字的要点',
);
export const BriefItemSchema = ItemSchema.extend({
  summary: BriefTextSchema,
  details: BriefDetailsSchema.optional(),
  choice: BriefTextSchema.optional(),
  rationale: BriefSummarySchema.optional(),
  alternatives: z.array(BriefTextSchema).max(5).optional(),
  tradeoffs: z.array(BriefTextSchema).max(5).optional(),
  revisitWhen: z.array(BriefTextSchema).max(5).optional(),
});
export const BriefArchitectureSchema = ArchitectureSchema.extend({
  modules: z.array(ArchitectureModuleSchema.extend({ name: z.string().min(1).max(40), responsibility: BriefTextSchema.optional() })).max(200).default([]),
  dependencies: z.array(ArchitectureDependencySchema.extend({ label: BriefTextSchema.optional() })).max(500).default([]),
  notes: BriefDetailsSchema.optional(),
});
export const ScopeSchema = z.object({
  included: z.array(BriefTextSchema).max(20).default([]),
  excluded: z.array(BriefTextSchema).max(20).default([]),
}).strict();
export const NextStepSchema = z.object({
  id: z.string().min(1).max(200),
  summary: BriefTextSchema.refine((value) => Boolean(value.trim()), '行动不能为空'),
  prerequisite: BriefSummarySchema.optional(),
  acceptance: BriefSummarySchema.refine((value) => Boolean(value.trim()), '验收结果不能为空'),
  status: z.enum(['pending', 'done']).default('pending'),
}).strict();

export const DesignRevisionSchema = z.object({
  schemaVersion: z.number().int().positive(),
  projectId: z.string().min(1),
  revision: z.number().int().positive(),
  createdAt: z.string().datetime(),
  actor: ActorSchema,
  requestId: z.string().min(1).max(200),
  stage: StageSchema,
  summary: z.string().max(100_000).default(''),
  requirements: z.array(ItemSchema).max(10_000).default([]),
  decisions: z.array(ItemSchema).max(10_000).default([]),
  questions: z.array(ItemSchema).max(10_000).default([]),
  reviews: z.array(ItemSchema).max(10_000).default([]),
  architecture: ArchitectureSchema.default({ modules: [], dependencies: [], links: [] }),
  scope: ScopeSchema.optional(),
  nextSteps: z.array(NextStepSchema).max(20).optional(),
}).strict();

export const CodeSnapshotSchema = z.object({
  root: z.string().min(1),
  gitCommit: z.string().regex(/^[a-f0-9]{7,64}$/i).optional(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  generatedAt: z.string().datetime(),
  tool: z.string().max(200),
  readScope: z.array(z.string().max(2_000)).max(10_000),
  fileCount: z.number().int().nonnegative(),
}).refine((value) => Boolean(value.gitCommit || value.fingerprint), { message: 'gitCommit or fingerprint is required' });

export const ExplanationSchema = z.object({
  schemaVersion: z.number().int().positive(),
  projectId: z.string().min(1),
  revision: z.number().int().positive(),
  createdAt: z.string().datetime(),
  requestId: z.string().min(1).max(200),
  sourceSnapshot: CodeSnapshotSchema,
  designRevision: z.number().int().positive().nullable().default(null),
  summary: z.string().max(100_000),
  walkthrough: z.array(ItemSchema).max(10_000),
  deepDive: z.array(ItemSchema).max(10_000),
  limitations: z.array(z.string().max(10_000)).max(1_000),
  comparisons: z.array(z.object({
    design: z.string(), observation: z.string(), result: z.enum(['consistent', 'divergent', 'unknown', 'stale']),
  })).default([]),
}).strict();

export const BriefExplanationContentSchema = ExplanationSchema.pick({
  summary: true, walkthrough: true, deepDive: true, limitations: true, comparisons: true,
}).extend({
  summary: BriefSummarySchema,
  walkthrough: z.array(BriefItemSchema).max(10_000),
  deepDive: z.array(BriefItemSchema).max(10_000),
  limitations: z.array(BriefSummarySchema).max(1_000),
  comparisons: z.array(z.object({
    design: BriefSummarySchema, observation: BriefSummarySchema,
    result: z.enum(['consistent', 'divergent', 'unknown', 'stale']),
  })).default([]),
});

export const WarningSchema = z.object({ code: z.string(), message: z.string(), path: z.string().optional() });
export const ErrorEnvelopeSchema = z.object({
  ok: z.literal(false), code: z.string(), message: z.string(), retryable: z.boolean(), latestRevision: z.number().optional(),
});

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;
export type WorkspaceState = z.infer<typeof StateSchema>;
export type DesignRevision = z.infer<typeof DesignRevisionSchema>;
export type Explanation = z.infer<typeof ExplanationSchema>;

// 写入输入：revision 与 createdAt 由存储层分配，调用方无需预填。
export const DesignRevisionInputSchema = DesignRevisionSchema.extend({
  revision: z.number().int().nonnegative().optional(),
  createdAt: z.string().datetime().optional(),
}).strict();

export const ExplanationInputSchema = ExplanationSchema.extend({
  revision: z.number().int().nonnegative().optional(),
  createdAt: z.string().datetime().optional(),
}).strict();

export type DesignRevisionInput = z.input<typeof DesignRevisionInputSchema>;
export type ExplanationInput = z.input<typeof ExplanationInputSchema>;

// 设计提交载荷。expectedRevision / requestId / actor 是信封字段；
// schemaVersion、projectId、revision、createdAt 由工具分配，不接受来自载荷。
export const DesignSubmissionSchema = z.object({
  expectedRevision: z.number().int().nonnegative().optional(),
  requestId: z.string().min(1).max(200).optional(),
  actor: ActorSchema.optional(),
  stage: StageSchema.default('idea'),
  summary: BriefSummarySchema.default(''),
  requirements: z.array(BriefItemSchema).max(10_000).default([]),
  decisions: z.array(BriefItemSchema).max(10_000).default([]),
  questions: z.array(BriefItemSchema).max(10_000).default([]),
  reviews: z.array(BriefItemSchema).max(10_000).default([]),
  architecture: BriefArchitectureSchema.default({ modules: [], dependencies: [], links: [] }),
  scope: ScopeSchema.optional(),
  nextSteps: z.array(NextStepSchema).max(20).optional(),
}).strict();

export type DesignSubmission = z.infer<typeof DesignSubmissionSchema>;

export function createDesignTemplate(expectedRevision: number, requestId: string): DesignSubmission {
  return {
    expectedRevision,
    requestId,
    actor: { client: 'your-client', model: 'your-model' },
    stage: 'drafting',
    summary: '',
    requirements: [],
    decisions: [],
    questions: [],
    reviews: [],
    architecture: { modules: [], dependencies: [], links: [] },
    scope: { included: [], excluded: [] },
    nextSteps: [],
  };
}

export function parseVersioned<T>(schema: z.ZodType<T>, value: unknown): T {
  const version = (value as { schemaVersion?: unknown } | null)?.schemaVersion;
  if (typeof version === 'number' && Math.floor(version) > SCHEMA_VERSION) {
    throw new Error(`不支持的 schema 主版本 ${version}，请升级 zhusi。`);
  }
  return schema.parse(value);
}
