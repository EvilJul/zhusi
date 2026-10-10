import type { DesignRevision } from './schema.js';

export interface QuestionLike {
  id?: string;
  summary?: string;
  priority?: string;
  status?: string;
}

/** 未解决的阻塞问题：priority 为 blocker 且未显式标记 resolved。 */
export function unresolvedBlockerQuestions(revision: Pick<DesignRevision, 'questions'>): QuestionLike[] {
  return (revision.questions as QuestionLike[]).filter(
    (question) => question.priority === 'blocker' && question.status !== 'resolved',
  );
}
