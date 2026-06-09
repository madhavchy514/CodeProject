/**
 * @typedef {(...arg: any[]) => any} RouteFunction
 * @typedef {'static' | 'param' | 'wildcard'} RouteType
 * 
 * @typedef {Object} RouteNode
 * @property {number} depth
 * @property {RouteType} type
 * @property {string} segment
 * @property {string[]} routes
 * @property {RouteFunction[]} handlers
 * @property {Map<string, RouteNode>} statics
 * @property {RouteNode | null} param
 * @property {RouteNode | null} wildcard
 * 
 * @typedef {Object} RouteResult
 * @property {string[]} routes
 * @property {RouteFunction[]} handlers
 * @property {Record<string, string[]>} params
 */

class Route {
  /** @type {Map<string, RouteNode>} */
  trie = new Map();

  /**
   * @param {number} depth
   * @param {RouteNode['type']} type
   * @param {string} segment
   * @param {string[]} routes
   * @param {RouteFunction[]} handlers
   * @param {Map<string, RouteNode>} statics
   * @param {RouteNode | null} param
   * @param {RouteNode | null} wildcard
   * @returns {RouteNode}
   */
  node(depth = 0, type = 'static', segment = '', routes = [], handlers = [], statics = new Map(), param = null, wildcard = null) {
    return { depth, type, segment, routes, handlers, statics, param, wildcard };
  }

  /**
   * @param {string} method
   * @param {string} route
   * @param {RouteFunction[]} handlers
   * @returns {void}
   */
  set(method, route, ...handlers) {
    /** @type {string[]} */
    const segments = route.split('/').map(s => s.trim()).filter(Boolean);

    /** @type {string[]} */
    const routes = [];

    const cleanMethod = method.toUpperCase().trim();
    let node = this.trie.get(cleanMethod);
    if (!node) {
      node = this.node();
      this.trie.set(cleanMethod, node);
    }

    for (let i = 0; i < segments.length; i++) {
      const depth = i + 1;
      const raw = segments[i];
      routes.push(raw);

      const type = raw.startsWith('*') ? 'wildcard' : raw.startsWith(':') ? 'param' : 'static';
      const segment = type === 'static' ? raw : raw.slice(1);

      if (segment.trim() === '') throw new Error('Invalid segment');
      if (type === 'wildcard' && i != segments.length - 1) throw new Error('Wildcard must be end');
      if (type === 'wildcard' && node.wildcard && node.wildcard.segment !== segment) throw new Error('Wildcard name conflict on same level');
      if (type === 'param' && node.param && node.param.segment !== segment) throw new Error('Param name conflict on same level');

      let next = /** @type {RouteNode} */ (type === 'static' ? node.statics.get(segment) : type === 'param' ? node.param : node.wildcard);
      if (!next) {
        next = this.node(depth, type, segment, [...routes]);
        if (type === 'static') node.statics.set(segment, next);
        else if (type === 'param') node.param = next;
        else if (type === 'wildcard') node.wildcard = next;
      } node = next;
    }

    node.handlers.push(...handlers);
  }

  /**
   * @param {string} method
   * @returns {void}
   */
  print(method) {
    const cleanMethod = method.toUpperCase().trim();
    const root = this.trie.get(cleanMethod);
    if (!root) return console.log(null);

    const walk = (/** @type {RouteNode} */ node, prefix = '', isLast = true, depth = 0) => {
      const connector = depth === 0 ? '' : isLast ? '└── ' : '├── ';
      const segment = `\x1b[1;36m[Segment: (${node.segment})]\x1b[0m`;
      const routes = `\x1b[33m [Route: (/${node.routes.join('/')})]\x1b[0m`;
      const handlers = `\x1b[2m [Handlers: (${node.handlers.length})]\x1b[0m`;
      console.log(`${prefix}${connector}${segment}${routes}${handlers}`);

      const childPrefix = depth === 0 ? '' : prefix + (isLast ? '    ' : '│   ');
      const all = [
        ...[...node.statics.values()].map(n => ({ node: n, last: false })),
        ...(node.param    ? [{ node: node.param,    last: !node.wildcard }] : []),
        ...(node.wildcard ? [{ node: node.wildcard, last: true           }] : []),
      ];

      all.forEach((entry, i) => {
        entry.last = i === all.length - 1;
        walk(entry.node, childPrefix, entry.last, depth + 1);
      });
    };

    walk(root);
  }

  /**
   * @param {string} method
   * @param {string} pathname
   * @returns {RouteResult | null}
   */
  get(method, pathname) {
    const segments = pathname.split('/').map(s => s.trim()).filter(Boolean);
    const cleanMethod = method.toUpperCase().trim();
    let node = this.trie.get(cleanMethod);
    if (!node) return null;

    /** @type {RouteResult[]} */
    const results = [];

    /**
     * @param {RouteNode} node
     * @param {number} i
     * @param {Record<string, string[]>} params
     */
    const walk = (node, i, params) => {
      if (i === segments.length) {
        if (node.handlers.length) results.push({ routes: node.routes, handlers: node.handlers, params });
        if (node.wildcard && node.wildcard.handlers.length) {
          const key = node.wildcard.segment;
          const prev = params[key] ?? [];
          results.push({
            routes: node.wildcard.routes,
            handlers: node.wildcard.handlers,
            params: { ...params, [key]: [...prev, ''] }
          });
        }
        return;
      }

      const segment = segments[i];

      const staticNode = node.statics.get(segment);
      if (staticNode) walk(staticNode, i + 1, { ...params });

      if (node.param) {
        const key = node.param.segment;
        const prev = params[key] ?? [];
        walk(node.param, i + 1, { ...params, [key]: [...prev, segment] });
      }

      if (node.wildcard && node.wildcard.handlers.length) {
        const key = node.wildcard.segment;
        const prev = params[key] ?? [];
        results.push({
          routes: node.wildcard.routes,
          handlers: node.wildcard.handlers,
          params: { ...params, [key]: [...prev, segments.slice(i).join('/')] }
        });
      }
    };

    walk(node, 0, {});
    
    if (results.length === 0) return null;

    const score = (s = '') => {
      if (s.startsWith('*')) return 0;
      if (s.startsWith(':')) return 1;
      return 2;
    };

    results.sort((a, b) => {
      const min = Math.min(a.routes.length, b.routes.length);

      for (let i = 0; i < min; i++) {
        const diff = score(b.routes[i]) - score(a.routes[i]);
        if (diff !== 0) return diff;
      }

      const al = a.routes.length;
      const bl = b.routes.length;

      if (al === bl) return 0; // already structurally trie won't allow, just a vague check

      const longer  = al > bl ? a : b;
      const shorter = al > bl ? b : a;

      const last = longer.routes[longer.routes.length - 1];

      if (
        longer.routes.length - 1 === shorter.routes.length &&
        last.startsWith('*')
      ) {
        return longer === a ? 1 : -1;
      }

      return al > bl ? -1 : 1;
    });
    return results[0];
  }
}

module.exports = { Route };