const path = require('path');
const crypto = require('crypto');
const fs = require('fs/promises');

const { assertType } = require('./typecheck.js');
const { BaseError, isErrno } = require('./baseerror.js');

async function withLock(fp, callback, opts = {}) {
  assertType(callback, 'callback', 'function');
  const lock = new Lock(fp, opts);
  try {
    await lock.acquire();
    return await callback();
  } finally {
    await lock.release();
  }
}

class Lock {

  // ---------- Constructor ----------
  #filePath; #retries; #minDelayMs; #staleMs;
  #version = 0; #acquired = false;
  constructor(fp, opts = {}) {
    assertType(fp, 'fp', 'string');
    assertType(opts, 'opts', 'dict');

    const { retries = 10, minDelayMs = 50, staleMs = 5000 } = opts;
    assertType(retries, 'opts.retries', 'uint', 'posinf');
    assertType(minDelayMs, 'opts.minDelayMs', 'posint');
    assertType(staleMs, 'opts.staleMs', 'posint');

    this.#filePath = fp;
    this.#retries = retries;
    this.#minDelayMs = minDelayMs;
    this.#staleMs = staleMs;
  }

  // ---------- Helper ----------
  #lockPath = () => `${this.#filePath}.${this.#version}.lock`;
  #stalePath = () => `${this.#filePath}.${crypto.randomBytes(5).toString('hex')}.stale`;
  #jitter = (a) => Math.random() * Math.min(2950, Math.pow(2, a) * 100) + this.#minDelayMs;

  // ---------- Internal ----------
  #throwInternalError(err) {
    throw new BaseError('Lock internal error', {
      code: 'ELOCK_INTERNAL',
      cause: err,
      lockPath: this.#lockPath()
    });
  }

  async #createDir() {
    try {
      const lockDir = path.dirname(this.#lockPath());
      await fs.mkdir(lockDir, { recursive: true });
    } catch (err) {
      this.#throwInternalError(err);
    }
  }

  async #isStale(marginMs = 0) {
    try {
      const stat = await fs.stat(this.#lockPath());
      return Date.now() - stat.mtimeMs > this.#staleMs - marginMs
    } catch (err) {
      if (isErrno(err, 'ENOENT')) return false;
      this.#throwInternalError(err);
    }
  }

  // ---------- Acquire ----------
  async acquire() {
    await this.#createDir();

    let attempted = 0;
    while (true) {
      const lockPath = this.#lockPath();
      try {
        await fs.writeFile(lockPath, '', { flag: 'wx' });
        this.#acquired = true;
        return;
      } catch (err) {
        if (!isErrno(err, 'EEXIST')) {
          this.#throwInternalError(err);
        }

        if(await this.#isStale()) {
          this.#version++;
        }

        if (attempted++ >= this.#retries) {
          throw new BaseError('Failed to acquire lock', {
            code: 'ELOCKED', lockPath
          });
        }

        const delay = this.#jitter(attempted);
        await new Promise((res) => setTimeout(res, delay));
      }
    }
  }

  // ---------- Release ----------
  async release() {
    const lockPath = this.#lockPath();
    const stalePath = this.#stalePath();

    if (!this.#acquired) return;
    if (await this.#isStale(500)) {
      throw new BaseError('Failed to release lock', {
        code: 'ESTALE', lockPath
      });
    }

    try {
      await fs.rename(lockPath, stalePath);
      await fs.rm(stalePath, { recursive: true }).catch(() => {});
    } catch (err) {
      this.#throwInternalError(err);
    }
  }
}

module.exports = { withLock, Lock };