class BaseError extends Error {
  constructor(msg, opts = {}) {

    if (typeof opts !== 'object' || opts === null || Array.isArray(opts)) opts = {}
    const { message = msg, cause, name = new.target.name, ...rest } = opts;
    super(message, cause === undefined ? {} : { cause });

    Object.assign(this, rest);
    Error.captureStackTrace?.(this, new.target);
    Object.defineProperty(this, 'name', {
      value: name,
      writable: true,
      enumerable: false,
      configurable: true
    });
  }
}

function isErrno(err, ...codes) {
  return err instanceof Error && codes.includes(err?.code);
}

module.exports = { BaseError, isErrno };