// Threads + row edits: the ONE way to write comments and change board rows. The CLI (`loopboard thread ...`) writes as
// "agent"; the token-checked server (the hub page) calls act() and writes as "you".
//
// Read:   loopboard thread open [stream]            open instructions / blockers / questions (every workstream or one)
//         loopboard thread show <stream> <ID>       the row, its ## Items block and its whole thread
// Write:  loopboard thread add <stream> <ID> <kind> "<text>" [--re <cid>]   kind: todo|blocker|question|answer|decision|note
//         loopboard thread resolve <stream> <cid> ["<what was done>"]
//         loopboard thread reopen <stream> <cid>
//         loopboard thread set <stream> <ID> <status|stage|item|next|note|date|<other column>> "<value>"
//         loopboard thread order <stream> <ID,ID,...>
//         loopboard thread addrow <stream> <ID> "<item>" [stage] [status]
//         loopboard thread rmrow <stream> <ID>
// Each write rebuilds the page unless --no-build is given.
import { appendFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import {
  HubError, die, stagesOf, STATUSES, COMMENT_KINDS, read, streams, cells, cellText, threadFile, readThread,
  relTo, todayStr, nowIso, openComments,
} from './lib.mjs';
import { build } from './build.mjs';

const stream = (cfg, id) => { const all = streams(cfg); return all.find(s => s.id === id) || die(`no workstream "${id}". Known: ${all.map(s => s.id).join(', ') || '(none)'}`); };
const append = (s, e) => appendFileSync(threadFile(s.dir), JSON.stringify(e) + '\n');
const local = iso => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const eolOf = text => (text.includes('\r\n') ? '\r\n' : '\n');

// ---------- STATUS.md board editing ----------
function board(cfg, s) {
  const text = read(s.file), eol = eolOf(text), lines = text.split(/\r?\n/);
  const start = lines.findIndex(l => /^##\s+Board\s*$/i.test(l));
  if (start < 0) die(`${relTo(cfg, s.file)} has no ## Board`);
  let h = start + 1; while (h < lines.length && !lines[h].trim().startsWith('|')) h++;
  if (h >= lines.length) die(`${relTo(cfg, s.file)}: ## Board has no table`);
  let end = h + 2; while (end < lines.length && lines[end].trim().startsWith('|')) end++;
  const head = cells(lines[h]).map(c => c.toLowerCase().replace(/[`*]/g, ''));
  return { lines, eol, head, first: h + 2, end, rowAt: id => { for (let i = h + 2; i < end; i++) if (cells(lines[i])[head.indexOf('id')]?.replace(/[`*]/g, '') === id) return i; return -1; } };
}
const join = c => '| ' + c.join(' | ') + ' |';
function save(s, b) {
  let text = b.lines.join(b.eol);
  text = text.replace(/^(---\r?\n[\s\S]*?\nupdated:[ \t]*)\S+/, `$1${todayStr()}`);
  writeFileSync(s.file, text);
}
const COL = { status: 'status', stage: 'stage', item: 'item', next: 'next step', note: 'note', date: 'date' };

