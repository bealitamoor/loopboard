import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { cli, act, parseArgs } from '../engine/thread.mjs';
import { readThread, threadFile, todayStr } from '../engine/lib.mjs';
import { workspace, status, cleanup } from './_helpers.mjs';

const BOARD = '| T1 | Thing | build | doing | — | — | |\n| T2 | Other | plan | todo | — | — | |\n| T3 | Third | plan | todo | — | — | |';
const setup = (over = {}) => workspace({ 'STATUS.md': status(over, BOARD) });
const events = w => fs.readFileSync(threadFile(w.dir), 'utf8').trim().split('\n').map(l => JSON.parse(l));
const stat = w => fs.readFileSync(path.join(w.dir, 'STATUS.md'), 'utf8');

test('add writes an append-only event by "agent" and rebuilds the page', () => {
  const w = setup(), cfg = w.cfg();
  const r = cli(cfg, ['add', 'test-project', 'T1', 'todo', 'Please do the thing']);
  assert.equal(r.code, 0);
  assert.match(r.out, /^c[0-9a-f]{6}$/);
  const [e] = events(w);
  assert.equal(e.by, 'agent');
  assert.equal(e.op, 'add');
  assert.equal(e.kind, 'todo');
  assert.ok(fs.existsSync(path.join(w.data, 'index.html')), 'rebuilt');
  const t = readThread(w.dir);
  assert.equal(t.T1[0].state, 'open');
  cleanup(w.dir, w.data);
});

test('--no-build skips the rebuild', () => {
  const w = setup(), cfg = w.cfg();
  assert.equal(cli(cfg, ['add', 'test-project', 'T1', 'note', 'hello', '--no-build']).code, 0);
  assert.ok(!fs.existsSync(path.join(w.data, 'index.html')));
  cleanup(w.dir, w.data);
});

test('replies, resolve and reopen fold into state', () => {
  const w = setup(), cfg = w.cfg();
  const cid = cli(cfg, ['add', 'test-project', 'T1', 'question', 'Which?', '--no-build']).out;
  const reply = cli(cfg, ['add', 'test-project', 'T1', 'answer', 'This one', '--re', cid, '--no-build']).out;
  assert.notEqual(reply, cid);
  let t = readThread(w.dir).T1;
  assert.equal(t.length, 1);
  assert.equal(t[0].replies.length, 1);
  cli(cfg, ['resolve', 'test-project', cid, 'done it', '--no-build']);
  t = readThread(w.dir).T1;
  assert.equal(t[0].state, 'done');
  assert.equal(t[0].resolved.note, 'done it');
  cli(cfg, ['reopen', 'test-project', cid, '--no-build']);
  assert.equal(readThread(w.dir).T1[0].state, 'open');
  cleanup(w.dir, w.data);
});

test('agents cannot write as "you"', () => {
  const w = setup(), cfg = w.cfg();
  const r = cli(cfg, ['add', 'test-project', 'T1', 'decision', 'ship it', '--by', 'you']);
  assert.equal(r.code, 1);
  assert.match(r.err, /by "agent"/);
  assert.ok(!fs.existsSync(threadFile(w.dir)));
  assert.equal(cli(cfg, ['add', 'test-project', 'T1', 'note', 'fine', '--by', 'agent', '--no-build']).code, 0);
  cleanup(w.dir, w.data);
});

test('bad input is an error, not a crash', () => {
  const w = setup(), cfg = w.cfg();
  assert.match(cli(cfg, ['add', 'nope', 'T1', 'note', 'x']).err, /no workstream "nope"/);
  assert.match(cli(cfg, ['add', 'test-project', 'T1', 'badkind', 'x']).err, /kind must be/);
  assert.match(cli(cfg, ['add', 'test-project', 'T1', 'note', '  ']).err, /empty comment/);
  assert.match(cli(cfg, ['frobnicate']).err, /thread commands/);
  assert.match(cli(cfg, ['set', 'test-project', 'T1', 'status', 'finished']).err, /status must be/);
  assert.match(cli(cfg, ['set', 'test-project', 'T1', 'stage', 'launch']).err, /stage must be/);
  assert.match(cli(cfg, ['set', 'test-project', 'T1', 'id', 'T9']).err, /ID column cannot/);
  assert.match(cli(cfg, ['set', 'test-project', 'T9', 'status', 'done']).err, /no board row/);
  assert.match(cli(cfg, ['set', 'test-project', 'T1', 'colour', 'red']).err, /no "colour" column/);
  cleanup(w.dir, w.data);
});

test('set changes the row, bumps updated:, and logs an edit', () => {
  const w = setup(), cfg = w.cfg();
  assert.equal(cli(cfg, ['set', 'test-project', 'T1', 'status', 'done']).code, 0);
  assert.equal(cli(cfg, ['set', 'test-project', 'T1', 'stage', 'released']).code, 0);
  assert.equal(cli(cfg, ['set', 'test-project', 'T1', 'next', 'Ship | tell people']).code, 0);
  const text = stat(w);
  assert.match(text, /\| T1 \| Thing \| released \| done \| Ship \\\| tell people \|/);
  assert.match(text, new RegExp('updated: ' + todayStr()));
  const edits = events(w).filter(e => e.op === 'edit');
  assert.equal(edits.length, 3);
  assert.deepEqual(edits.map(e => e.by), ['agent', 'agent', 'agent']);
  assert.equal(edits[0].from, 'doing');
  cleanup(w.dir, w.data);
});

