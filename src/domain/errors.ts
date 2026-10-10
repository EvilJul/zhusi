export type ErrorCode = 'RUNTIME_ERROR' | 'INVALID_INPUT' | 'REVISION_CONFLICT' | 'PROJECT_BUSY' | 'STAGE_NOT_READY';

export class ZhusiError extends Error {
  constructor(message: string, readonly code: ErrorCode = 'RUNTIME_ERROR', readonly retryable = false, readonly latestRevision?: number) {
    super(message);
    this.name = 'ZhusiError';
  }
}

export const EXIT_CODES: Record<ErrorCode, number> = {
  RUNTIME_ERROR: 1,
  INVALID_INPUT: 2,
  REVISION_CONFLICT: 3,
  PROJECT_BUSY: 3,
  STAGE_NOT_READY: 4,
};
