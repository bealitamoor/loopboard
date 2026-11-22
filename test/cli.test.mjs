import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { hub, tmp, copyDir, writeFiles, status, cleanup, DEMO } from './_helpers.mjs';

const envFor = data => { const e = { ...process.env, LOOPBOARD_HOME: data }; delete e.LOOPBOARD_CONFIG; delete e.CLAUDE_PLUGIN_DATA; return e; };

test('help, unknown command', () => {
  assert.equal(hub(['--help']).code, 0);
  assert.match(hub(['--help']).out, /thread open/);
  const r = hub(['frobnicate']);
  assert.equal(r.code, 1);
  assert.match(r.err, /unknown command/);
});

test('init --multi writes a config, never overwrites it', () => {
  const dir = tmp(), data = tmp(), env = envFor(data);
  const r = hub(['init', '--multi', '--areas', 'One,Two'], { cwd: dir, env });
  assert.equal(r.code, 0, r.err);
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'loopboard.config.json'), 'utf8'));
  assert.equal(cfg.mode, 'multi');
  assert.deepEqual(cfg.areas, ['One', 'Two']);
  assert.ok(!fs.existsSync(path.join(dir, 'STATUS.md')), '--multi writes no STATUS.md');
  const again = hub(['init', '--single'], { cwd: dir, env });
  assert.equal(again.code, 1);
  assert.match(again.err, /already exists/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'loopboard.config.json'), 'utf8')).mode, 'multi');
  cleanup(dir, data);
});

test('init --single makes a starter STATUS.md (app for a code folder, plan otherwise) and builds', () => {
  const data = tmp(), env = envFor(data);
  const code = tmp(); writeFiles(code, { 'package.json': '{}' });
  assert.equal(hub(['init', '--single'], { cwd: code, env }).code, 0);
  assert.match(fs.readFileSync(path.join(code, 'STATUS.md'), 'utf8'), /^kind: app$/m);
  const b = hub(['build', '--check'], { cwd: code, env });
  assert.equal(b.code, 0, b.out + b.err);
  assert.match(b.out, /1 workstream\(s\) \(single\)/);
  const plain = tmp();
  assert.equal(hub(['init', '--single'], { cwd: plain, env }).code, 0);
  assert.match(fs.readFileSync(path.join(plain, 'STATUS.md'), 'utf8'), /^kind: plan$/m);
  cleanup(code, plain, data);
});

test('single mode with only a STATUS.md and no config file', () => {
  const dir = tmp(), data = tmp(), env = envFor(data);
  writeFiles(dir, { 'STATUS.md': status() });
  const b = hub(['build', '--check'], { cwd: dir, env });
  assert.equal(b.code, 0, b.out + b.err);
  assert.match(b.out, /\(single\)/);
  assert.ok(fs.existsSync(path.join(data, 'index.html')));
  assert.ok(!fs.existsSync(path.join(dir, 'index.html')));
  const list = hub(['list'], { cwd: dir, env });
  assert.match(list.out, /test-project/);
  assert.equal(hub(['init', '--single'], { cwd: dir, env }).code, 0);
  assert.equal(fs.readFileSync(path.join(dir, 'STATUS.md'), 'utf8'), status(), 'the existing STATUS.md is left alone');
  cleanup(dir, data);
});

test('new creates a STATUS.md from the kind template; refuses to overwrite; rejects unknown kinds', () => {
  const dir = tmp(), data = tmp(), env = envFor(data);
  hub(['init', '--multi'], { cwd: dir, env });
  const r = hub(['new', 'posts', '--title', 'Spring Posts', '--kind', 'social', '--area', 'Content'], { cwd: dir, env });
  assert.equal(r.code, 0, r.err);
  const text = fs.readFileSync(path.join(dir, 'posts', 'STATUS.md'), 'utf8');
  assert.match(text, /^title: Spring Posts$/m);
  assert.match(text, /^kind: social$/m);
  assert.match(text, /^area: Content$/m);
  assert.ok(!text.includes('{{'));
  assert.equal(hub(['new', 'posts', '--title', 'X', '--kind', 'social'], { cwd: dir, env }).code, 1);
  const bad = hub(['new', 'other', '--kind', 'nonsense'], { cwd: dir, env });
  assert.equal(bad.code, 1);
  assert.match(bad.err, /unknown kind/);
  assert.equal(hub(['build', '--check'], { cwd: dir, env }).code, 0);
  cleanup(dir, data);
});