test('addrow, rmrow and order', () => {
  const w = setup(), cfg = w.cfg();
  assert.equal(cli(cfg, ['addrow', 'test-project', 'T4', 'A new item']).code, 0);
  assert.match(stat(w), /\| T4 \| A new item \| plan \| todo \|/);
  assert.match(cli(cfg, ['addrow', 'test-project', 'T4', 'dup']).err, /already exists/);
  assert.match(cli(cfg, ['addrow', 'test-project', 'PROJECT', 'x']).err, /reserved/);
  assert.equal(cli(cfg, ['addrow', 'test-project', 'T5', 'Five', 'build', 'doing']).code, 0);
  assert.equal(cli(cfg, ['order', 'test-project', 'T3', 'T2']).code, 0);
  const ids = stat(w).split('\n').filter(l => /^\| T\d/.test(l)).map(l => l.split('|')[1].trim());
  assert.deepEqual(ids, ['T3', 'T2', 'T1', 'T4', 'T5']);
  assert.equal(cli(cfg, ['order', 'test-project', 'T5,T4']).code, 0);
  assert.deepEqual(stat(w).split('\n').filter(l => /^\| T\d/.test(l)).map(l => l.split('|')[1].trim()).slice(0, 2), ['T5', 'T4']);
  assert.equal(cli(cfg, ['rmrow', 'test-project', 'T4']).code, 0);
  assert.ok(!/\| T4 \|/.test(stat(w)));
  assert.ok(events(w).some(e => e.field === 'removed' && e.item === 'T4'));
  cleanup(w.dir, w.data);
});

test('PROJECT is the project-level thread and shows without a board row', () => {
  const w = setup(), cfg = w.cfg();
  cli(cfg, ['add', 'test-project', 'PROJECT', 'todo', 'Think about scope', '--no-build']);
  const show = cli(cfg, ['show', 'test-project', 'PROJECT']);
  assert.match(show.out, /project-level discussion/);
  assert.match(show.out, /Think about scope/);
  const open = cli(cfg, ['open']);
  assert.match(open.out, /PROJECT · c[0-9a-f]{6} · agent · Instruction for agent: Think about scope/);
  assert.match(cli(cfg, ['open', 'test-project']).out, /1 open/);
  assert.match(cli(w.cfg(), ['show', 'test-project', 'T1']).out, /doing/);
  cleanup(w.dir, w.data);
});

test('CRLF STATUS.md files keep their line endings', () => {
  const w = workspace({ 'STATUS.md': status({}, BOARD).replace(/\n/g, '\r\n') });
  assert.equal(cli(w.cfg(), ['set', 'test-project', 'T1', 'status', 'waiting']).code, 0);
  const text = stat(w);
  assert.ok(!/[^\r]\n/.test(text), 'no bare LF');
  assert.match(text, /\| T1 \| Thing \| build \| waiting \|/);
  cleanup(w.dir, w.data);
});

test('custom kinds validate stages for set and addrow', () => {
  const w = workspace({ 'STATUS.md': status({ kind: 'support' }, '| T1 | Ticket | new | doing | — | — | |') }, { roots: ['.'], kinds: { support: ['new', 'triage', 'resolved'] } });
  assert.equal(cli(w.cfg(), ['set', 'test-project', 'T1', 'stage', 'triage']).code, 0);
  assert.match(cli(w.cfg(), ['set', 'test-project', 'T1', 'stage', 'build']).err, /stage must be new \/ triage \/ resolved/);
  cleanup(w.dir, w.data);
});

test('act() is the page write path: it writes as "you" and maps the page keys', () => {
  const w = setup(), cfg = w.cfg();
  const r = act(cfg, 'comment', { s: 'test-project', i: 'T1', k: 'todo', x: 'from the page' });
  assert.match(r.out, /^c[0-9a-f]{6}$/);
  assert.equal(events(w)[0].by, 'you');
  act(cfg, 'set', { s: 'test-project', i: 'T1', f: 'status', v: 'done' });
  act(cfg, 'addrow', { s: 'test-project', i: 'T7', x: 'Seven' });
  act(cfg, 'order', { s: 'test-project', ids: 'T3,T2' });
  assert.ok(events(w).filter(e => e.op === 'edit').every(e => e.by === 'you'));
  assert.throws(() => act(cfg, 'bogus', {}), /unknown action/);
  cleanup(w.dir, w.data);
});

test('argument parsing: flags with values, boolean flags, --x=y', () => {
  assert.deepEqual(parseArgs(['add', 's', '--re', 'c1', 'text', '--no-build']), { pos: ['add', 's', 'text'], flags: { re: 'c1', 'no-build': true } });
  assert.deepEqual(parseArgs(['--title=A B', 'x']).flags, { title: 'A B' });
});
