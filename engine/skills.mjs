// Skills catalog: finds every SKILL.md the user can invoke and turns it into plain data for the page and the CLI.
// Sources, in this order: this plugin (`/loopboard:<name>`), `.claude/skills` in each configured root (`/<name>`),
// `~/.claude/skills` (only when config `skills.user` is not false), and extra folders from config `skills.dirs`.
//
// Safety: skill folders may come from anywhere, so everything read here is treated as untrusted text (the page escapes it).
// The body is capped at 200 KB per skill and the catalog at 500 skills; an unreadable skill is skipped, never an error. A file
// or folder inside a skill folder that is a symlink pointing outside that folder is never read or listed.
//
//   collectSkills(cfg)   -> { items, count, capped, sources, roles, userEnabled }
//   skillPaths(cfg)      -> Set of absolute paths (skill folders, SKILL.md files, listed files) the page may open in an editor
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { REPO } from './lib.mjs';

export const MAX_BODY = 200 * 1024;        // bytes of one SKILL.md that are kept
export const MAX_SKILLS = 500;             // skills in the catalog
const PAGE_BUDGET = 8 * 1024 * 1024;       // total body text embedded in the page, so 500 big skills cannot make a huge file
const MAX_LISTED = 100;                    // files listed per skill

export const ROLE_ORDER = ['Core', 'Developer', 'Designer', 'Social', 'Planner', 'SEO'];
const PREFIX_ROLE = { hub: 'Core', dev: 'Developer', design: 'Designer', social: 'Social', plan: 'Planner', seo: 'SEO' };
const ALIAS_ROLE = {
  core: 'Core', hub: 'Core', developer: 'Developer', dev: 'Developer', development: 'Developer', designer: 'Designer', design: 'Designer',
  social: 'Social', 'social media': 'Social', planner: 'Planner', plan: 'Planner', planning: 'Planner', seo: 'SEO', other: 'Other',
};
export const SOURCE_LABEL = { plugin: 'Plugin', project: 'Project', user: 'User', extra: 'Extra' };
const SOURCE_ORDER = ['plugin', 'project', 'user', 'extra'];

// "dev" / "Developer" / "DEV" -> "Developer"; an unknown label stays as written (trimmed, no control characters)
export function canonRole(label) {
  const t = String(label ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 24);
  return ALIAS_ROLE[t.toLowerCase()] || t;
}
export const inferRole = name => { const m = /^([a-z]+)-/.exec(String(name).toLowerCase()); return (m && PREFIX_ROLE[m[1]]) || 'Other'; };

// the first sentence of a description: up to the first . ! or ? that is followed by a space or the end
export function firstSentence(text, max = 220) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  const m = /^(.+?[.!?])(?=\s|$)/.exec(t);
  const s = m ? m[1] : t;
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s;
}

// The part of a description after its first sentence, starting at a "Use when ..." clause when there is one ("" when nothing is left).
export function whenToUse(description) {
  const d = String(description || '').replace(/\s+/g, ' ').trim(), first = firstSentence(d, Infinity);
  const rest = d.slice(first.length).trim();
  const m = /\bUse (?:this )?(?:when|whenever|for|to)\b/i.exec(rest);
  return m ? rest.slice(m.index) : rest;
}

