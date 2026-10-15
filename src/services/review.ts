import { randomUUID } from 'node:crypto';
import { ZhusiError } from '../domain/errors.js';
import { unresolvedBlockerQuestions } from '../domain/integrity.js';
import {
  ActorSchema,
  DesignRevisionSchema,
  ReviewDecisionSchema,
  ReviewItemSchema,
  type DesignRevision,
} from '../domain/schema.js';
import { Workspace } from '../storage/workspace.js';
import { z } from 'zod';

/** 处置输入：对单条评审作出采纳 / 拒绝 / 延期决定。 */
export const DispositionInputSchema = z.object({
  reviewId: z.string().min(1).max(200),
  decision: ReviewDecisionSchema,
  reason: z.string().max(20_000).optional(),
}).strict();

export const DispositionBatchSchema = z.object({
  expectedRevision: z.number().int().positive(),
  requestId: z.string().min(1).max(200).optional(),
  actor: ActorSchema.optional(),
  dispositions: z.array(DispositionInputSchema).min(1).max(1_000),
}).strict();

export const ReviewBatchSchema = z.object({
  expectedRevision: z.number().int().positive(),
  requestId: z.string().min(1).max(200).optional(),
  actor: ActorSchema.optional(),
  stage: z.enum(['reviewing']).optional(),
  reviews: z.array(ReviewItemSchema).min(1).max(1_000),
}).strict();

export type DispositionBatch = z.input<typeof DispositionBatchSchema>;
export type ReviewBatch = z.input<typeof ReviewBatchSchema>;

/** 把 CLI 的 accept/reject/defer 简写映射到存储用的决定值。 */
export function normalizeDecision(value: string): z.infer<typeof ReviewDecisionSchema> {
  const map: Record<string, z.infer<typeof ReviewDecisionSchema>> = {
    accept: 'accepted', accepted: 'accepted',
    reject: 'rejected', rejected: 'rejected',
    defer: 'deferred', deferred: 'deferred',
  };
  const decision = map[value.trim().toLowerCase()];
  if (!decision) throw new ZhusiError(`未知的处置决定 ${value}，可选 accept | reject | defer`, 'INVALID_INPUT');
  return decision;
}

async function baseRevision(workspace: Workspace, expectedRevision: number): Promise<DesignRevision> {
  const { state } = await workspace.readCore();
  if (expectedRevision > state.currentRevision) {
    throw new ZhusiError(`revision ${expectedRevision} 不存在，当前为 ${state.currentRevision}。`, 'REVISION_CONFLICT', false, state.currentRevision);
  }
  const base = await workspace.readRevision(expectedRevision);
  if (!base) throw new ZhusiError(`无法读取 revision ${expectedRevision}。`, 'INVALID_INPUT');
  return base;
}

/** 以基准 revision 为底生成下一份完整 revision，交给存储层做冲突与幂等判断。 */
async function commitDerived(workspace: Workspace, base: DesignRevision, changes: Partial<DesignRevision>, envelope: { expectedRevision: number; requestId?: string | undefined; actor?: DesignRevision['actor'] | undefined }, dryRun: boolean) {
  const document = DesignRevisionSchema.parse({
    ...base,
    ...changes,
    revision: base.revision + 1,
    createdAt: new Date().toISOString(),
    requestId: envelope.requestId ?? randomUUID(),
    actor: envelope.actor ?? {},
  });
  const blockers = unresolvedBlockerQuestions(document);
  if (document.stage === 'ready' && blockers.length > 0) {
    throw new ZhusiError(`存在 ${blockers.length} 个未解决的阻塞问题，不能保持 ready。`, 'STAGE_NOT_READY');
  }
  if (dryRun) {
    const { state } = await workspace.readCore();
    if (state.currentRevision !== envelope.expectedRevision) {
      throw new ZhusiError('版本已变化，请重新读取后再提交。', 'REVISION_CONFLICT', false, state.currentRevision);
    }
    return { dryRun: true, created: false, revision: document };
  }
  const { revision, created } = await workspace.commitRevision(document, envelope.expectedRevision);
  return { dryRun: false, created, revision };
}

/**
 * 追加评审意见（另一位评审者 / 另一个客户端的异步评审）。
 * 与已有 id 相同的评审被视为同一问题：新意见追加到其 opinions，而不是覆盖。
 */
export async function addReviews(input: { project?: string; batch: unknown; dryRun?: boolean }) {
  const batch = ReviewBatchSchema.parse(input.batch);
  const workspace = await Workspace.at(input.project);
  const base = await baseRevision(workspace, batch.expectedRevision);
  const reviews = base.reviews.map((review) => ({ ...review }));
  for (const incoming of batch.reviews) {
    const existing = reviews.find((review) => review.id === incoming.id);
    if (existing) {
      existing.opinions = [...(existing.opinions ?? []), ...(incoming.opinions ?? [])];
    } else {
      reviews.push(incoming);
    }
  }
  const stage = batch.stage ?? (base.stage === 'ready' ? 'reviewing' : base.stage);
  return commitDerived(workspace, base, { reviews, stage }, batch, Boolean(input.dryRun));
}

/** 把采纳 / 拒绝 / 延期结论写回评审条目，生成新的设计 revision。 */
export async function disposeReviews(input: { project?: string; batch: unknown; dryRun?: boolean }) {
  const batch = DispositionBatchSchema.parse(input.batch);
  const workspace = await Workspace.at(input.project);
  const base = await baseRevision(workspace, batch.expectedRevision);
  const missing = batch.dispositions.filter((entry) => !base.reviews.some((review) => review.id === entry.reviewId));
  if (missing.length) {
    throw new ZhusiError(`revision ${base.revision} 中找不到评审：${missing.map((entry) => entry.reviewId).join('，')}`, 'INVALID_INPUT');
  }
  const seen = new Set<string>();
  for (const entry of batch.dispositions) {
    if (seen.has(entry.reviewId)) throw new ZhusiError(`评审 ${entry.reviewId} 重复处置。`, 'INVALID_INPUT');
    seen.add(entry.reviewId);
  }
  const at = new Date().toISOString();
  const by = batch.actor?.client ?? batch.actor?.model;
  const reviews = base.reviews.map((review) => {
    const entry = batch.dispositions.find((item) => item.reviewId === review.id);
    if (!entry) return review;
    return {
      ...review,
      status: entry.decision,
      disposition: {
        decision: entry.decision,
        ...(entry.reason ? { reason: entry.reason } : {}),
        ...(by ? { by } : {}),
        at,
        revision: base.revision + 1,
      },
    };
  });
  return commitDerived(workspace, base, { reviews }, batch, Boolean(input.dryRun));
}
