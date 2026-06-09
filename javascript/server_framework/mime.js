class Mime {
  /** @type {Record<string, any>} */
  static _dbs = require('./lib/mime.json');

  /** @type {Map<string, string[]>} */
  static _mimes =  new Map();

  /** @type {Map<string, string>} */
  static _exts = new Map();

  static {
    Object.entries(this._dbs).forEach(([mime, entry]) => {
      if (!entry?.extensions) return;
      this._mimes.set(mime, entry.extensions);
      entry.extensions.forEach((/** @type {string} */ ext) => {
        this._exts.set(ext, mime);
      });
    });
  }

  /**
   * @param {string} ext
   * @returns {string}
   */
  static mime(ext) {
    const clean = ext.replace(/^\./, '').toLowerCase().trim();
    return this._exts.get(clean) || 'application/octet-stream';
  }

  /**
   * @param {string} mime
   * @returns {string[]}
   */
  static ext(mime)  {
    const entry = this._mimes.get(mime);
    return entry ? [...entry] : [];
  }
}

module.exports = { Mime };