function setField(cfg, s, id, field, value, by) {
  const col = COL[field] || field.toLowerCase();
  if (col === 'id') die('the ID column cannot be changed: use rmrow + addrow instead');
  if (field === 'status' && !STATUSES.includes(value)) die(`status must be ${STATUSES.join(' / ')}`);
  const stages = stagesOf(cfg)[s.fm.kind] || [];
  if (field === 'stage' && !stages.includes(value)) die(`stage must be ${stages.join(' / ')}`);
  const b = board(cfg, s), i = b.rowAt(id), ci = b.head.indexOf(col);
  if (i < 0) die(`no board row "${id}"`);
  if (ci < 0) die(`board has no "${col}" column (has: ${b.head.join(', ')})`);
  const c = cells(b.lines[i]).map(cellText); const from = cells(b.lines[i])[ci];
  c[ci] = cellText(value); b.lines[i] = join(c); save(s, b);
  append(s, { op: 'edit', at: nowIso(), item: id, field, from, to: value, by });
}
function order(cfg, s, ids, by) {
  const b = board(cfg, s), rows = b.lines.slice(b.first, b.end), idc = b.head.indexOf('id');
  const key = l => cells(l)[idc]?.replace(/[`*]/g, '');
  const picked = ids.map(id => rows.find(r => key(r) === id)).filter(Boolean);
  const rest = rows.filter(r => !picked.includes(r));
  b.lines.splice(b.first, rows.length, ...picked, ...rest); save(s, b);
  append(s, { op: 'edit', at: nowIso(), item: '*', field: 'order', from: '', to: picked.map(key).join(','), by });
}
function rmRow(cfg, s, id, by) {
  const b = board(cfg, s), i = b.rowAt(id);
  if (i < 0) die(`no board row "${id}"`);
  const was = cells(b.lines[i]); b.lines.splice(i, 1); save(s, b);
  append(s, { op: 'edit', at: nowIso(), item: id, field: 'removed', from: was[b.head.indexOf('item')] || '', to: '', by });
}
function addRow(cfg, s, id, item, stage, status, by) {
  const b = board(cfg, s);
  if (b.rowAt(id) >= 0) die(`row "${id}" already exists`);
  if (id === 'PROJECT') die('PROJECT is reserved for the project-level discussion thread');
  if (!/^[^|\s][^|]*$/.test(id)) die('the ID must not be empty or contain "|"');
  const stages = stagesOf(cfg)[s.fm.kind] || [];
  stage ||= stages[0] || ''; status ||= 'todo';
  if (!STATUSES.includes(status)) die(`status must be ${STATUSES.join(' / ')}`);
  if (stages.length && !stages.includes(stage)) die(`stage must be ${stages.join(' / ')}`);
  const vals = { id, item, stage, status, 'next step': '—', date: '—', note: '' };
  b.lines.splice(b.end, 0, join(b.head.map(h => cellText(vals[h] ?? '')))); save(s, b);
  append(s, { op: 'edit', at: nowIso(), item: id, field: 'added', from: '', to: item, by });
}

// ---------- comments ----------
function add(s, id, kind, text, by, re) {
  if (!id) die('add needs an item ID (use PROJECT for the project-level discussion)');
  if (!COMMENT_KINDS[kind]) die(`kind must be one of ${Object.keys(COMMENT_KINDS).join(', ')}`);
  if (!text?.trim()) die('empty comment');
  const cid = 'c' + randomBytes(3).toString('hex');
  append(s, { op: 'add', cid, at: nowIso(), item: id, kind, by, text: text.trim(), ...(re ? { re } : {}) });
  return cid;
}
function printThread(list, indent = '') {
  const out = [];
  for (const c of list) {
    if (c.kind === 'edit') { out.push(`${indent}· ${local(c.at)} ${c.by} changed ${c.field}: ${c.from || '—'} → ${c.to}`); continue; }
    const st = c.state === 'open' ? ' [OPEN]' : c.state === 'done' ? ' [done]' : '';
    out.push(`${indent}- ${c.cid} · ${local(c.at)} · ${c.by} · ${COMMENT_KINDS[c.kind] || c.kind}${st}: ${c.text}`);
    if (c.resolved) out.push(`${indent}    resolved ${local(c.resolved.at)} by ${c.resolved.by}${c.resolved.note ? ': ' + c.resolved.note : ''}`);
    out.push(...printThread(c.replies, indent + '    '));
  }
  return out;
}
function itemBlock(s, id) {
  const m = read(s.file).split(/^##\s+Items\s*$/m)[1];
  if (!m) return '';
  const blocks = m.split(/^(?=###\s)/m), b = blocks.find(x => x.replace(/^###\s+/, '').split(/\s+[·—–-]\s+|\n/)[0].replace(/[`*]/g, '').trim() === id);
  return b ? b.split(/^##\s/m)[0].trim() : '';
}

