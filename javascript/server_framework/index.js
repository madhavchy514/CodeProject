const fs = require('fs');
const http = require('http');
const path = require('path');
const { Mime } = require('./mime.js');
const { Route } = require('./route.js');
const { Server } = require('./server.js');

/**
 * @typedef {http.ServerResponse} ServerResponse
 * @typedef {http.IncomingMessage} ServerRequest
 * @typedef {Record<string, string[]>} ServerParam
 * 
 * @callback ServerHandler
 * @param {Server} server
 * @returns {void}
 */

class FrameWork {
  /** @type {http.Server} */
  server = http.createServer();
  route = new Route();
  bytes = 1024 * 1024;

  /**
   * @param {string} method
   * @param {string} route
   * @param {ServerHandler[]} handlers
   */
  use(method, route, ...handlers) {
    this.route.set(method, route, ...handlers);
  }

  /**
   * @typedef {Object} StaticOptions
   * @property {string} file
   * @property {'json' | 'link' | 'none'} list
   * @property {string | null} mime
   * 
   * @param {string} route
   * @param {string} folder
   * @param {StaticOptions} opts
   */
  static(route, folder, { file = 'index.html', list = 'none', mime = null } = Object.create(null)) {
    this.use('GET', `${route}/*file_path`, async server => {
      let target = server.params.file_path?.[0];
      if (!target) target = '';
      target = decodeURIComponent(target);
      if (target.trim() === '' && list === 'none') target = file;
      const abs = path.resolve(folder);
      target = path.join(abs, target);
      if (!target.startsWith(abs)) return server.close(404);
      const stat = await fs.promises.stat(target).catch(() => null);
      if (stat && stat.isFile()) {
        const fmime = mime ? mime : Mime.mime(path.extname(target));
        return server.stream(target, fmime);
      } else if (stat && stat.isDirectory() && list !== 'none') {
        const entries = await fs.promises.readdir(target, { withFileTypes: true }).catch(() => null);
        if (!entries) return server.close(404);
        const result = await Promise.all(entries.map(entry => async () => {
          const fullPath = path.join(target, entry.name);
          const stat = await fs.promises.stat(fullPath).catch(() => null);
          if (!stat) return null;
          if (!entry.isDirectory() && !entry.isFile()) return null;
          return {
            path: path.relative(folder, fullPath),
            mtime: stat.mtimeMs,
            size: stat.size,
            type: entry.isDirectory() ? 'dir' : 'file'
          };
        }).map(async fn => await fn()).filter(Boolean));
        if (list === 'json') {
          return server.send(200, 'application/json', JSON.stringify(result));
        } else {
          let my = path.relative(abs, path.dirname(target));
          if (my === '..') my = '';
          let str = `<a href="${route + '/' + my}">📁....</a><br>`;
          for (const r of result) {
            if (!r) continue;
            const type = r.type === 'dir' ? '📁' : '📄';
            str += `<a href="${route + '/' + r.path}">${type}${path.basename(r.path)}</a><br>`;
          }
          return server.send(200, 'text/html; charset=utf-8', str);
        }
      } else {
        return server.close(500);
      }
    });
  }

  listen(port = 3000, host = '0.0.0.0', backlog = 512, callback = () => {}) {
    this.server.on('request', async (req, res) => {
      const server = new Server(req, res, this.bytes);
      try {
        const result = this.route.get(req.method || 'GET', server.pathname);
        if (!result) return server.close(404);
        server.params = result.params;
        const callbacks = result.handlers;
        for (const cb of callbacks) {
          try { await cb(server); }
          catch (error) { console.log(error); server.close(500); }
        }
      } catch (error) {
        console.log(error);
        server.close(500);
      }
    });
    this.server.listen(port, host, backlog, callback);
  }
}

module.exports = { FrameWork };