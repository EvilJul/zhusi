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

// 业务流程：触发→步骤→结果，并显式记录异常分支。
export const FlowStepSchema = z.object({
  actor: z.string().max(200).optional(),
  action: z.string().min(1).max(2_000),
  result: z.string().max(2_000).optional(),
}).strict();

export const BusinessFlowSchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  trigger: z.string().max(2_000).optional(),
  steps: z.array(FlowStepSchema).max(200).default([]),
  exceptions: z.array(z.string().max(2_000)).max(100).default([]),
}).strict();

// 开发顺序：按阶段排列，可声明依赖的前置阶段与交付物。
export const DevelopmentStepSchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  summary: z.string().max(20_000).optional(),
  dependsOn: z.array(z.string().max(200)).max(100).default([]),
  deliverables: z.array(z.string().max(2_000)).max(100).default([]),
  status: z.enum(['planned', 'in-progress', 'done']).optional(),
}).strict();

export const ReviewDecisionSchema = z.enum(['accepted', 'rejected', 'deferred']);

export const ReviewOpinionSchema = z.object({
  author: z.string().max(200).optional(),
  text: z.string().min(1).max(20_000),
  at: z.string().datetime().optional(),
}).strict();

export const ReviewDispositionSchema = z.object({
  decision: ReviewDecisionSchema,
  reason: z.string().max(20_000).optional(),
  by: z.string().max(200).optional(),
  at: z.string().datetime().optional(),
  revision: z.number().int().positive().optional(),
}).strict();

// 评审条目在通用条目上增加“问题→意见→处置”三段。
export const ReviewItemSchema = ItemSchema.extend({
  opinions: z.array(ReviewOpinionSchema).max(1_000).optional(),
  disposition: ReviewDispositionSchema.optional(),
}).passthrough();

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
  reviews: z.array(ReviewItemSchema).max(10_000).default([]),
  architecture: ArchitectureSchema.default({ modules: [], dependencies: [], links: [] }),
  businessFlows: z.array(BusinessFlowSchema).max(1_000).default([]),
  developmentOrder: z.array(DevelopmentStepSchema).max(1_000).default([]),
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
  summary: z.string().max(100_000).default(''),
  requirements: z.array(ItemSchema).max(10_000).default([]),
  decisions: z.array(ItemSchema).max(10_000).default([]),
  questions: z.array(ItemSchema).max(10_000).default([]),
  reviews: z.array(ReviewItemSchema).max(10_000).default([]),
  architecture: ArchitectureSchema.default({ modules: [], dependencies: [], links: [] }),
  businessFlows: z.array(BusinessFlowSchema).max(1_000).default([]),
  developmentOrder: z.array(DevelopmentStepSchema).max(1_000).default([]),
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
    businessFlows: [],
    developmentOrder: [],
  };
}

export function parseVersioned<T>(schema: z.ZodType<T>, value: unknown): T {
  const version = (value as { schemaVersion?: unknown } | null)?.schemaVersion;
  if (typeof version === 'number' && Math.floor(version) > SCHEMA_VERSION) {
    throw new Error(`不支持的 schema 主版本 ${version}，请升级 zhusi。`);
  }
  return schema.parse(value);
}
