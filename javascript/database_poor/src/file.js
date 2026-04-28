const path = require('path');
const crypto = require('crypto');
const fs = require('fs/promises');

const { assertType } = require('./typecheck.js');
const { BaseError, isErrno } = require('./baseerror.js');

class File {
  static async readJson(fp) {
    assertType(fp, 'fp', 'string');
    const content = await fs.readFile(fp, 'utf-8');
    try {
      return JSON.parse(content);
    } catch {
      throw new BaseError(`Invalid JSON format in file [${fp}]`, {
        code: 'EJSON',
        path: fp
      });
    }
  }

  static async writeAtomic(fp, data) {
    assertType(fp, 'fp', 'string');
    assertType(data, 'data', 'string');
    const tmpPath = `${fp}.${crypto.randomBytes(5).toString('hex')}.tmp`;
    await fs.mkdir(path.dirname(fp), { recursive: true });
    await fs.writeFile(tmpPath, data, 'utf-8');
    await fs.rename(tmpPath, fp);
  }

  static async deleteAtomic(fp) {
    assertType(fp, 'fp', 'string');
    const trashPath = `${fp}.${crypto.randomBytes(5).toString('hex')}.trash`;
    await fs.rename(fp, trashPath);
    await fs.rm(trashPath, { recursive: true }).catch(() => {});
  }

  static async exists(fp) {
    assertType(fp, 'fp', 'string');
    try {
      await fs.access(fp);
      return true;
    } catch (err) {
      if (isErrno(err, 'ENOENT')) 
        return false;
      throw err;
    }
  }
}

module.exports = { File };