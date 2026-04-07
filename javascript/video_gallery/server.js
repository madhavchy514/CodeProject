const fs = require('fs');
const path = require('path');
const env = require('dotenv');
const crypto = require('crypto');
const express = require('express');
const mime = require('mime-types');

class Helper {
  static resolve(reqPath, rootDir) {
    if (typeof reqPath !== 'string' || reqPath.trim() === '') return rootDir;
    const resPath = path.resolve(rootDir, reqPath.replace(/^\/+/, ''));
    if (resPath.startsWith(rootDir)) return resPath;
    return null;
  }

  static parseRange(range, size) {
    if (typeof range !== 'string' || !range.trim()) return null;
    if (typeof size !== 'number' || !isFinite(size)) return null;
    const match = range.match(/(?:bytes\s*=\s*)?(\d*)-(\d*)/i);
    if (!match) return null;
    let start = match[1] ? parseInt(match[1], 10) : null;
    let end = match[2] ? parseInt(match[2], 10) : null;
    if (start === null && end !== null) {
      start = Math.max(0, size - end);
      end = size - 1;
    } else if (start !== null) { if (end === null || end >= size) {
      end = size - 1;
    } } else {
      return null;
    }
    if (start >= size || start > end) return null;
    return { start, end };
  }

  static response(res, value, success = true, code = 200) {
    const obj = { success };
    success ? obj.result = value : obj.reason = value;
    return res.status(code).json(obj);
  }

  static async pLimit(fns, limit = 10) {
    let offset = 0;
    const result = new Array(fns.length);
    const tasks = fns.map((fn, i) => ({ fn, i }));
    const length = Math.min(limit, fns.length);
    await Promise.all(Array.from({ length }, async () => {
      while (offset < tasks.length) {
        const { fn, i } = tasks[offset++];
        try { result[i] = { status: 'fulfilled', value: await fn() }; }
        catch (err) { result[i] = { status: 'rejected', reason: err }; }
      }
    }));
    return result;
  }

  static isBase64(str) {
    if (typeof str !== 'string' || str.trim() === '' || str.length % 4 !== 0) return false;
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    return base64Regex.test(str);
  }

  static cachePath(file, cacheDir) {
    const h = crypto.createHash('md5').update(file).digest('hex');
    const s1 = h[0] + (h[1]||'');
    const s2 = (h[2]||'') + (h[3]||'');
    return path.join(cacheDir, s1, s2, h);
  }
}

env.config({ path: './.env', quiet: true });

const APP = express();
const PORT = process.env.PORT;
const PUBLIC_DIR = path.resolve(process.env.PUBLIC);
const ROOT_DIR = path.resolve(process.env.ROOT);
const CACHE_DIR = path.resolve(process.env.CACHE);

APP.use(express.static(PUBLIC_DIR));
APP.use('/cache', express.static(CACHE_DIR));
APP.use(express.json());
APP.listen(PORT, () => {
  console.log(`http://localhost:${PORT}`);
});

APP.get('/explore', async (req, res) => {
  const dir = Helper.resolve(req.query.path, ROOT_DIR);
  if (!dir) return Helper.response(res, 'path invalid', false);
  const entries = await fs.promises.readdir(dir, { withFileTypes: true }).catch(() => null);
  if (!entries) return Helper.response(res, 'path not found', false);
  const result = (await Helper.pLimit(entries.map((entry) => async () => {
    const fullPath = path.join(dir, entry.name);
    const mimeType = mime.lookup(fullPath) || 'application/octet-stream';
    const type = entry.isDirectory() ? 'inode/directory' : entry.isFile() ? mimeType : 'unknown';
    if (type === 'unknown') return null;
    const ok = await fs.promises.access(fullPath, fs.constants.R_OK).then(() => true).catch(() => false);
    if (!ok) return null;
    const stat = await fs.promises.stat(fullPath).catch(() => null);
    if (!stat) return null;
    const relPath = path.relative(ROOT_DIR, fullPath);
    let thumb = null;
    if (stat.isFile()) {
      const cachePath = Helper.cachePath(fullPath, CACHE_DIR);
      const exist = await fs.promises.access(cachePath).then(() => true).catch(() => false);
      if (exist) thumb = `/cache/${path.relative(CACHE_DIR, cachePath)}`;
    }
    return {
      path: relPath, type: type,
      mtime: stat.mtimeMs, size: stat.size,
      base: path.basename(relPath),
      ext: path.extname(relPath), thumb
    };
  }), 100)).filter((r) => r.status === 'fulfilled' && r.value !== null).map((r) => r.value);
  return Helper.response(res, result);
});

APP.get('/media', async (req, res) => {
  const media = Helper.resolve(req.query.path, ROOT_DIR);
  if (!media) return res.sendStatus(404);
  const stat = await fs.promises.stat(media).catch(() => null);
  if (!stat || !stat.isFile()) return res.sendStatus(404);
  const type = mime.lookup(media) || 'application/octet-stream';
  const range = req.headers.range;
  const parse = Helper.parseRange(range, stat.size);
  if (range && !parse) return res.sendStatus(416);
  const header = parse ? {
    'Content-Range': `bytes ${parse.start}-${parse.end}/${stat.size}`,
    'Accept-Ranges': 'bytes',
    'Content-Length': parse.end - parse.start + 1,
    'Content-Type': type,
  } : {
    'Content-Length': stat.size,
    'Content-Type': type,
    'Accept-Ranges': 'bytes'
  }
  res.writeHead(parse ? 206 : 200, header);
  const opts = parse ? { start: parse.start, end: parse.end } : {};
  const stream = fs.createReadStream(media, opts);
  req.on('close', () => stream.destroy());
  stream.on('error', () => res.end());
  stream.pipe(res);
});

APP.get('/data', async (req, res) => {
  const file = Helper.resolve(req.query.path, ROOT_DIR);
  if (!file) return Helper.response(res, 'invalid path', false);
  const stat = await fs.promises.stat(file).catch(() => null);
  if (!stat) return Helper.response(res, 'path not found', false);
  if (!stat.isFile()) return Helper.response(res, 'path not file', false);
  const range = req.query.range;
  const parse = Helper.parseRange(range, stat.size);
  if (range && !parse) return Helper.response(res, 'invalid range', false);
  const length = range ? parse.end - parse.start + 1 : stat.size;
  if (length > 1024 * 1024 * 10) return Helper.response(res, 'range too large', false);
  const fd = await fs.promises.open(file, 'r').catch(() => null);
  if (!fd) return Helper.response(res, 'path not found', false);
  try {
    const buffer = Buffer.alloc(length);
    await fd.read(buffer, 0, length, range ? parse.start : 0);
    return Helper.response(res, buffer.toString(req.query.type === 'hex' ? 'hex' : 'utf-8'));
  } finally {
    await fd.close();
  }
});

APP.post('/thumb', async (req, res) => {
  const file = Helper.resolve(req.body.path, ROOT_DIR);
  if (!file) return Helper.response(res, 'invalid path', false);
  const str = req.body.base64;
  if (!Helper.isBase64(str)) return Helper.response(res, 'invalid base64', false);
  const buffer = Buffer.from(str, 'base64');
  const cachePath = Helper.cachePath(file, CACHE_DIR);
  try {
    await fs.promises.mkdir(path.dirname(cachePath), { recursive: true });
    const exist = await fs.promises.access(cachePath).then(() => true).catch(() => false);
    if (exist) return Helper.response(res, 'thumb exists', false);
    await fs.promises.writeFile(cachePath, buffer);
    return Helper.response(res, 'thumb stored');
  } catch {
    return Helper.response(res, 'failed to store', false);
  }
});