const { assertType } = require('./typecheck.js');

async function pLimit(fns, opts = {}) {
  assertType(fns, 'fns', 'array');
  assertType(opts, 'opts', 'dict');
  const { limit = 10 } = opts;
  assertType(limit, 'opts.limit', 'posint', 'posinf');

  const tasks = fns.map((fn, i) => ({ fn, i }));
  const result = new Array(fns.length);

  let offset = 0;
  const worker = async () => {
    while (offset < tasks.length) {
      const { fn, i } = tasks[offset++];
      try {
        result[i] = {
          status: 'fulfilled',
          value: await fn()
        }
      } catch (err) {
        result[i] = {
          status: 'rejected',
          reason: err
        }
      }
    }
  };
  const poolLength = Math.min(limit, fns.length);
  const workerArr = Array.from({ length: poolLength }, () => worker());
  await Promise.all(workerArr);
  return result;
}

module.exports = { pLimit };