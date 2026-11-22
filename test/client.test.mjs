// Smoke-tests the page script: runs engine/client.js in a stubbed browser for every route, served and as a plain file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { build } from '../engine/build.mjs';
import { loadConfig } from '../engine/config.mjs';
import { tmp, copyDir, cleanup, DEMO, workspace, status } from './_helpers.mjs';

const CLIENT = fs.readFileSync(new URL('../engine/client.js', import.meta.url), 'utf8');

function runPage(dataJson, { protocol, hash }) {
  const els = {};
  const mk = () => ({ innerHTML: '', textContent: '', value: '', hidden: false, dataset: {}, classList: { add() { }, remove() { }, toggle() { }, contains: () => false },
    addEventListener() { }, scrollTo() { }, querySelector: () => null, querySelectorAll: () => [], matches: () => false, closest: () => null, contains: () => false, focus() { }, getAttribute: () => '' });
  const el = sel => (els[sel] ||= mk());
  const store = {};
  const document = {
    getElementById: id => (id === 'data' ? { textContent: dataJson } : el('#' + id)), querySelector: el, querySelectorAll: () => [], addEventListener() { }, title: '', hidden: false, activeElement: null, body: { appendChild() { } },
    createElement: () => mk(), execCommand: () => true,
  };
  const ctx = { document, location: { protocol, hash, reload() { } }, sessionStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; }, removeItem: k => delete store[k] },
    setInterval() { }, setTimeout() { }, clearTimeout() { }, addEventListener() { }, navigator: {}, isSecureContext: false, fetch: async () => ({ ok: true, json: async () => ({}) }), prompt: () => null, console, Date, JSON, Math, Object, Array, String, Number, Set, URL, encodeURIComponent, decodeURIComponent, encodeURI, decodeURI, isNaN, parseInt };
  vm.createContext(ctx);
  vm.runInContext(CLIENT, ctx);
  return { main: els['#main'].innerHTML, nav: els['#nav'].innerHTML, side: els['#side'].innerHTML, top: els['#top'].innerHTML, title: document.title };
}

const dataOf = html => html.match(/<script id="data" type="application\/json">([\s\S]*?)<\/script>/)[1];

test('every route renders, served and as a read-only file', () => {
  const root = tmp(), data = tmp();
  const dir = copyDir(DEMO, path.join(root, 'demo'));
  const res = build(loadConfig({ cwd: dir, env: { LOOPBOARD_HOME: data } }), { write: false });
  const json = dataOf(res.html);
  const routes = ['', '#overview', '#pocket-notes', '#pocket-notes/notes', '#pocket-notes/pages', '#pocket-notes/talk', '#pocket-notes/rules', '#pocket-notes/i/PN-3', '#brand-refresh', '#brand-refresh/i/BR-2', '#launch-week-social/i/LS-4', '#launch-week-social/i/LS-3'];
  for (const protocol of ['http:', 'file:']) for (const hash of routes) {
    const out = runPage(json, { protocol, hash });
    assert.ok(out.main.length > 50, `${protocol} ${hash || '(empty)'} rendered`);
    assert.ok(out.side.includes('Loopboard'));
    if (protocol === 'file:') {
      assert.ok(out.top.includes('Read-only'), 'read-only marker in file mode');
      assert.ok(!out.main.includes('data-open='), 'no local-API buttons in file mode');
      assert.ok(!out.main.includes('id="cform">'), 'comment form hidden in file mode');
    }
    if (protocol === 'http:' && hash === '#pocket-notes/i/PN-3') {
      assert.ok(out.main.includes('data-open="editor"'), 'editor button when served');
      assert.ok(out.main.includes('/file?p='), 'files are served through /file');
      assert.ok(out.main.includes('id="cadd"'));
    }
  }
  assert.ok(runPage(json, { protocol: 'http:', hash: '' }).main.includes('Agent inbox'));
  cleanup(root, data);
});

test('single mode: no overview, the project opens directly', () => {
  const w = workspace({ 'STATUS.md': status() });
  const res = build(w.cfg(), { write: false });
  const out = runPage(dataOf(res.html), { protocol: 'http:', hash: '' });
  assert.ok(!out.side.includes('Overview'));
  assert.ok(out.main.includes('T1'));
  assert.equal(out.title, 'Test Project · Loopboard');
  cleanup(w.dir, w.data);
});

test('page text never mentions a private app or helper scheme', () => {
  assert.ok(!/personalhub|HubReveal|vscode:\/\/|Finder/i.test(CLIENT));
});
