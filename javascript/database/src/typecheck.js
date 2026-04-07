const { BaseError } = require('./baseerror.js');

const validatorMap = {
  string: v => typeof v === 'string',
  number: v => typeof v === 'number',
  boolean: v => typeof v === 'boolean',
  bigint: v => typeof v === 'bigint',
  symbol: v => typeof v === 'symbol',
  undefined: v => typeof v === 'undefined',
  function: v => typeof v === 'function',
  object: v => typeof v === 'object' && v !== null,

  primitive: v => v === null || (typeof v !== 'function' && typeof v !== 'object'),
  scalar: v => v === null||(typeof v === 'number' && Number.isFinite(v))||typeof v === 'string'||typeof v === 'boolean',
  null: v => v === null,

  text: v => typeof v === 'string' && v.trim() !== '',
  hex: v => typeof v === 'string' && v.length%2 === 0 && /^[a-fA-F0-9]+$/.test(v),
  alphanumeric: v => typeof v === 'string' && /^[a-zA-Z0-9]+$/.test(v),
  slug: v => typeof v === 'string' && /^[a-z0-9_-]+$/.test(v),
  uuid4: v => typeof v === 'string' && /^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i.test(v),

  posint: v => Number.isInteger(v) && v > 0,
  uint: v => Number.isInteger(v) && v >= 0,
  posinf: v => v === Infinity,

  dict: v => typeof v === 'object' && v !== null && !Array.isArray(v),
  array: v => Array.isArray(v),
  error: v => v instanceof Error,
  json: v => { try { JSON.stringify(v); return true; } catch { return false; } },
  buffer: v => Buffer.isBuffer(v)
}

function isOneOf(value, ...types) {
  return types.some(type => {
    if (type in validatorMap)
      return validatorMap[type](value);
    throw new BaseError(`Unknown type name [${type}]`);
  });
}

function assertType(value, field, ...types) {
  if (!isOneOf(value, ...types)) {
    const errMsg = `Assertion failed on [${field}]`;
    throw new BaseError(errMsg, {
      code: 'ASSERTION_FAILED', expected: types,
      received: { type: typeof value, value }
    });
  }
}

module.exports = { validatorMap, isOneOf, assertType };