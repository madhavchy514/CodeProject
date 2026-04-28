export type pLimitResult<T> = {
  status: 'fulfilled';
  value: T
} | {
  status: 'rejected';
  reason: any
};

export declare function pLimit<T>(
  fns: (() => Promise<T>)[],
  opts?: { limit?: number }
): Promise<(pLimitResult<T>)[]>;