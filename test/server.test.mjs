import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { startServer, instanceId } from '../engine/server.mjs';
import { token, readThread } from '../engine/lib.mjs';
import { workspace, status, cleanup } from './_helpers.mjs';

const BOARD = '| T1 | Thing | build | doing | — | — | |\n| T2 | Other | plan | todo | — | — | |';
let w, cfg, srv, tok, calls;

before(async () => {
  w = workspace({
    'STATUS.md': status({}, BOARD) + '\n## Items\n### T1\n- doc: Plan | plan.md\n',
    'plan.md': '# Plan\n', 'pic.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>', '.secret.txt': 'x', 'server.key': 'x',
  });
  fs.writeFileSync(path.join(w.data, 'outside.txt'), 'outside the roots');
  cfg = w.cfg();
  tok = token(cfg);
  calls = [];
  srv = await startServer(cfg, { port: 0, platform: { openInEditor: async (...a) => calls.push(['editor', ...a]), reveal: async (...a) => calls.push(['reveal', ...a]) } });
});
after(async () => { await srv.close(); cleanup(w.dir, w.data); });

// raw request so Host / Origin can be forged
const req = (method, p, { headers = {}, body } = {}) => new Promise((resolve, reject) => {
  const h = { Host: `localhost:${srv.port}`, ...headers };
  for (const k of Object.keys(h)) if (h[k] === undefined) delete h[k];
  const r = http.request({ host: '127.0.0.1', port: srv.port, method, path: p, headers: h }, res => {
    let data = ''; res.on('data', c => (data += c)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
  });
  r.on('error', reject);
  if (body !== undefined) r.write(body);
  r.end();
});
const post = (op, payload, over = {}) => req('POST', '/api/' + op, {
  headers: { Origin: `http://localhost:${srv.port}`, 'Content-Type': 'application/json', 'X-Hub-Token': tok, ...over }, body: JSON.stringify(payload),
});

test('GET /hub/ serves the page and injects the token; the file on disk has none', async () => {
  const r = await req('GET', '/hub/');
  assert.equal(r.status, 200);
  assert.match(r.headers['content-type'], /text\/html/);
  assert.ok(r.body.includes(tok), 'token injected into the served page');
  assert.ok(!r.body.includes('__HUB_TOKEN__'));
  assert.ok(!fs.readFileSync(path.join(w.data, 'index.html'), 'utf8').includes(tok));
  assert.equal(r.headers['x-content-type-options'], 'nosniff');
});

test('/ redirects to /hub/; unknown paths are 404; non-GET is 405', async () => {
  assert.equal((await req('GET', '/')).headers.location, '/hub/');
  assert.equal((await req('GET', '/nope')).status, 404);
  assert.equal((await req('PUT', '/hub/')).status, 405);
});

test('wrong Host header is refused (DNS rebinding)', async () => {
  assert.equal((await req('GET', '/hub/', { headers: { Host: 'evil.example' } })).status, 421);
  assert.equal((await req('GET', '/hub/', { headers: { Host: 'localhost:1' } })).status, 421);
  assert.equal((await post('comment', {}, { Host: 'evil.example' })).status, 421);
});

test('cross-site page loads are refused', async () => {
  assert.equal((await req('GET', '/hub/', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  assert.equal((await req('GET', '/hub/', { headers: { 'Sec-Fetch-Site': 'same-origin' } })).status, 200);
});

test('API: GET is 405; missing token 403; wrong token 403; bad origin 403; non-JSON 415', async () => {
  assert.equal((await req('GET', '/api/comment')).status, 405);
  const base = { s: 'test-project', i: 'T1', k: 'todo', x: 'hello' };
  const noTok = await req('POST', '/api/comment', { headers: { Origin: `http://localhost:${srv.port}`, 'Content-Type': 'application/json' }, body: JSON.stringify(base) });
  assert.equal(noTok.status, 403);
  assert.equal((await post('comment', base, { 'X-Hub-Token': 'wrong' })).status, 403);
  assert.equal((await post('comment', base, { Origin: 'http://evil.example' })).status, 403);
  assert.equal((await post('comment', base, { Origin: undefined })).status, 403);
  assert.equal((await post('comment', base, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await post('comment', base, { 'Content-Type': 'application/x-www-form-urlencoded' })).status, 415);
  assert.equal(Object.keys(readThread(w.dir)).length, 0, 'nothing was written by any refused request');
});

test('API: bad JSON is 400, unknown action 404', async () => {
  const bad = await req('POST', '/api/comment', { headers: { Origin: `http://localhost:${srv.port}`, 'Content-Type': 'application/json', 'X-Hub-Token': tok }, body: '{nope' });
  assert.equal(bad.status, 400);
  assert.equal((await post('explode', {})).status, 404);
});

test('API: with Host, Origin, token and JSON a comment is written as "you" and the page rebuilt', async () => {
  const r = await post('comment', { s: 'test-project', i: 'T1', k: 'todo', x: 'from the page' });
  assert.equal(r.status, 200, r.body);
  assert.equal(JSON.parse(r.body).ok, true);
  const t = readThread(w.dir).T1;
  assert.equal(t[0].by, 'you');
  assert.equal(t[0].text, 'from the page');
  const cid = t[0].cid;
  assert.equal((await post('resolve', { s: 'test-project', c: cid, x: 'ok' })).status, 200);
  assert.equal(readThread(w.dir).T1[0].state, 'done');
  assert.equal((await post('reopen', { s: 'test-project', c: cid })).status, 200);
  assert.equal((await post('set', { s: 'test-project', i: 'T1', f: 'status', v: 'waiting' })).status, 200);
  assert.equal((await post('addrow', { s: 'test-project', i: 'T3', x: 'Third' })).status, 200);
  assert.equal((await post('order', { s: 'test-project', ids: 'T3,T2' })).status, 200);
  assert.equal((await post('rebuild', {})).status, 200);
  const text = fs.readFileSync(path.join(w.dir, 'STATUS.md'), 'utf8');
  assert.match(text, /\| T1 \| Thing \| build \| waiting \|/);
  assert.ok(text.indexOf('| T3 |') < text.indexOf('| T2 |'));
});

test('API: domain errors are 400 with a message', async () => {
  const r = await post('set', { s: 'test-project', i: 'T1', f: 'status', v: 'finished' });
  assert.equal(r.status, 400);
  assert.match(JSON.parse(r.body).error, /status must be/);
  assert.equal((await post('comment', { s: 'nope', i: 'T1', k: 'todo', x: 'x' })).status, 400);
});

test('API: open only works for existing paths inside the roots', async () => {
  const inside = path.join(w.dir, 'plan.md');
  assert.equal((await post('open', { how: 'editor', path: inside })).status, 200);
  assert.equal((await post('open', { how: 'reveal', path: inside })).status, 200);
  assert.deepEqual(calls.map(c => c[0]), ['editor', 'reveal']);
  assert.equal(calls[0][2], 'code');
  assert.equal((await post('open', { how: 'reveal', path: path.join(w.data, 'outside.txt') })).status, 403);
  assert.equal((await post('open', { how: 'reveal', path: path.join(w.dir, 'missing.md') })).status, 403);
  assert.equal((await post('open', { how: 'explode', path: inside })).status, 400);
  assert.equal(calls.length, 2);
});

test('files: served from the roots only; dotfiles, secrets and outside paths refused', async () => {
  const f = p => req('GET', '/file?p=' + encodeURIComponent(p));
  const ok = await f(path.join(w.dir, 'plan.md'));
  assert.equal(ok.status, 200);
  assert.equal(ok.body, '# Plan\n');
  assert.equal((await f(path.join(w.dir, '.secret.txt'))).status, 403);
  assert.equal((await f(path.join(w.dir, 'server.key'))).status, 403);
  assert.equal((await f(path.join(w.data, 'outside.txt'))).status, 403);
  assert.equal((await f(path.join(w.data, 'hub.token'))).status, 403);
  assert.equal((await f(path.join(w.dir, '..', path.basename(w.data), 'hub.token'))).status, 403);
  assert.equal((await f(path.join(w.dir, 'nope.md'))).status, 404);
  assert.equal((await f(w.dir)).status, 400);
  assert.equal((await req('GET', '/file?p=relative.md')).status, 400);
  assert.equal((await req('GET', '/file?p=' + encodeURIComponent(path.join(w.dir, 'plan.md')), { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
});

test('files: HTML and SVG are sandboxed; ranges work', async () => {
  const svg = await req('GET', '/file?p=' + encodeURIComponent(path.join(w.dir, 'pic.svg')));
  assert.equal(svg.status, 200);
  assert.match(svg.headers['content-security-policy'], /sandbox/);
  const part = await req('GET', '/file?p=' + encodeURIComponent(path.join(w.dir, 'plan.md')), { headers: { Range: 'bytes=0-3' } });
  assert.equal(part.status, 206);
  assert.equal(part.body, '# Pl');
});

test('binds to loopback only', () => {
  assert.equal(srv.server.address().address, '127.0.0.1');
});

test('every response names this hub instance, so doctor/open never mistake another server for it', async () => {
  const r = await req('GET', '/hub/');
  assert.equal(r.headers['x-loopboard'], instanceId(cfg));
  assert.match(instanceId(cfg), /^[0-9a-f]{16}$/);
  assert.notEqual(instanceId({ ...cfg, dataDir: cfg.dataDir + '-other' }), instanceId(cfg));
});
