// Local hub server (zero dependencies). Serves the page and a small write API on 127.0.0.1 only.
//   GET  /hub/             the page (rebuilt first if it is more than 15 s old), with the write token injected
//   GET  /file?p=<abs>     a file under one of the configured roots (previews, docs); dotfiles and secret-looking
//                          files are refused; HTML/SVG are sandboxed so they cannot read the token
//   POST /api/<op>         comment | resolve | reopen | set | order | addrow  (writes as "you"), rebuild,
//                          open { how: "editor" | "reveal", path }
// Security: Host must be localhost/127.0.0.1:<port> (stops DNS rebinding); every POST needs a same-origin Origin, a JSON
// content type and the X-Hub-Token header (cross-site pages cannot send that without a CORS preflight, which this
// server never grants); cross-site loads of files are refused. The token lives in the data dir and is put into the
// served page only, so the page file on disk carries no secret.
import http from 'node:http';
import { createReadStream, statSync, existsSync, readFileSync } from 'node:fs';
import { timingSafeEqual, createHash } from 'node:crypto';
import path from 'node:path';
import { HubError, isInside, token, relTo } from './lib.mjs';
import { build, TOKEN_PLACEHOLDER } from './build.mjs';
import { act, ACT_OPS } from './thread.mjs';
import { skillPaths } from './skills.mjs';
import * as realPlatform from './platform.mjs';

/** Non-secret id of this hub instance (hash of its data dir), so `loopboard doctor` / `loopboard open` can tell it from any other server on the port. */
export const instanceId = cfg => createHash('sha256').update(String(cfg.dataDir)).digest('hex').slice(0, 16);

const SECRET = /(^|[\\/])\.|\.(keystore|jks|p12|pem|key|env|pfx)$|credential|secret|token|id_rsa|service-account|google-services\.json|GoogleService-Info\.plist/i;
const TYPES = { html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8', css: 'text/css', js: 'text/javascript', mjs: 'text/javascript', json: 'application/json', md: 'text/markdown; charset=utf-8', txt: 'text/plain; charset=utf-8', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', pdf: 'application/pdf', csv: 'text/plain; charset=utf-8', yml: 'text/plain; charset=utf-8', yaml: 'text/plain; charset=utf-8' };
const SEC_HEADERS = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'SAMEORIGIN' };

