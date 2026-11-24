// Shared by build (reads), thread (writes), server and guard: discovery, frontmatter, table cells, the vocabulary.
// Nothing here knows about any particular workspace; everything comes from the config object.
import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ENGINE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.join(ENGINE, '..');
export const BIN = path.join(REPO, 'bin', 'loopboard.mjs');

export class HubError extends Error {}
export const die = msg => { throw new HubError(msg); };

export const BUILTIN_KINDS = {
  app: ['plan', 'build', 'test', 'review', 'merged', 'released'],
  pipeline: ['idea', 'script', 'assets', 'voice', 'render', 'ready', 'published'],
  campaign: ['plan', 'draft', 'review', 'published', 'indexed', 'promoted'],
  research: ['open', 'researching', 'answered', 'decided'],
  design: ['brief', 'explore', 'wireframe', 'visual', 'review', 'handoff', 'shipped'],
  social: ['idea', 'draft', 'visual', 'scheduled', 'posted', 'measured'],
  plan: ['backlog', 'this-week', 'today', 'done'],
};
export const STATUSES = ['todo', 'doing', 'waiting', 'blocked', 'done'];
export const HEALTH = ['green', 'amber', 'red', 'paused'];
export const REQUIRED = ['title', 'kind', 'health', 'phase', 'updated', 'summary'];
export const SECTIONS = ['Waiting on you', 'Now', 'Next', 'Board', 'Done recently', 'Links'];
export const BOARD_COLS = ['id', 'item', 'stage', 'status', 'next step', 'date', 'note'];
export const ITEM_KEYS = ['folder', 'play', 'kit', 'doc', 'url', 'cmd', 'copy'];
// comment kinds; the first three stay "open" until someone resolves them
export const COMMENT_KINDS = { todo: 'Instruction for agent', blocker: 'Blocker', question: 'Question', answer: 'Answer', decision: 'Decision', note: 'Note' };
export const OPEN_KINDS = ['todo', 'blocker', 'question'];

export const stagesOf = cfg => ({ ...BUILTIN_KINDS, ...(cfg?.kinds || {}) });

export const read = f => { try { return readFileSync(f, 'utf8'); } catch { return null; } };
export const stat = p => { try { return statSync(p); } catch { return null; } };
export const ls = d => { try { return readdirSync(d).filter(n => !n.startsWith('.')); } catch { return []; } };
export const slug = s => String(s).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-');
export const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const nowIso = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');

// path containment; case-insensitive on Windows
const fold = p => (process.platform === 'win32' ? p.toLowerCase() : p);
export const isInside = (roots, p) => !!p && roots.some(r => { const a = fold(p), b = fold(r); return a === b || a.startsWith(b.endsWith(path.sep) ? b : b + path.sep); });
export function relTo(cfg, abs) {
  for (const r of cfg.roots) if (isInside([r], abs)) return path.relative(r, abs) || '.';
  return abs;
}

export function findStatus(cfg, dir, depth = 0, acc = []) {
  const skip = new Set(cfg.skip);
  if (dir === undefined) { for (const r of cfg.roots) findStatus(cfg, r, 0, acc); return [...new Set(acc)].sort(); }
  for (const n of ls(dir)) {
    if (skip.has(n)) continue;
    const p = path.join(dir, n), st = stat(p);
    if (!st) continue;
    if (st.isDirectory() && depth < 4) findStatus(cfg, p, depth + 1, acc);
    else if (st.isFile() && n === 'STATUS.md') acc.push(p);
  }
  return acc;
}

export function frontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return null;
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (kv) fm[kv[1].toLowerCase()] = kv[2].replace(/\s+#\s.*$/, '').trim().replace(/^["']|["']$/g, '');
  }
  return { fm, body: text.slice(m[0].length) };
}

// Every hub workstream: { id, file, dir, fm, body }. A STATUS.md without `title` and `kind` frontmatter is ignored.
// mode: "single" reads only roots[0]/STATUS.md, "multi" scans every root, "auto" picks single when roots[0]/STATUS.md
// is the only hub file. Returns { mode, streams } with the resolved mode.
export function discover(cfg) {
  const rootFile = path.join(cfg.roots[0], 'STATUS.md');
  const files = cfg.mode === 'single' ? (stat(rootFile)?.isFile() ? [rootFile] : []) : findStatus(cfg);
  const out = [], used = new Set(['skills']); // `skills` is the catalog's own page (#skills)
  for (const file of files) {
    const p = frontmatter(read(file) || '');
    if (!p || !p.fm.title || !p.fm.kind) continue;
    let id = slug(p.fm.title) || slug(path.basename(path.dirname(file))) || 'project';
    while (used.has(id)) id += '-2';
    used.add(id);
    out.push({ id, file, dir: path.dirname(file), fm: p.fm, body: p.body });
  }
  let mode = cfg.mode;
  if (mode === 'auto') mode = out.length === 1 && out[0].file === rootFile ? 'single' : 'multi';
  return { mode, streams: out };
}
export const streams = cfg => discover(cfg).streams;

export const cells = line => line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'));
export const cellText = s => String(s ?? '').replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim();

// THREAD.jsonl next to STATUS.md: append-only events, folded into comments per item
export const threadFile = dir => path.join(dir, 'THREAD.jsonl');
export function readThread(dir) {
  const text = read(threadFile(dir)) || '';
  const byId = new Map(), edits = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let e; try { e = JSON.parse(line); } catch { continue; }
    if (e.op === 'add') byId.set(e.cid, { ...e, state: OPEN_KINDS.includes(e.kind) && !e.re ? 'open' : 'info', replies: [], resolved: null });
    else if (e.op === 'resolve' && byId.has(e.cid)) Object.assign(byId.get(e.cid), { state: 'done', resolved: { at: e.at, by: e.by, note: e.note || '' } });
    else if (e.op === 'reopen' && byId.has(e.cid)) Object.assign(byId.get(e.cid), { state: 'open', resolved: null });
    else if (e.op === 'edit') edits.push(e);
  }
  const all = [...byId.values()];
  for (const c of all) if (c.re && byId.has(c.re)) byId.get(c.re).replies.push(c);
  const roots = all.filter(c => !c.re || !byId.has(c.re));
  const perItem = {};
  for (const c of roots) (perItem[c.item] ||= []).push(c);
  for (const e of edits) (perItem[e.item] ||= []).push({ ...e, kind: 'edit', state: 'info', replies: [] });
  for (const k in perItem) perItem[k].sort((a, b) => String(a.at).localeCompare(String(b.at)));
  return perItem;
}
export const openComments = thread => Object.entries(thread).flatMap(([id, list]) => list.filter(c => c.state === 'open').map(c => ({ id, c })));

// The per-machine write secret. Lives in the data dir (never in the repo or the workspace); the server puts it into
// the page it serves, so the static page file carries no secret.
export const tokenFile = cfg => path.join(cfg.dataDir, 'hub.token');
export function token(cfg) {
  const f = tokenFile(cfg);
  if (!existsSync(f)) { mkdirSync(cfg.dataDir, { recursive: true }); writeFileSync(f, randomBytes(18).toString('hex'), { mode: 0o600 }); }
  return (read(f) || '').trim();
}
