const path = require('path');
const crypto = require('crypto');
const fs = require('fs/promises');

const { isOneOf, assertType } = require('./typecheck.js');
const { BaseError, isErrno } = require('./baseerror.js');
const { pLimit } = require('./plimit.js');
const { withLock } = require('./lock.js');
const { File } = require('./file.js');

class Mapbase {

  // ---------- Constructor ----------
  #mainDir; #chunkSize;
  constructor(mbDir, table, chunkSize = 100) {
    assertType(mbDir, 'mbDir', 'text');
    assertType(table, 'table', 'text');
    assertType(chunkSize, 'chunkSize', 'posint');

    this.#mainDir = path.join(mbDir, this.#hex(table));
    this.#chunkSize = chunkSize;
  }

  // ---------- Helper ----------
  #hex = (s) => Buffer.from(s, 'utf-8').toString('hex');
  #shard = (p, k) => path.join(p, path.join(k[0] + (k[1]||''), (k[2]||'') + (k[3]||''), k).toLowerCase());
  #keyDir = (key) => this.#shard(this.#mainDir, this.#hex(key));
  #counterPath = (key) => path.join(this.#keyDir(key), 'counter');
  #plainPath = (key, id) => this.#shard(path.join(this.#keyDir(key), 'plain'), this.#hex(id));
  #pagePath = (key, page) => path.join(this.#keyDir(key), 'page', String(page));
  #stop = () => { throw new Error('') };
  #validate = (key, id = '', doToId = false) => {
    assertType(key, 'key', 'text');
    if(doToId) assertType(id, 'id', 'text');
  };

  // ---------- Page ----------
  async #readPage(key, page) {
    const fp = this.#pagePath(key, page);
    let ids;

    try {
      const content = await fs.readFile(fp, 'utf-8');
      ids = content.split('\n');
    } catch (err) {
      if (isErrno(err, 'ENOENT'))
        return [];
      this.#stop();
    }

    return ids.filter(id => id.trim() !== '').map(id => {
      if (!isOneOf(id, 'hex')) {
        this.#stop();
      } else {
        return Buffer.from(id, 'hex').toString('utf-8');
      }
    });
  }

  async #writePage(key, id, page, type = 'create') {
    let ids = await this.#readPage(key, page);

    if (type === 'create')
      ids.push(id)

    if (type === 'delete') {
      const newIds = ids.filter(existingId => existingId !== id);
      if (ids.length - newIds.length !== 1)
        this.#stop();
      ids = [...newIds];
    }
    
    const str = ids.map(id => this.#hex(id)).join('\n');
    try {
      const fp = this.#pagePath(key, page);
      await File.writeAtomic(fp, str);
    } catch {
      this.#stop();
    }
  }

  // ---------- Counter ----------
  #extractCounter(str) {
    const parts = str.split('-');
    if (parts.length !== 2)
      this.#stop();

    const obj = {
      page: Number(parts[0]),
      index: Number(parts[1])
    };

    if (!isOneOf(obj.page, 'uint') || !isOneOf(obj.index, 'uint'))
      this.#stop();

    return obj;
  }

  async #readCounter(key) {
    try {
      const fp = this.#counterPath(key);
      const content = await fs.readFile(fp, 'utf-8');
      return this.#extractCounter(content);
    } catch (err) {
      if (isErrno(err, 'ENOENT'))
        return { page: 0, index: 0 }
      this.#stop();
    }
  }

  async #updateCounter(key, { page, index }) {
    const obj = index >= this.#chunkSize - 1
      ? { page: page + 1, index: 0 }
      : { page: page, index: index + 1 };

    try {
      const fp = this.#counterPath(key);
      await File.writeAtomic(fp, `${obj.page}-${obj.index}`);
    } catch {
      this.#stop();
    }
  }

  // ---------- Create ----------
  async #createLogic(key, id) {
    const plainPath = this.#plainPath(key, id);
    if (await File.exists(plainPath)) {
      throw new BaseError('Id already exists', {
        code: 'ID_FOUND', key, id
      });
    }
    const { page, index } = await this.#readCounter(key);
    await this.#writePage(key, id, page, 'create');
    await File.writeAtomic(plainPath, String(page));
    await this.#updateCounter(key, { page, index });
  }

  async create(key, id) {
    this.#validate(key, id, true);
    try {
      const keyDir = this.#keyDir(key);
      await withLock(keyDir, () => this.#createLogic(key, id));
      return id;
    } catch (err) {
      if (isErrno(err, 'ID_FOUND'))
        throw err;
      throw new BaseError('Failed to create Id', {
        code: 'CREATE_FAILED', key, id
      });
    }
  }

  // ---------- Delete ----------
  async #deleteLogic(key, id) {
    const plainPath = this.#plainPath(key, id);
    let content;
    try {
      content = await fs.readFile(plainPath, 'utf-8');
    } catch (err) {
      if (!isErrno(err, 'ENOENT'))
        this.#stop();
      throw new BaseError('Id not found', {
        code: 'ID_NOT_FOUND', key, id
      });
    }
    const page = Number(content);
    if (!isOneOf(page, 'uint')) this.#stop();
    await File.deleteAtomic(plainPath);
    await this.#writePage(key, id, page, 'delete');
  }

  async delete(key, id) {
    this.#validate(key, id, true);
    try {
      const keyDir = this.#keyDir(key);
      await withLock(keyDir, () => this.#deleteLogic(key, id));
    } catch (err) {
      if (isErrno(err, 'ID_NOT_FOUND'))
        throw err;
      throw new BaseError('Failed to delete Id', {
        code: 'DELETE_FAILED', key, id 
      });
    }
  }

  async deleteKey(key) {
    this.#validate(key);
    try {
      const keyDir = this.#keyDir(key);
      await withLock(keyDir, async () => {
        if (await this.hasKey(key))
          return await File.deleteAtomic(keyDir);
        throw new BaseError('Key not found', {
          code: 'KEY_NOT_FOUND', key
        });
      });
    } catch (err) {
      if (isErrno(err, 'KEY_NOT_FOUND'))
        throw err;
      throw new BaseError('Failed to delete key', {
        code: 'DELETE_KEY_FAILED', key
      });
    }
  }

  // ---------- Read ----------
  async #readLogic(key, limit, offset, asc, batch) {
    const result = [];
    const { page } = await this.#readCounter(key);
    for (
      let i = asc ? 0 : page;
      asc ? i <= page : i >= 0;
      asc ? i++ : i--
    ) {
      if (result.length >= limit + offset) break;
      const rawIds = await this.#readPage(key, i);
      if (!asc) rawIds.reverse();

      const checkBatch = rawIds.map(id => () => File.exists(this.#plainPath(key, id)));
      const checkResult = (await pLimit(checkBatch, { limit: batch })).map(r => {
        if (r.status === 'rejected') 
          this.#stop();
        return r.value;
      });

      const ids = rawIds.filter((id, i) => checkResult[i]);
      result.push(...ids);
    }

    return result.slice(offset, limit + offset);
  }

  async read(key, opts = {}) {
    this.#validate(key);
    assertType(opts, 'opts', 'dict');
    const { limit = Infinity, offset = 0, asc = false, batch = 10 } = opts;
    assertType(limit, 'opts.limit', 'posint', 'posinf');
    assertType(offset, 'opts.offset', 'uint');
    assertType(asc, 'opts.asc', 'boolean');
    assertType(batch, 'opts.batch', 'posint');

    try {
      return await this.#readLogic(key, limit, offset, asc, batch);
    } catch {
      throw new BaseError('Failed to read key', {
        code: 'READ_FAILED', key
      });
    }
  }

  // ---------- Has ----------
  async hasKey(key) {
    this.#validate(key);
    try {
      const ids = await this.read(key, { limit: 1 });
      return ids.length > 0;
    } catch (err) {
      throw new BaseError('Failed to check key existence', {
        code: 'HAS_KEY_FAILED', key
      });
    }
  }

  async hasId(key, id) {
    this.#validate(key, id, true);
    try {
      const plainPath = this.#plainPath(key, id);
      return await File.exists(plainPath);
    } catch (err) {
      throw new BaseError('Failed to check Id existence', {
        code: 'HAS_ID_FAILED', key, id
      });
    }
  }
}


class Database {

  // ---------- Constructor ----------
  #mainDir;
  constructor(dbDir, table) {
    assertType(dbDir, 'mbDir', 'text');
    assertType(table, 'table', 'text');
    this.#mainDir = path.join(dbDir, this.#hex(table));
  }

  // ---------- Helper ----------
  #hex = (s) => Buffer.from(s, 'utf-8').toString('hex');
  #genId = () => `${crypto.randomBytes(10).toString('hex')}${Date.now().toString(36)}`;
  #idPath = (id) => {
    const hex = this.#hex(id);
    const shard = path.join(hex[0] + (hex[1]||''), (hex[2]||'') + (hex[3]||''), hex);
    return path.join(this.#mainDir, (shard).toLowerCase());
  }
  #throwNotFoundError(id) {
    throw new BaseError('Record not found', {
      code: 'RECORD_NOT_FOUND', id
    });
  }

  // ---------- Create ----------
  async create(record) {
    assertType(record, 'record', 'json');

    const id = this.#genId();
    const idPath = this.#idPath(id);
    try {
      const str = JSON.stringify(record);
      await withLock(idPath, () => File.writeAtomic(idPath, str));
      return id;
    } catch (err) {
      throw new BaseError('Failed to create record', {
        code: 'CREATE_FAILED', record
      });
    }
  }

  // ---------- Read ----------
  async read(id) {
    assertType(id, 'id', 'text');
    try {
      const idPath = this.#idPath(id);
      return await File.readJson(idPath);
    } catch (err) {
      if (isErrno(err, 'ENOENT'))
        this.#throwNotFoundError(id);
      throw new BaseError('Failed to read record', {
        code: 'READ_FAILED', id
      });
    }
  }

  // ---------- Delete ----------
  async delete(id) {
    assertType(id, 'id', 'text');
    try {
      const idPath = this.#idPath(id);
      await withLock(idPath, () => File.deleteAtomic(idPath));
    } catch (err) {
      if (isErrno(err, 'ENOENT'))
        this.#throwNotFoundError(id);
      throw new BaseError('Failed to delete record', {
        code: 'DELETE_FAILED', id
      });
    }
  }

  // ---------- Update ----------
  async update(id, record) {
    assertType(id, 'id', 'text');
    assertType(record, 'record', 'json');

    const idPath = this.#idPath(id);
    try {
      const str = JSON.stringify(record);
      return await withLock(idPath, async () => {
        if (await File.exists(idPath))
          return await File.writeAtomic(idPath, str);
        this.#throwNotFoundError(id);
      });
    } catch (err) {
      if (isErrno(err, 'RECORD_NOT_FOUND'))
        throw err;
      throw new BaseError('Failed to update record', {
        code: 'UPDATE_FAILED', id
      });
    }
  }
}

module.exports = { Mapbase, Database };