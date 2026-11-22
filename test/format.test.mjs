import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { build } from '../engine/build.mjs';
import { loadConfig } from '../engine/config.mjs';
import { BUILTIN_KINDS } from '../engine/lib.mjs';
import { renderTemplate } from '../engine/commands.mjs';
import { workspace, status, copyDir, tmp, DEMO, REPO, cleanup } from './_helpers.mjs';

const issues = (files, config) => { const w = workspace(files, config); const r = build(w.cfg(), { write: false }); cleanup(w.dir, w.data); return r.issues.map(i => i.msg); };

test('a well-formed STATUS.md has no issues', () => {
  assert.deepEqual(issues({ 'STATUS.md': status() }), []);
});

test('format errors are reported', () => {
  const bad = issues({ 'STATUS.md': status({ health: 'purple', kind: 'app', summary: null }, '| T1 | Thing | nonsense | later | — | — | |') });
  assert.ok(bad.some(m => /missing frontmatter `summary`/.test(m)));
  assert.ok(bad.some(m => /unknown health `purple`/.test(m)));
  assert.ok(bad.some(m => /stage `nonsense` is not a app stage/.test(m)));
  assert.ok(bad.some(m => /unknown status `later`/.test(m)));
});

test('unknown kind, missing sections, bad now, duplicate ids', () => {
  const bad = issues({ 'STATUS.md': '---\ntitle: X\nkind: mystery\nhealth: green\nphase: p\nupdated: 2026-01-01\nsummary: s\nnow: ZZ\n---\n\n## Board\n| ID | Item | Stage | Status |\n|---|---|---|---|\n| A | a | x | todo |\n| A | b | x | todo |\n' });
  assert.ok(bad.some(m => /unknown kind `mystery`/.test(m)));
  assert.ok(bad.some(m => /missing section `## Now`/.test(m)));
  assert.ok(bad.some(m => /`now: ZZ` is not a board ID/.test(m)));
  assert.ok(bad.some(m => /duplicate board ID `A`/.test(m)));
});

test('area is optional and unknown areas are fine', () => {
  assert.deepEqual(issues({ 'STATUS.md': status({ area: null }) }), []);
  assert.deepEqual(issues({ 'STATUS.md': status({ area: 'Whatever' }) }), []);
});

test('extra kinds from config are valid stage sets', () => {
  const row = '| T1 | Ticket | triage | doing | — | — | |';
  assert.ok(issues({ 'STATUS.md': status({ kind: 'support' }, row) }).some(m => /unknown kind/.test(m)));
  assert.deepEqual(issues({ 'STATUS.md': status({ kind: 'support' }, row) }, { roots: ['.'], kinds: { support: ['new', 'triage', 'resolved'] } }), []);
});

test('every built-in kind has a template that builds with no issues', () => {
  for (const kind of Object.keys(BUILTIN_KINDS)) {
    assert.ok(fs.existsSync(path.join(REPO, 'templates', `STATUS-${kind}.md`)), `template for ${kind}`);
    const w = workspace({}, { roots: ['.'] });
    fs.writeFileSync(path.join(w.dir, 'STATUS.md'), renderTemplate(w.cfg(), kind, { title: 'Template Check', area: 'Work' }));
    const r = build(w.cfg(), { write: false });
    assert.deepEqual(r.issues, [], kind);
    assert.equal(r.streams.length, 1, kind);
    cleanup(w.dir, w.data);
  }
});

test('a custom kind without a template gets a generic one that builds', () => {
  const w = workspace({}, { roots: ['.'], kinds: { support: ['new', 'triage', 'resolved'] } });
  fs.writeFileSync(path.join(w.dir, 'STATUS.md'), renderTemplate(w.cfg(), 'support', { title: 'Desk', area: 'Work' }));
  assert.deepEqual(build(w.cfg(), { write: false }).issues, []);
  cleanup(w.dir, w.data);
});

test('the template config example is valid', () => {
  const dir = tmp(), data = tmp();
  fs.copyFileSync(path.join(REPO, 'templates', 'loopboard.config.example.json'), path.join(dir, 'loopboard.config.json'));
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(path.join(dir, 'loopboard.config.json'), 'utf8')));
  cleanup(dir, data);
});

test('Items keys render: folder, play, kit, doc, url, cmd, copy, notes', () => {
  const w = workspace({
    'STATUS.md': status({}, '| T1 | Thing | build | doing | — | — | |') + '\n## Items\n### T1 - Thing\n- folder: work\n- play: work/clip.mp4\n- kit: kit.md\n- doc: Plan | plan.md\n- url: Live | https://example.org/x\n- cmd: Test | npm test\n- copy: Tags | #a #b\nPlain notes with a [link](plan.md).\n',
    'work/clip.mp4': 'x', 'work/pic.png': 'x', 'kit.md': '# Kit\n\n## Title\nHello\n\n## Body\nWorld\n', 'plan.md': '# Plan\n',
  });
  const r = build(w.cfg(), { write: false });
  assert.deepEqual(r.issues, []);
  const it = r.streams[0].items.T1;
  assert.equal(it.folder.files.length, 2);
  assert.equal(path.basename(it.play.abs), 'clip.mp4');
  assert.deepEqual(it.kit.fields.map(f => f.label), ['Title', 'Body']);
  assert.equal(it.docs[0].label, 'Plan');
  assert.equal(it.urls[0].url, 'https://example.org/x');
  assert.equal(it.cmds[0].cmd, 'npm test');
  assert.ok(it.cmds[0].full.startsWith('cd "'));
  assert.equal(it.copies[0].text, '#a #b');
  assert.equal(it.preview.type, 'video');
  assert.match(it.notes, /\(hubfile:/);
  cleanup(w.dir, w.data);
});

test('missing files referenced by Items are warnings', () => {
  const m = issues({ 'STATUS.md': status({}, '| T1 | Thing | build | doing | — | — | |') + '\n## Items\n### T1\n- doc: Plan | nope.md\n- folder: nowhere\n### T9\n- url: X | https://example.org\n' });
  assert.ok(m.some(x => /doc not found/.test(x)));
  assert.ok(m.some(x => /folder not found/.test(x)));
  assert.ok(m.some(x => /item `T9` has no matching board row/.test(x)));
});

test('the page is self-contained and carries no write token on disk', () => {
  const w = workspace({ 'STATUS.md': status() });
  const r = build(w.cfg());
  const html = fs.readFileSync(r.out, 'utf8');
  assert.ok(r.out.startsWith(w.data), 'page is written to the data dir');
  assert.ok(!/<script[^>]+src=|<link[^>]+href=/.test(html), 'no external scripts or styles');
  assert.ok(html.includes('__HUB_TOKEN__'));
  assert.ok(!fs.existsSync(path.join(w.dir, 'index.html')), 'nothing generated in the workspace');
  cleanup(w.dir, w.data);
});

test('the demo workspace builds with zero issues and has the three workstreams', () => {
  const dir = copyDir(DEMO, path.join(tmp(), 'demo')), data = tmp();
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'loopboard.config.json'), 'utf8')).mode, 'multi');
  const r = build(loadConfig({ cwd: dir, env: { LOOPBOARD_HOME: data } }));
  assert.deepEqual(r.issues, []);
  assert.deepEqual(r.streams.map(s => s.kind).sort(), ['app', 'design', 'social']);
  assert.equal(r.mode, 'multi');
  assert.ok(r.streams.every(s => Object.keys(s.thread).length > 0), 'each demo stream has a thread');
  cleanup(path.dirname(dir), data);
});