const send = (res, code, body, type = 'text/plain; charset=utf-8', extra = {}) => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', ...SEC_HEADERS, ...extra }); res.end(body); };
const json = (res, code, o) => send(res, code, JSON.stringify(o), 'application/json');
const realRead = f => readFileSync(f, 'utf8');
const sameToken = (a, b) => { const x = Buffer.from(String(a ?? '')), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

export function createHubServer(cfg, opts = {}) {
  const platform = opts.platform || realPlatform;
  const page = path.join(cfg.dataDir, 'index.html');
  let srv;
  const port = () => srv.address().port;
  const hostOk = h => { const p = port(); return h === `localhost:${p}` || h === `127.0.0.1:${p}`; };
  const originOk = o => { const p = port(); return o === `http://localhost:${p}` || o === `http://127.0.0.1:${p}`; };

  function fresh() { // rebuild when stale so agent changes show up without anyone pressing Rebuild
    let age = Infinity; try { age = Date.now() - statSync(page).mtimeMs; } catch { /* no page yet */ }
    if (age >= 15000) build(cfg);
  }

  function servePage(req, res) {
    fresh();
    let html;
    try { html = realRead(page); } catch { return send(res, 500, 'page not built'); }
    html = html.replace(TOKEN_PLACEHOLDER, token(cfg));
    send(res, 200, req.method === 'HEAD' ? '' : html, 'text/html; charset=utf-8');
  }

  function serveFile(req, res, url) {
    const abs = path.resolve(url.searchParams.get('p') || '');
    if (!path.isAbsolute(url.searchParams.get('p') || '')) return send(res, 400, 'p must be an absolute path');
    if (!isInside(cfg.roots, abs)) return send(res, 403, 'outside the configured roots');
    const rel = relTo(cfg, abs);
    if (rel !== '.' && SECRET.test(rel)) return send(res, 403, 'refused: hidden or secret-looking file');
    let st; try { st = statSync(abs); } catch { return send(res, 404, 'not found'); }
    if (!st.isFile()) return send(res, 400, 'not a file');
    const ext = path.extname(abs).slice(1).toLowerCase();
    const type = TYPES[ext] || 'application/octet-stream';
    // served HTML/SVG must not be able to read the hub page (and its token): run it in an opaque origin
    const extra = /^(html?|svg)$/.test(ext) ? { 'Content-Security-Policy': 'sandbox allow-scripts allow-popups' } : {};
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (m && st.size && (m[1] || m[2])) { // video/audio seeking
      const start = m[1] ? +m[1] : Math.max(0, st.size - +m[2]), end = m[1] && m[2] ? Math.min(+m[2], st.size - 1) : st.size - 1;
      if (start > end || start >= st.size) return send(res, 416, '', 'text/plain', { 'Content-Range': `bytes */${st.size}` });
      res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, ...SEC_HEADERS, ...extra });
      return createReadStream(abs, { start, end }).pipe(res);
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache', ...SEC_HEADERS, ...extra });
    if (req.method === 'HEAD') return res.end();
    createReadStream(abs).pipe(res);
  }

  function api(req, res, op) {
    if (req.method !== 'POST') return json(res, 405, { error: 'POST only' });
    if (!originOk(req.headers.origin || '')) return json(res, 403, { error: 'bad origin' });
    if (!/^application\/json/i.test(req.headers['content-type'] || '')) return json(res, 415, { error: 'JSON only' });
    if (!sameToken(req.headers['x-hub-token'], token(cfg))) return json(res, 403, { error: 'bad or missing token: reload the page' });
    let body = '', big = false;
    req.on('data', c => { body += c; if (body.length > 1e5) { big = true; req.destroy(); } });
    req.on('end', async () => {
      if (big) return;
      let p; try { p = JSON.parse(body || '{}'); } catch { return json(res, 400, { error: 'bad JSON' }); }
      if (!p || typeof p !== 'object' || Array.isArray(p)) return json(res, 400, { error: 'JSON object expected' });
      try {
        if (op === 'rebuild') { build(cfg); return json(res, 200, { ok: true }); }
        if (op === 'open') {
          const abs = path.resolve(String(p.path || ''));
          // inside the roots, or exactly a catalogued skill folder / SKILL.md / listed file (skills can live in the home folder or the plugin)
          if (!existsSync(abs) || !(isInside(cfg.roots, abs) || skillPaths(cfg).has(abs))) return json(res, 403, { error: 'path must exist inside the configured roots (or be a skill in the catalog)' });
          if (p.how === 'editor') { if (!cfg.editor || cfg.editor === 'none') return json(res, 400, { error: 'no editor configured' }); await platform.openInEditor(abs, cfg.editor); }
          else if (p.how === 'reveal') await platform.reveal(abs);
          else return json(res, 400, { error: 'how must be "editor" or "reveal"' });
          return json(res, 200, { ok: true });
        }
        if (!ACT_OPS.includes(op)) return json(res, 404, { error: 'unknown action ' + op });
        const r = act(cfg, op, p);
        return json(res, 200, { ok: true, out: r.out });
      } catch (e) {
        if (e instanceof HubError) return json(res, 400, { error: e.message });
        return json(res, 500, { error: e.message });
      }
    });
  }

  srv = http.createServer((req, res) => {
    res.setHeader('X-Loopboard', instanceId(cfg));
    try {
      if (!hostOk(req.headers.host || '')) return send(res, 421, 'wrong host');
      const url = new URL(req.url, 'http://localhost'), p = url.pathname;
      if (p.startsWith('/api/')) return api(req, res, p.slice(5));
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'GET only');
      if (req.headers['sec-fetch-site'] === 'cross-site') return send(res, 403, 'cross-site load refused');
      if (p === '/' || p === '/hub') return send(res, 302, '', 'text/plain', { Location: '/hub/' });
      if (p === '/hub/' || p === '/hub/index.html') return servePage(req, res);
      if (p === '/file') return serveFile(req, res, url);
      send(res, 404, 'not found');
    } catch (e) { send(res, 500, 'server error: ' + e.message); }
  });
  return srv;
}

// → { server, port, url, close() }
export function startServer(cfg, opts = {}) {
  const srv = createHubServer(cfg, opts);
  const want = opts.port ?? cfg.port;
  return new Promise((resolve, reject) => {
    srv.once('error', reject);
    srv.listen(want, '127.0.0.1', () => {
      const port = srv.address().port;
      resolve({ server: srv, port, url: `http://localhost:${port}/hub/`, close: () => new Promise(r => { srv.closeAllConnections?.(); srv.close(() => r()); }) });
    });
  });
}
