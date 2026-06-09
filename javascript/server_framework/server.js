const fs = require('fs');

class Server {
  /**
   * @param {import('http').IncomingMessage} req
   * @param {import('http').ServerResponse} res
   * @param {number} bytes
   */
  constructor(req, res, bytes = 1024 * 1024) {
    this.req = req;
    this.res = res;

    /** @type {Promise<Buffer | null>} */
    this.body = new Promise(resolve => {
      let finished = false;
      const finish = (/** @type {Buffer | null} */ val) => {
        if (finished) return;
        finished = true;
        resolve(val);
      }

      if (parseInt(this.req.headers['content-length'] || '0', 10) > bytes) {
        this.close(413);
        this.res.once('finish', () => this.req.destroy());
        return finish(null);
      }

      /** @type {Buffer[]} */
      const chunks = [];
      let received = 0;
      this.req.on('data', (/** @type {Buffer} */ chunk) => {
        if (received > bytes || this.req.destroyed) return;
        received += chunk.length;
        if (received <= bytes) return chunks.push(chunk);
        this.req.pause();
        this.close(413);
        this.res.once('finish', () => this.req.destroy());
        finish(null);
      });

      this.req.on('end', () => finish(Buffer.concat(chunks)));
      this.req.on('error', () => finish(null));
      this.req.on('close', () => finish(null));
    });

    const rawUrl = this.req.url || '/';
    const pathEnd = rawUrl.search(/[?#]/);
    const rawPathname = pathEnd === -1 ? rawUrl : rawUrl.slice(0, pathEnd);
    this.pathname = rawPathname;

    const qStart = rawUrl.indexOf('?');
    const qEnd = qStart === -1 ? -1 : rawUrl.indexOf('#', qStart);
    const rawQueryString = qStart === -1 ? ''
      : rawUrl.slice(qStart + 1, qEnd === -1 ? undefined : qEnd);
    const queries = Object.create(null);
    rawQueryString.split('&').forEach(pair => {
      if (!pair) return;
      const idx = pair.indexOf('=');
      const key = idx >= 0 ? pair.slice(0, idx) : pair;
      const value = idx >= 0 ? pair.slice(idx + 1) : '';
      if (queries[key]) queries[key].push(value);
      else queries[key] = [value];
    });

    /** @type {Record<string, string[]>} */ this.queries = queries;
    /** @type {Record<string, string[]>} */ this.params = Object.create(null);
  }

  close(code = 200) {
    if (this.res.destroyed) return;
    if (!this.res.headersSent) this.res.statusCode = code;
    if (!this.res.writableEnded) this.res.end();
  }

  redirect(location = '', temp = true) {
    if (this.res.destroyed) return;
    const code = temp ? 307 : 308;
    if (!this.res.headersSent) this.res.writeHead(code, { location });
    if (!this.res.writableEnded) this.res.end();
  }

  /**
   * @param {number} code
   * @param {import('http').OutgoingHttpHeaders} headers 
   * @returns {void}
   */
  headers(code = 200, headers = {}) {
    if (this.res.destroyed || this.res.headersSent) return;
    this.res.writeHead(code, headers);
  }

  /**
   * @param {number} code
   * @param {string} mime
   * @param {string | Buffer} data
   * @param {() => void} callback
   * @returns {void}
   */
  send(code = 200, mime = 'text/plain', data = '', callback = () => {}) {
    if (this.res.destroyed) return;
    if (!this.res.headersSent) {
      this.res.statusCode = code;
      this.res.setHeader('Content-Type', mime);
      this.res.setHeader('Content-Length', `${Buffer.byteLength(data)}`);
    } if (!this.res.writableEnded) {
      this.res.end(data, callback);
    }
  }

  /**
   * @param {number} size
   * @returns {{ start: number, end: number} | null}
   */
  range(size) {
    const range = this.req.headers.range;
    if (typeof range !== 'string' || typeof size !== 'number') return null;
    if (!isFinite(size) || range.includes(',')) return null;
    const match = range.match(/(?:bytes\s*=\s*)?(\d*)-(\d*)/i);
    if (!match) return null;
    let start = match[1] ? parseInt(match[1], 10) : null;
    let end = match[2] ? parseInt(match[2], 10) : null;
    if (start === null && end !== null) {
      start = Math.max(0, size - end);
      end = size - 1;
    } else if (start !== null) {
      end = (end === null || end >= size) ? size - 1 : end;
    } else return null;
    return (start < size && start <= end) ? { start, end } : null;
  }

  /**
   * @param {string} file
   * @param {string} mime
   * @returns {Promise<void>}
   */
  async stream(file, mime = 'application/octet-stream') {
    if (this.res.destroyed || this.res.headersSent || this.res.writableEnded) return;
    const stat = await fs.promises.stat(file).catch(() => null);
    if (!stat || !stat.isFile()) return this.close(404);

    const parse = this.range(stat.size);
    if (this.req.headers.range && !parse) {
      this.res.setHeader('Content-Range', `bytes */${stat.size}`);
      return this.close(416);
    }

    const /** @type {import('http').IncomingHttpHeaders} */ headers = {};
    headers['Accept-Ranges'] = 'bytes';
    headers['Content-Type'] = mime;
    headers['Content-Length'] = `${parse ? (parse.end - parse.start + 1) : stat.size}`;
    if (parse) headers['Content-Range'] = `bytes ${parse.start}-${parse.end}/${stat.size}`;
    this.res.writeHead(parse ? 206 : 200, headers);

    const opts = parse ? { start: parse.start, end: parse.end } : {};
    const stream = fs.createReadStream(file, opts);
    stream.on('error', () => this.res.destroy());
    this.req.on('close', () => stream.destroy());
    this.res.on('close', () => stream.destroy());
    stream.pipe(this.res);
  }
}

module.exports = { Server };