import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { discover, frontmatter, cells } from '../engine/lib.mjs';
import { build } from '../engine/build.mjs';
import { workspace, status, cleanup } from './_helpers.mjs';

test('auto: one STATUS.md at the root is single mode', () => {
  const w = workspace({ 'STATUS.md': status() });
  const d = discover(w.cfg());
  assert.equal(d.mode, 'single');
  assert.equal(d.streams.length, 1);
  assert.equal(d.streams[0].id, 'test-project');
  cleanup(w.dir, w.data);
});

test('auto: a root STATUS.md plus a nested hub file is multi mode', () => {
  const w = workspace({ 'STATUS.md': status(), 'sub/STATUS.md': status({ title: 'Sub Project' }) });
  const d = discover(w.cfg());
  assert.equal(d.mode, 'multi');
  assert.deepEqual(d.streams.map(s => s.id).sort(), ['sub-project', 'test-project']);
  cleanup(w.dir, w.data);
});

test('auto: a nested STATUS.md without hub frontmatter does not count', () => {
  const w = workspace({ 'STATUS.md': status(), 'docs/STATUS.md': '# Old notes\nnot a hub file\n' });
  assert.equal(discover(w.cfg()).mode, 'single');
  cleanup(w.dir, w.data);
});

test('auto: no root STATUS.md means multi', () => {
  const w = workspace({ 'a/STATUS.md': status({ title: 'A' }) });
  const d = discover(w.cfg());
  assert.equal(d.mode, 'multi');
  assert.equal(d.streams.length, 1);
  cleanup(w.dir, w.data);
});

test('explicit single reads only the root file; explicit multi scans', () => {
  const files = { 'STATUS.md': status(), 'sub/STATUS.md': status({ title: 'Sub' }) };
  const s = workspace(files, { roots: ['.'], mode: 'single' });
  assert.deepEqual(discover(s.cfg()).streams.map(x => x.id), ['test-project']);
  const m = workspace(files, { roots: ['.'], mode: 'multi' });
  assert.equal(discover(m.cfg()).streams.length, 2);
  cleanup(s.dir, s.data, m.dir, m.data);
});

test('skip list and dot folders are not scanned; duplicate titles get unique ids', () => {
  const w = workspace({
    'node_modules/x/STATUS.md': status({ title: 'Dep' }), '.hidden/STATUS.md': status({ title: 'Hidden' }),
    'one/STATUS.md': status({ title: 'Same' }), 'two/STATUS.md': status({ title: 'Same' }),
  });
  const ids = discover(w.cfg()).streams.map(s => s.id);
  assert.deepEqual(ids, ['same', 'same-2']);
  cleanup(w.dir, w.data);
});

test('several roots are all scanned, and the sidebar order follows config areas, unknown areas last', () => {
  const w = workspace({
    'a/STATUS.md': status({ title: 'Zed', area: 'Lab' }), 'b/STATUS.md': status({ title: 'Alpha', area: 'Mystery' }), 'b/two/STATUS.md': status({ title: 'Mid', area: 'Work' }),
  }, { roots: ['a', 'b'], areas: ['Work', 'Content', 'Lab'] });
  const res = build(w.cfg(), { write: false });
  assert.deepEqual(res.streams.map(s => s.title), ['Mid', 'Zed', 'Alpha']);
  cleanup(w.dir, w.data);
});

test('frontmatter strips comments and quotes; table cells honour escaped pipes', () => {
  const p = frontmatter('---\ntitle: "Quoted"   # a comment\nkind: app\n---\nbody');
  assert.equal(p.fm.title, 'Quoted');
  assert.equal(p.body, 'body');
  assert.deepEqual(cells('| a | b \\| c | d |'), ['a', 'b | c', 'd']);
  assert.equal(frontmatter('no frontmatter'), null);
  assert.equal(path.basename('x'), 'x');
});
