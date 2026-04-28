export type BaseErrorOptions = {
  [x: string]: any;
  [x: symbol]: any;
  message?: string;
  cause?: any;
  name?: string;
};

export declare class BaseError extends Error {
  constructor(
    msg: any,
    opts?: BaseErrorOptions
  );
}

export declare function isErrno(
  err: any,
  ...codes: any[]
): boolean;