export type LockOptions = {
  retries?: number;
  minDelayMs?: number;
  staleMs?: number;
};

export declare function withLock<T>(
  fp: string,
  callback: () => Promise<T>,
  opts?: LockOptions
): Promise<T>;

export declare class Lock {
  constructor(fp: string, opts?: LockOptions);
  acquire(): Promise<void>;
  release(): Promise<void>;

  static readonly ERROR_CODES: {
    ELOCK_INTERNAL: 'Any internal error [wrapped in cause]',
    ELOCKED: 'Failed to acquire() lock and all retries are used',
    ESTALE: 'Failed to release() because lock became stale'
  }
}