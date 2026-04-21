const electron = require('electron');
const mime = require('mime-types');
const path = require('path');
const fs = require('fs');

class Helper {
  static resolve(reqPath, rootDir) {
    if (typeof reqPath !== 'string' || reqPath.trim() === '') return rootDir;
    const resPath = path.resolve(rootDir, reqPath);
    if (!resPath.startsWith(rootDir)) return null;
    return resPath;
  }

  static cachePath(file, cacheDir) {
    const h = Buffer.from(file, 'utf-8').toString('hex');
    const s1 = h[0] + (h[1]||'');
    const s2 = (h[2]||'') + (h[3]||'');
    return path.join(cacheDir, s1, s2, h);
  }
}

const root = path.resolve('~/LINUX_BULK/');
const cache = path.join(__dirname, '..', 'cache');
const max = 10000;

electron.contextBridge.exposeInMainWorld('api', {
  explore: (reqPath) => {
    try {
      const dir = Helper.resolve(reqPath, root);
      if (!dir) return { error: 'invalid reqPath' };

      let entries = null;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }) }
      catch (err) {
        switch (err.code) {
          case 'ENOENT': return { error: 'nonExist reqPath' };
          case 'ENOTDIR': return { error: 'nonDir reqPath' };
          default: throw err;
        }
      }

      const result = entries.map((entry) => {
        const fullPath = path.join(dir, entry.name);

        try { fs.accessSync(fullPath, fs.constants.R_OK); }
        catch { return null; }

        let stat = null;
        try { stat = fs.statSync(fullPath); }
        catch (err) {
          if (err.code !== 'ENOENT') throw err;
          return null;
        }

        const relPath = path.relative(root, fullPath);
        const cachePath = Helper.cachePath(fullPath, cache);
        const hasThumb = fs.existsSync(cachePath);

        return {
          path: relPath,
          type: entry.isDirectory() ? 'inode/directory' : (mime.lookup(fullPath) || 'application/octet-stream'),
          mtime: stat.mtimeMs,
          size: stat.size,
          base: entry.name,
          ext: path.extname(entry.name),
          thumb: hasThumb ? `file://${cachePath}` : null
        };
      }).filter((v) => v !== null);
      return { result };
    } catch (err) {
      console.log(err);
      return { error: 'unknown error' };
    }
  },

  getData: (reqPath, offset, length) => {
    let fd = null;
    try {
      const file = Helper.resolve(reqPath, root);
      if (!file) return { error: 'invalid reqPath' };

      let stat = null;
      try {
        stat = fs.statSync(file);
        if (!stat.isFile()) return { error: 'nonFile reqPath' };
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
        return { error: 'nonExist reqPath' };
      }

      if (stat.size === 0) return { error: 'empty reqPath' };
      if (!Number.isInteger(offset) || offset < 0 || offset >= stat.size) return { error: 'invalid offset' };
      if (!Number.isInteger(length) || length <= 0 || length > max) return { error: 'invalid length' };
      if ((offset + length) > stat.size) return { error: 'invalid length' };

      const buffer = Buffer.alloc(length);
      fd = fs.openSync(file, 'r');
      const read = fs.readSync(fd, buffer, 0, length, offset);
      if (read !== length) return { error: 'corrupt read' };
      return { result: buffer };
    } catch (err) {
      console.log(err);
      return { error: 'unknown error' };
    } finally {
      if (fd !== null) fs.closeSync(fd);
    }
  },

  saveThumb: (reqPath, uint8Array) => {
    try {
      const file = Helper.resolve(reqPath, root);
      if (!file) return { error: 'invalid reqPath' };
      if (!(uint8Array instanceof Uint8Array)) return { error: 'invalid uint8Array' };
      const buffer = Buffer.from(uint8Array);
      const cachePath = Helper.cachePath(file, cache);
      fs.mkdirSync(path.dirname(cachePath), { recursive: true });
      fs.writeFileSync(cachePath, buffer);
      return { result: null };
    } catch (err) {
      console.log(err);
      return { error: 'unknown error' };
    }
  },

  getMediaUrl: (reqPath) => {
    try {
      const file = Helper.resolve(reqPath, root);
      if (!file) return  { error: 'invalid reqPath' };
      try {
        const stat = fs.statSync(file);
        if (!stat.isFile()) return { error: 'nonFile reqPath' };
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
        return { error: 'nonExist reqPath' }
      }
      return { result: `file://${file}` };
    } catch (err) {
      console.log(err);
      return { error: 'unknown error' };
    }
  }
});