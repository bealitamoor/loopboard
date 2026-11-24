// Renders the dashboard: reads every STATUS.md (+ THREAD.jsonl) found by the config and writes one self-contained
// index.html (data, CSS and JS inlined; no CDN, no webfonts) into the data dir. File references are absolute paths in the
// data; the page turns them into /file URLs when served and into file:// links when opened directly (read-only).
//
//   build(cfg)          → { streams, issues, mode, out, html }  (writes the page unless opts.write === false)
//   formatReport(res)   → the summary lines the CLI prints
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import {
  ENGINE, stagesOf, STATUSES, HEALTH, REQUIRED, SECTIONS, BOARD_COLS, ITEM_KEYS, COMMENT_KINDS,
  read, stat, ls, slug, discover, relTo, readThread,
} from './lib.mjs';
import { collectSkills } from './skills.mjs';

const VIDEO = /\.(mp4|mov|webm|m4v)$/i, IMAGE = /\.(png|jpe?g|gif|webp|svg)$/i, PAGE = /\.(html?|svg)$/i;
export const TOKEN_PLACEHOLDER = '__HUB_TOKEN__';

const clean = s => String(s ?? '').replace(/[`*]/g, '').trim().toLowerCase();
const daysSince = d => { const today = new Date(); today.setHours(0, 0, 0, 0); const t = Date.parse(d); return Number.isNaN(t) ? null : Math.floor((today - t) / 864e5); };

function splitBy(body, re) { // → [{name, lines}] split on headings matching re (group 1 = name)
  const out = []; let cur = { name: '', lines: [] };
  for (const line of body.split(/\r?\n/)) {
    const h = line.match(re);
    if (h) { out.push(cur); cur = { name: h[1].trim(), lines: [] }; } else cur.lines.push(line);
  }
  out.push(cur);
  return out;
}

const cells = line => line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'));
function table(lines) {
  const rows = lines.filter(l => l.trim().startsWith('|'));
  if (rows.length < 2 || !/^\s*\|?\s*:?-{2,}/.test(rows[1])) return null;
  return { head: cells(rows[0]), rows: rows.slice(2).map(cells) };
}

// relative markdown link targets → `hubfile:<encoded absolute path>`, which the page maps to a served or file:// URL
function fixLinks(md, dir) {
  return md.replace(/\]\(([^)\s]+)\)/g, (all, t) => {
    if (/^([a-z][a-z0-9+.-]*:|#)/i.test(t) && !/^[a-z]:[\\/]/i.test(t)) return all;
    let target; try { target = decodeURIComponent(t.split('#')[0]); } catch { return all; }
    return `](hubfile:${encodeURIComponent(path.resolve(dir, target))})`;
  });
}

function fileRef(cfg, dir, rel) {
  const abs = path.resolve(dir, rel.replace(/^`|`$/g, ''));
  const st = stat(abs);
  return { rel: relTo(cfg, abs), abs, exists: !!st, isDir: !!st?.isDirectory(), mtime: st?.mtimeMs || 0 };
}

function listFolder(abs) { // the folder itself + its out/ (and out/*/ one level): what a detail page shows
  const files = [];
  const add = d => { for (const n of ls(d)) { const p = path.join(d, n), st = stat(p); if (st?.isFile()) files.push({ name: path.relative(abs, p), abs: p, mtime: st.mtimeMs, size: st.size }); } };
  add(abs);
  for (const sub of ['out', 'thumb', 'thumbs', 'screenshots', 'stills']) {
    const d = path.join(abs, sub);
    if (stat(d)?.isDirectory()) { add(d); for (const n of ls(d)) if (stat(path.join(d, n))?.isDirectory() && !/^(versions|qa|frames|tmp)$/.test(n)) add(path.join(d, n)); }
  }
  return files.sort((a, b) => b.mtime - a.mtime);
}

function kitFields(abs) { // a markdown kit → copy-ready fields: "## Section" packs, nested headings, "**Label:** value" packs
  const text = read(abs);
  if (text == null) return null;
  const lines = text.split(/\r?\n/), segs = [{ label: '', lines: [] }], stack = [];
  lines.forEach((l, i) => {
    const h = l.match(/^(#{1,4})\s+(.+?)\s*$/);
    if (!h) return segs[segs.length - 1].lines.push(l);
    if (i === lines.findIndex(x => x.trim()) && h[1].length === 1) return; // the document title
    stack.length = h[1].length - 1; stack[h[1].length - 1] = h[2];
    segs.push({ label: stack.filter(Boolean).join(' > '), lines: [] });
  });
  const top = [], fields = [];
  const boldMode = segs.length === 1; // "**Label:** value" fields only in packs that have no section headings
  for (const sg of segs) {
    let cur = sg.label ? { label: sg.label, lines: [] } : null;
    for (const l of sg.lines) {
      const bf = boldMode && l.match(/^\*\*([^*:]{1,40}):\*\*\s*(.*)$/);
      if (bf) { if (cur) fields.push(cur); cur = { label: (sg.label ? sg.label + ' > ' : '') + bf[1].trim(), lines: bf[2] ? [bf[2]] : [] }; }
      else if (cur) cur.lines.push(l); else top.push(l);
    }
    if (cur) fields.push(cur);
  }
  return { top: top.join('\n').trim(), fields: fields.map(f => ({ label: f.label, text: f.lines.join('\n').trim() })).filter(f => f.text) };
}

function scanPages(cfg, dir) { // .html/.svg visuals inside the workstream folder (not renders, not deps)
  const out = [], skip = new Set(cfg.skip);
  const walk = (d, depth) => {
    for (const n of ls(d)) {
      if (skip.has(n) || /^(out|node_modules|build|dist|frames|tmp|_tmp.*|assets|vendor)$/.test(n)) continue;
      const p = path.join(d, n), st = stat(p);
      if (!st) continue;
      if (st.isDirectory() && depth < 3) walk(p, depth + 1);
      else if (st.isFile() && PAGE.test(n) && st.size < 8e6) out.push({ rel: path.relative(dir, p), abs: p, mtime: st.mtimeMs, svg: /\.svg$/i.test(n) });
    }
  };
  walk(dir, 0);
  return out.sort((a, b) => b.mtime - a.mtime).slice(0, 60);
}

export function build(cfg, opts = {}) {
  const KINDS = stagesOf(cfg);
  const { mode, streams: found } = discover(cfg);
  const issues = [], streams = [];

  for (const { id, file, dir, fm, body } of found) {
    const relFile = relTo(cfg, file);
    const warn = msg => issues.push({ file: relFile, msg });
    for (const k of REQUIRED) if (!fm[k]) warn(`missing frontmatter \`${k}\``);
    const stages = KINDS[fm.kind] || [];
    if (!KINDS[fm.kind]) warn(`unknown kind \`${fm.kind}\` (known: ${Object.keys(KINDS).join(', ')})`);
    if (fm.health && !HEALTH.includes(fm.health)) warn(`unknown health \`${fm.health}\``);

    const secs = splitBy(body, /^##\s+(.+?)\s*$/).filter(s => s.name);
    const sec = n => secs.find(s => s.name.toLowerCase() === n.toLowerCase());
    for (const n of SECTIONS) if (!sec(n)) warn(`missing section \`## ${n}\``);
    const md = n => { const s = sec(n); return s ? fixLinks(s.lines.join('\n').trim(), dir) : ''; };

    // ---- board
    const rows = []; let extra = [];
    const t = sec('Board') && table(sec('Board').lines);
    if (sec('Board') && !t) warn('`## Board` has no markdown table');
    if (t) {
      const head = t.head.map(h => clean(h));
      for (const c of ['id', 'item', 'stage', 'status']) if (!head.includes(c)) warn(`\`## Board\` has no \`${c}\` column`);
      const col = c => head.indexOf(c);
      extra = t.head.map((h, i) => [h, i]).filter(([, i]) => !BOARD_COLS.includes(head[i]));
      const seen = new Set();
      for (const r of t.rows) {
        const g = c => (col(c) >= 0 ? r[col(c)] || '' : '');
        const row = { id: g('id').replace(/[`*]/g, '').trim(), item: fixLinks(g('item'), dir), stage: clean(g('stage')), status: clean(g('status')),
          next: fixLinks(g('next step'), dir), date: g('date'), note: fixLinks(g('note'), dir), extra: extra.map(([, i]) => fixLinks(r[i] || '', dir)) };
        if (!row.id) warn(`board row "${row.item.slice(0, 40)}" has no ID`);
        else if (seen.has(row.id)) warn(`duplicate board ID \`${row.id}\``);
        seen.add(row.id);
        if (!STATUSES.includes(row.status)) warn(`row ${row.id}: unknown status \`${g('status')}\``);
        if (stages.length && !stages.includes(row.stage)) warn(`row ${row.id}: stage \`${g('stage')}\` is not a ${fm.kind} stage (${stages.join(', ')})`);
        rows.push(row);
      }
    }

    // ---- items
    const items = {};
    if (sec('Items')) {
      for (const blk of splitBy(sec('Items').lines.join('\n'), /^###\s+(.+?)\s*$/).filter(b => b.name)) {
        const iid = blk.name.split(/\s+[·—–-]\s+/)[0].replace(/[`*]/g, '').trim();
        const it = { id: iid, title: blk.name.slice(iid.length).replace(/^\s*[·—–-]\s*/, ''), docs: [], urls: [], cmds: [], copies: [], notes: [] };
        for (const line of blk.lines) {
          const kv = line.match(/^\s*[-*]\s+([a-z]+)\s*:\s*(.+)$/);
          if (!kv || !ITEM_KEYS.includes(kv[1])) { it.notes.push(line); continue; }
          const [, key, val] = kv;
          const [label, value] = val.includes(' | ') ? [val.slice(0, val.indexOf(' | ')).trim(), val.slice(val.indexOf(' | ') + 3).trim()] : ['', val.trim()];
          const v = value.replace(/^`|`$/g, '');
          if (key === 'folder') { const f = fileRef(cfg, dir, v); if (!f.exists) warn(`item ${iid}: folder not found \`${v}\``); else it.folder = { ...f, files: listFolder(f.abs) }; }
          else if (key === 'play') { const f = fileRef(cfg, dir, v); if (!f.exists) warn(`item ${iid}: play file not found \`${v}\``); else it.play = f; }
          else if (key === 'kit') { const f = fileRef(cfg, dir, v); const k = f.exists && kitFields(f.abs); if (!k) warn(`item ${iid}: kit not found \`${v}\``); else it.kit = { ...f, ...k, top: fixLinks(k.top, path.dirname(f.abs)) }; }
          else if (key === 'doc') { const f = fileRef(cfg, dir, v); if (!f.exists) warn(`item ${iid}: doc not found \`${v}\``); it.docs.push({ label: label || path.basename(v), ...f }); }
          else if (key === 'url') it.urls.push({ label: label || 'Open', url: v });
          else if (key === 'cmd') it.cmds.push({ label: label || 'Run', cmd: v, full: /^cd\s/.test(v) ? v : `cd "${dir}" && ${v}` });
          else if (key === 'copy') it.copies.push({ label: label || 'Copy', text: v });
        }
        it.notes = fixLinks(it.notes.join('\n').trim(), dir);
        // preview: explicit play, else newest video in the folder, else newest image
        const pick = re => it.folder?.files.find(f => re.test(f.name));
        const pv = it.play || pick(VIDEO) || pick(IMAGE);
        if (pv) it.preview = { abs: pv.abs, name: path.basename(pv.abs), type: VIDEO.test(pv.abs) ? 'video' : IMAGE.test(pv.abs) ? 'image' : /\.html?$/i.test(pv.abs) ? 'html' : 'file' };
        if (!rows.some(r => r.id === iid)) warn(`item \`${iid}\` has no matching board row`);
        items[iid] = it;
      }
    }

    // ---- rules + pages
    let rules = null;
    if (fm.rules) {
      const f = fileRef(cfg, dir, fm.rules);
      if (!f.exists) warn(`rules file not found \`${fm.rules}\``);
      else rules = { ...f, md: fixLinks((read(f.abs) || '').replace(/^---[\s\S]*?\n---\r?\n/, ''), path.dirname(f.abs)) };
    }
    const waiting = md('Waiting on you').split('\n').filter(l => /^\s*[-*]\s+/.test(l)).map(l => l.replace(/^\s*[-*]\s+/, '').trim())
      .filter(l => !/^(nothing|none|—|-)\.?$/i.test(l.replace(/[*_`]/g, '')));
    const counts = Object.fromEntries(STATUSES.map(s => [s, rows.filter(r => r.status === s).length]));
    if (fm.now && !rows.some(r => r.id === fm.now)) warn(`\`now: ${fm.now}\` is not a board ID`);

    streams.push({
      id, ...fm, age: daysSince(fm.updated), stages, folder: relTo(cfg, dir), dirAbs: dir, statusAbs: file,
      rows, extraHead: extra.map(([h]) => h), items, waiting, counts, rules, pages: scanPages(cfg, dir), thread: readThread(dir),
      waitMd: md('Waiting on you'), nowMd: md('Now'), nextMd: md('Next'), doneMd: md('Done recently'), linksMd: md('Links'),
    });
  }
  const rank = a => { const i = cfg.areas.indexOf(a); return i < 0 ? 99 : i; };
  streams.sort((a, b) => rank(a.area) - rank(b.area) || String(a.area || '').localeCompare(String(b.area || '')) || a.title.localeCompare(b.title));

  const data = {
    built: new Date().toISOString(), mode, roots: cfg.roots, streams, issues, STATUSES, KINDS: COMMENT_KINDS,
    skills: collectSkills(cfg), url: `http://localhost:${cfg.port}/hub/`, canEditor: !!cfg.editor && cfg.editor !== 'none', token: TOKEN_PLACEHOLDER,
  };
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  const css = read(path.join(ENGINE, 'hub.css')), js = read(path.join(ENGINE, 'client.js'));
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Loopboard</title><style>${css}</style></head><body>
<aside class="side" id="side"></aside><div class="shell"><header class="topbar" id="top"></header><div class="scroll" id="scroll"><div id="nav"></div><main id="main"></main></div></div>
<div id="lb"><img alt=""></div><div id="toast"></div>
<script id="data" type="application/json">${json}</script><script>${js}</script></body></html>`;
  const out = path.join(cfg.dataDir, 'index.html');
  if (opts.write !== false) { mkdirSync(cfg.dataDir, { recursive: true }); writeFileSync(out, html); }
  return { streams, issues, mode, out, html };
}

export function formatReport(res) {
  const nItems = res.streams.reduce((a, s) => a + Object.keys(s.items).length, 0), nRows = res.streams.reduce((a, s) => a + s.rows.length, 0);
  const lines = [`${res.streams.length} workstream(s) (${res.mode}) · ${nRows} board rows · ${nItems} detail pages · ${res.issues.length} format issue(s)`];
  for (const i of res.issues) lines.push(`  ! ${i.file}: ${i.msg.replace(/`/g, '')}`);
  lines.push(res.out);
  return lines.join('\n');
}