test('doctor reports problems with fixes and exits non-zero on failure only', () => {
  const dir = tmp(), data = tmp(), env = envFor(data);
  writeFiles(dir, { 'loopboard.config.json': JSON.stringify({ roots: ['.'], port: 0, editor: 'definitely-not-an-editor' }), 'STATUS.md': status({ health: 'purple' }) });
  const r = hub(['doctor'], { cwd: dir, env });
  assert.equal(r.code, 0, r.out + r.err);
  assert.match(r.out, /Node \d+/);
  assert.match(r.out, /warn .*health `?purple/);
  assert.match(r.out, /warn .*definitely-not-an-editor/);
  assert.match(r.out, /fix:/);
  fs.writeFileSync(path.join(dir, 'loopboard.config.json'), '{ broken');
  const bad = hub(['doctor'], { cwd: dir, env });
  assert.equal(bad.code, 1);
  assert.match(bad.out, /FAIL .*not valid JSON/);
  cleanup(dir, data);
});

test('build --check fails on format errors', () => {
  const dir = tmp(), data = tmp(), env = envFor(data);
  writeFiles(dir, { 'STATUS.md': status({ health: 'purple' }) });
  assert.equal(hub(['build'], { cwd: dir, env }).code, 0);
  const c = hub(['build', '--check'], { cwd: dir, env });
  assert.equal(c.code, 1);
  assert.match(c.out, /unknown health/);
  cleanup(dir, data);
});

test('demo workspace: build, list and the full thread workflow through the CLI', () => {
  const root = tmp(), data = tmp(), env = envFor(data);
  const dir = copyDir(DEMO, path.join(root, 'demo'));
  const b = hub(['build', '--check'], { cwd: dir, env });
  assert.equal(b.code, 0, b.out + b.err);
  assert.match(b.out, /3 workstream\(s\) \(multi\)/);
  const l = hub(['list'], { cwd: dir, env });
  assert.equal(l.code, 0);
  for (const id of ['pocket-notes', 'launch-week-social', 'brand-refresh']) assert.match(l.out, new RegExp(id));
  assert.match(hub(['thread', 'open'], { cwd: dir, env }).out, /open\. Next: loopboard thread show/);
  const add = hub(['thread', 'add', 'pocket-notes', 'PN-5', 'todo', 'Add accent folding'], { cwd: dir, env });
  assert.equal(add.code, 0, add.err);
  const cid = add.out.trim();
  assert.equal(hub(['thread', 'resolve', 'pocket-notes', cid, 'done'], { cwd: dir, env }).code, 0);
  assert.equal(hub(['thread', 'set', 'pocket-notes', 'PN-5', 'status', 'waiting'], { cwd: dir, env }).code, 0);
  assert.equal(hub(['thread', 'set', 'pocket-notes', 'PN-5', 'next', 'Review the index'], { cwd: dir, env }).code, 0);
  assert.equal(hub(['thread', 'addrow', 'pocket-notes', 'PN-9', 'Import from text files'], { cwd: dir, env }).code, 0);
  assert.equal(hub(['thread', 'order', 'pocket-notes', 'PN-9', 'PN-5'], { cwd: dir, env }).code, 0);
  assert.equal(hub(['thread', 'rmrow', 'pocket-notes', 'PN-6'], { cwd: dir, env }).code, 0);
  const show = hub(['thread', 'show', 'pocket-notes', 'PN-5'], { cwd: dir, env });
  assert.match(show.out, /waiting/);
  assert.match(show.out, /Add accent folding/);
  assert.match(show.out, /\[done\]/);
  assert.equal(hub(['thread', 'add', 'pocket-notes', 'PN-5', 'note', 'x', '--by', 'you'], { cwd: dir, env }).code, 1);
  assert.equal(hub(['build', '--check'], { cwd: dir, env }).code, 0, 'the board is still valid after every edit');
  const board = fs.readFileSync(path.join(dir, 'pocket-notes', 'STATUS.md'), 'utf8');
  assert.ok(board.indexOf('| PN-9 |') < board.indexOf('| PN-5 |'));
  assert.ok(!board.includes('| PN-6 |'));
  assert.ok(fs.readFileSync(path.join(DEMO, 'pocket-notes', 'STATUS.md'), 'utf8').includes('| PN-6 |'), 'the repo copy of the demo is untouched');
  cleanup(root, data);
});

test('service commands without registering anything: status works, unknown action fails', () => {
  const dir = tmp(), data = tmp(), env = envFor(data);
  writeFiles(dir, { 'STATUS.md': status() });
  assert.equal(hub(['service', 'bogus'], { cwd: dir, env }).code, 1);
  cleanup(dir, data);
});