// Frontmatter with block scalars (`>` `|`), wrapped plain values, quotes and one nested level (`metadata:` -> `role: dev`).
export function parseSkill(text) {
  text = String(text).replace(/^\uFEFF/, '');
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!m) return { fm: {}, body: text };
  const unq = v => { v = v.trim(); const q = /^(["'])([\s\S]*)\1$/.exec(v); return q ? (q[1] === '"' ? q[2].replace(/\\(["\\])/g, '$1') : q[2].replace(/''/g, "'")) : v; };
  const raw = []; let cur = null;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (kv) { cur = { key: kv[1].toLowerCase(), val: kv[2], cont: [] }; raw.push(cur); }
    else if (cur && /^\s+\S/.test(line)) cur.cont.push(line);
    else if (cur && !line.trim()) cur.cont.push('');
  }
  const fm = {};
  for (const { key, val, cont } of raw) {
    const lines = cont.filter((l, i) => l.trim() || i < cont.length - 1);
    const block = /^([>|])[+-]?\d*$/.exec(val.trim());
    if (block) fm[key] = lines.map(l => l.trim()).join(block[1] === '|' ? '\n' : ' ').replace(/\s+$/, '');
    else if (val.trim() === '' && lines.length && lines.every(l => !l.trim() || /^\s+[A-Za-z_][\w-]*\s*:/.test(l))) {
      const o = {};
      for (const l of lines) { const n = /^\s+([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(l); if (n) o[n[1].toLowerCase()] = unq(n[2]); }
      fm[key] = o;
    } else fm[key] = unq([val, ...lines.map(l => l.trim())].join(' ').trim());
  }
  return { fm, body: text.slice(m[0].length) };
}

const realOf = p => { try { return fs.realpathSync(p); } catch { return null; } };
const inside = (real, base) => { if (!real || !base) return false; const r = path.relative(base, real); return r === '' || (!r.startsWith('..') && !path.isAbsolute(r)); };

// read at most `cap` bytes of a file; { text, truncated } or null when unreadable
function readCapped(file, cap) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const size = fs.fstatSync(fd).size;
    const buf = Buffer.alloc(Math.min(size, cap));
    let n = 0;
    while (n < buf.length) { const r = fs.readSync(fd, buf, n, buf.length - n, n); if (!r) break; n += r; }
    return { text: buf.subarray(0, n).toString('utf8'), truncated: size > cap };
  } catch { return null; } finally { if (fd !== undefined) try { fs.closeSync(fd); } catch { /* ignore */ } }
}

// references/ and scripts/ of one skill: regular files up to two folders deep; links leaving the skill folder are skipped
function listFiles(skillDir, realSkill) {
  const out = { references: [], scripts: [] };
  for (const kind of Object.keys(out)) {
    const base = path.join(skillDir, kind);
    const walk = (dir, depth) => {
      let names; try { names = fs.readdirSync(dir).filter(n => !n.startsWith('.')).sort(); } catch { return; }
      for (const n of names) {
        if (out[kind].length >= MAX_LISTED) return;
        const p = path.join(dir, n);
        let ls; try { ls = fs.lstatSync(p); } catch { continue; }
        if (ls.isSymbolicLink() && !inside(realOf(p), realSkill)) continue;
        let st; try { st = fs.statSync(p); } catch { continue; }
        if (st.isDirectory() && depth < 2) walk(p, depth + 1);
        else if (st.isFile()) out[kind].push({ name: path.relative(base, p).split(path.sep).join('/'), abs: p, size: st.size });
      }
    };
    const ls = (() => { try { return fs.lstatSync(base); } catch { return null; } })();
    if (!ls || (ls.isSymbolicLink() && !inside(realOf(base), realSkill))) continue;
    walk(base, 0);
  }
  return out;
}

export function homeOf(cfg) {
  const env = cfg?.env || process.env;
  return (process.platform === 'win32' ? env.USERPROFILE || env.HOME : env.HOME || env.USERPROFILE) || os.homedir();
}

// the folders to scan: [{ dir, source, shown }] where `shown` is how a skill's path is displayed (never an absolute home path)
function sources(cfg, home) {
  const list = [{ dir: path.join(REPO, 'skills'), source: 'plugin', shown: 'skills' }];
  (cfg.roots || []).forEach((r, i) => list.push({ dir: path.join(r, '.claude', 'skills'), source: 'project', shown: (i ? path.basename(r) + '/' : '') + '.claude/skills' }));
  if (cfg.skills?.user !== false) list.push({ dir: path.join(home, '.claude', 'skills'), source: 'user', shown: '~/.claude/skills' });
  for (const d of cfg.skills?.dirs || []) list.push({ dir: d, source: 'extra', shown: (d === home || d.startsWith(home + path.sep) ? '~' + d.slice(home.length) : d).split(path.sep).join('/'), single: true });
  return list;
}

export function collectSkills(cfg, { bodies = true } = {}) {
  const home = homeOf(cfg), items = [], seen = new Set(), ids = new Set();
  let capped = false, budget = PAGE_BUDGET;
  const cap = bodies ? MAX_BODY : 4096;

  const take = (skillDir, dirName, src) => {
    if (capped) return;
    const file = path.join(skillDir, 'SKILL.md');
    let ls; try { ls = fs.lstatSync(file); } catch { return; }
    const realSkill = realOf(skillDir), realFile = realOf(file);
    if (!realSkill || !realFile || !inside(realFile, realSkill)) return;     // a SKILL.md that is a link out of its folder
    if (ls.isDirectory() || seen.has(realFile)) return;
    const got = readCapped(file, cap);
    if (!got) return;
    const { fm, body } = parseSkill(got.text);
    let name = String(fm.name || '').trim();
    if (!/^[A-Za-z0-9][\w.-]{0,63}$/.test(name)) name = /^[A-Za-z0-9][\w.-]{0,63}$/.test(dirName) ? dirName : '';
    if (!name) return;
    if (items.length >= MAX_SKILLS) { capped = true; return; }
    seen.add(realFile);
    const meta = fm.metadata && typeof fm.metadata === 'object' ? fm.metadata : {};
    const explicit = canonRole(fm.category || meta.role || meta.category || '');
    const role = explicit || inferRole(name);
    const description = String(fm.description || '').replace(/\s+/g, ' ').trim();
    const hint = String(fm['argument-hint'] || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    let id = name; if (ids.has(id)) id = `${name}@${src.source}`; for (let n = 2; ids.has(id); n++) id = `${name}@${src.source}${n}`; ids.add(id);
    const invocation = (src.source === 'plugin' ? '/loopboard:' : '/') + name;
    let text = bodies ? body.trim() : '', truncated = got.truncated;
    if (text.length > budget) { text = text.slice(0, Math.max(0, budget)); truncated = true; }
    budget -= text.length;
    items.push({
      id, name, invocation, source: src.source, sourceLabel: SOURCE_LABEL[src.source], role, explicitRole: !!explicit,
      description, summary: firstSentence(description), when: whenToUse(description), hint, copy: hint ? `${invocation} ${hint.split(/\s+\|\s+/)[0]}` : invocation,
      body: text, bodyTruncated: truncated, dir: skillDir, file, shown: `${src.shown}/${dirName}/SKILL.md`,
      ...listFiles(skillDir, realSkill),
    });
  };

  for (const src of sources(cfg, home)) {
    if (capped) break;
    let st; try { st = fs.statSync(src.dir); } catch { continue; }
    if (!st.isDirectory()) continue;
    if (src.single && fs.existsSync(path.join(src.dir, 'SKILL.md'))) { take(src.dir, path.basename(src.dir), { ...src, shown: path.dirname(src.shown) }); continue; }
    let names; try { names = fs.readdirSync(src.dir).filter(n => !n.startsWith('.')).sort(); } catch { continue; }
    for (const n of names) {
      const p = path.join(src.dir, n);
      let s; try { s = fs.statSync(p); } catch { continue; }                  // follows a link to a skill folder; a broken link is skipped
      if (s.isDirectory()) take(p, n, src);
    }
  }

  const present = [...new Set(items.map(i => i.role))];
  const custom = present.filter(r => !ROLE_ORDER.includes(r) && r !== 'Other').sort((a, b) => a.localeCompare(b));
  const roles = [...ROLE_ORDER, ...custom, 'Other'].filter(r => present.includes(r)).map(r => ({ role: r, count: items.filter(i => i.role === r).length }));
  const counts = Object.fromEntries(SOURCE_ORDER.map(s => [s, items.filter(i => i.source === s).length]));
  return { items, count: items.length, capped, sources: counts, roles, userEnabled: cfg.skills?.user !== false };
}

// everything the page may ask the server to open: each skill folder, its SKILL.md and its listed files
export function skillPaths(cfg) {
  const set = new Set();
  for (const k of collectSkills(cfg, { bodies: false }).items) { set.add(k.dir); set.add(k.file); for (const f of [...k.references, ...k.scripts]) set.add(f.abs); }
  return set;
}