// ---------- operations ----------
// perform(cfg, cmd, args, by, flags) → { write: boolean, out: string, cid? }. Throws HubError on bad input.
export function perform(cfg, cmd, a, by, flags = {}) {
  switch (cmd) {
    case 'open': {
      const lines = []; let n = 0;
      for (const s of streams(cfg).filter(x => !a[0] || x.id === a[0])) {
        const open = openComments(readThread(s.dir));
        if (!open.length) continue;
        lines.push(`\n${s.fm.title}  (stream ${s.id} · ${relTo(cfg, s.file)})`);
        for (const { id, c } of open) { n++; lines.push(`  ${id} · ${c.cid} · ${c.by} · ${COMMENT_KINDS[c.kind]}: ${c.text}`); }
      }
      lines.push(n ? `\n${n} open. Next: loopboard thread show <stream> <ID>` : 'Nothing open.');
      return { write: false, out: lines.join('\n').replace(/^\n/, '') };
    }
    case 'show': {
      const s = stream(cfg, a[0]), id = a[1] || die('show <stream> <ID>'), b = board(cfg, s), i = b.rowAt(id), lines = [];
      lines.push(`${s.fm.title} › ${id}   (${relTo(cfg, s.file)}, kind ${s.fm.kind}: ${(stagesOf(cfg)[s.fm.kind] || []).join(' → ')})`);
      if (i >= 0) { const c = cells(b.lines[i]); b.head.forEach((h, k) => lines.push(`  ${h.padEnd(10)} ${c[k] ?? ''}`)); }
      else lines.push(id === 'PROJECT' ? '  (project-level discussion: applies to the whole workstream; read its STATUS.md and the project docs)' : '  (no board row)');
      const blk = itemBlock(s, id); if (blk) lines.push('\nItem block (paths relative to the STATUS.md folder):\n' + blk);
      const t = readThread(s.dir)[id] || [];
      lines.push('\nThread:'); lines.push(...(t.length ? printThread(t, '  ') : ['  (empty)']));
      return { write: false, out: lines.join('\n') };
    }
    case 'add': { const s = stream(cfg, a[0]); const cid = add(s, a[1], a[2], a[3], by, flags.re); return { write: true, out: cid, cid }; }
    case 'resolve': { const s = stream(cfg, a[0]); append(s, { op: 'resolve', cid: a[1] || die('resolve <stream> <cid>'), at: nowIso(), by, note: a[2] || '' }); return { write: true, out: '' }; }
    case 'reopen': { const s = stream(cfg, a[0]); append(s, { op: 'reopen', cid: a[1] || die('reopen <stream> <cid>'), at: nowIso(), by }); return { write: true, out: '' }; }
    case 'set': { setField(cfg, stream(cfg, a[0]), a[1], a[2] || die('set <stream> <ID> <field> <value>'), a[3] ?? die('set <stream> <ID> <field> <value>'), by); return { write: true, out: '' }; }
    case 'order': { order(cfg, stream(cfg, a[0]), a.slice(1).join(',').split(/[,\s]+/).map(x => x.trim()).filter(Boolean), by); return { write: true, out: '' }; }
    case 'addrow': { const s = stream(cfg, a[0]); addRow(cfg, s, a[1] || die('addrow <stream> <ID> <item>'), a[2] || die('addrow needs an item title'), a[3], a[4], by); return { write: true, out: '' }; }
    case 'rmrow': { rmRow(cfg, stream(cfg, a[0]), a[1] || die('rmrow <stream> <ID>'), by); return { write: true, out: '' }; }
    default: return die('thread commands: open, show, add, resolve, reopen, set, order, addrow, rmrow');
  }
}

// The hub page's write path (called by server.mjs after it checked token, origin and content type). Writes as "you".
// Body keys: s stream · i item ID · k kind · x text · re reply-to · c comment ID · f field · v value · ids a,b,c · g stage · st status
export function act(cfg, op, p = {}) {
  const q = k => (p[k] == null ? '' : String(p[k]));
  const map = {
    comment: ['add', [q('s'), q('i'), q('k'), q('x')], { re: q('re') || undefined }],
    resolve: ['resolve', [q('s'), q('c'), q('x')]],
    reopen: ['reopen', [q('s'), q('c')]],
    set: ['set', [q('s'), q('i'), q('f'), q('v')]],
    order: ['order', [q('s'), q('ids')]],
    addrow: ['addrow', [q('s'), q('i'), q('x'), q('g') || undefined, q('st') || undefined]],
  };
  const m = map[op] || die(`unknown action ${op}`);
  const res = perform(cfg, m[0], m[1], 'you', m[2] || {});
  build(cfg);
  return res;
}
export const ACT_OPS = ['comment', 'resolve', 'reopen', 'set', 'order', 'addrow'];

// ---------- CLI ----------
const BOOL = new Set(['no-build', 'check', 'single', 'multi', 'help', 'json']);
export function parseArgs(argv) {
  const pos = [], flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--') && a.length > 2) {
      const [k, ...v] = a.slice(2).split('=');
      if (v.length) flags[k] = v.join('=');
      else if (BOOL.has(k)) flags[k] = true;
      else flags[k] = argv[++i] ?? '';
    } else pos.push(a);
  }
  return { pos, flags };
}

// → { code, out } ; never touches process.* so tests can call it
export function cli(cfg, argv) {
  const { pos, flags } = parseArgs(argv);
  try {
    if (flags.by !== undefined && flags.by !== 'agent') die('agent writes are always by "agent". Only the hub page (token-checked) writes as "you"; drop --by');
    const [cmd, ...rest] = pos;
    if (!cmd) die('thread commands: open, show, add, resolve, reopen, set, order, addrow, rmrow');
    const res = perform(cfg, cmd, rest, 'agent', flags);
    if (res.write && !flags['no-build']) build(cfg);
    return { code: 0, out: res.out };
  } catch (e) {
    if (e instanceof HubError) return { code: 1, out: '', err: 'loopboard thread: ' + e.message };
    throw e;
  }
}
