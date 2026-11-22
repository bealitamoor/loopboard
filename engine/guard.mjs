#!/usr/bin/env node
// Loopboard guard: Claude Code hooks that make agents go through the hub instead of around it.
// Wired by hooks/hooks.json as `node guard.mjs <start|pre|post|stop>`; the hook payload arrives as JSON on stdin.
// SCOPE: only acts when the session cwd (or the touched path) is inside the configured roots of the hub config found
// from the cwd; with no config, or "guard": false, every event is a silent no-op.
//
// Enforced (PreToolUse, deny with the reason and the allowed way):
//   1. THREAD.jsonl is written only by `loopboard thread` (no Edit/Write, no shell access to the file).
//   2. ## Board rows in a STATUS.md change only via `loopboard thread set / addrow / rmrow / order` (prose stays editable).
//   3. Shell commands may not write STATUS.md; agents may not call the local hub server (it writes as "you"), read
//      the token file, or write threads with `--by you`.
// SessionStart: injects the open hub comments for the workstream the session sits in.
// PostToolUse + Stop: files changed in a workstream -> its STATUS.md must be updated before the session ends.
import { readFileSync, writeFileSync, mkdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig } from './config.mjs';
import { BIN, isInside, read, streams, readThread, openComments, relTo, tokenFile, COMMENT_KINDS } from './lib.mjs';

const HUBCMD = `node "${BIN}" thread`;
const BOARD_HOW = `Change board rows with \`${HUBCMD} set <stream> <ID> <column> "<value>"\` / \`addrow\` / \`rmrow\` / \`order\` (streams: \`${HUBCMD} open\`). Other STATUS.md sections can be edited normally.`;
const PRE_TOOLS = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'];

const deny = why => ({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: `[loopboard guard] ${why} (the hub is the only way to change threads and board rows)` } });

// ---------- text helpers ----------
const boardOf = text => {
  const lines = String(text ?? '').split(/\r?\n/), i = lines.findIndex(l => /^##\s+Board\s*$/i.test(l));
  if (i < 0) return '';
  const rest = lines.slice(i + 1), end = rest.findIndex(l => /^##\s/.test(l));
  return (end < 0 ? rest : rest.slice(0, end)).filter(l => l.trim().startsWith('|')).map(l => l.trim()).join('\n');
};
function afterEdit(file, ti, tool) {
  const cur = read(file);
  if (tool === 'Write') return { before: cur, after: ti.content };
  if (cur == null) return { before: null, after: null };
  const edits = tool === 'MultiEdit' ? ti.edits || [] : [ti];
  let t = cur;
  for (const e of edits) t = e.replace_all ? t.split(e.old_string).join(e.new_string) : t.replace(e.old_string, () => e.new_string);
  return { before: cur, after: t };
}

// ---------- shell command analysis ----------
const unquote = c => c.replace(/'[^']*'/g, "''").replace(/"(?:\\.|[^"\\])*"/g, '""');
function segments(c) {
  const out = []; let cur = '', q = '';
  for (let i = 0; i < c.length; i++) {
    const ch = c[i];
    if (q) { cur += ch; if (ch === q && c[i - 1] !== '\\') q = ''; continue; }
    if (ch === "'" || ch === '"') { q = ch; cur += ch; continue; }
    if (ch === ';' || ch === '\n' || ch === '|' || (ch === '&' && c[i + 1] === '&')) { out.push(cur); cur = ''; if (c[i + 1] === ch) i++; continue; }
    cur += ch;
  }
  return [...out, cur].filter(x => x.trim());
}
const WRITE_OP = /\bsed\b[^|;&]*\s-[a-zA-Z]*i|\bperl\b[^|;&]*\s-[a-zA-Z]*i|\btee\b|\bmv\b|\bcp\b|\brm\b|\bdel\b|\bmove\b|\bcopy\b|\btruncate\b|\bdd\b|\binstall\b|\bln\b|writeFile|appendFile|Set-Content|Add-Content|Out-File|\bgit\s+(checkout|restore|stash|reset)\b|\bpatch\b/;
// a segment writes <target> if it redirects INTO it, or runs a write tool (sed -i, mv, rm...) while naming it
const writes = (seg, target) => {
  if (!target.test(seg)) return false;
  const into = new RegExp('(^|[^0-9&>])>{1,2}\\s*["\']?[^\\s"\'>]*' + target.source);
  if (into.test(seg)) return true;
  return WRITE_OP.test(unquote(seg));
};
const READER = /\b(cat|head|tail|grep|egrep|rg|ag|sed|awk|less|more|strings|xxd|od|hexdump|cut|perl|python3?|ruby|jq|cp|mv|base64|curl|wc|diff|sort|uniq|tr|tee|nl|bat|type|Get-Content|gc)\b|\bnode\s+(-e|--eval|-p|--print)\b|<\s*\S/;

// `loopboard thread ...`, `lb thread ...`, `node <path>/bin/loopboard.mjs thread ...` or `node <path>/engine/thread.mjs ...`, optionally after `cd <dir> &&`
const HUB_THREAD = /^\s*(?:node\s+\S*loopboard\.mjs\s+thread|(?:loopboard|lb)\s+thread|node\s+\S*thread\.mjs)(?:\s|$)/;

export function checkBash(cfg, cwd, cmd) {
  const full = String(cmd || ''), bare = unquote(full), plain = full.replace(/["']/g, '');
  const mentionsRoot = cfg.roots.some(r => full.includes(r));
  const inScope = isInside(cfg.roots, cwd) || mentionsRoot;
  // the local hub server serves the page with its write token embedded and writes as "you": agents never call it
  const host = '(localhost|127\\.0\\.0\\.1|\\[::1\\]|0\\.0\\.0\\.0)\\s*:\\s*' + cfg.port;
  if (new RegExp(host + '\\b', 'i').test(full) && (inScope || new RegExp(host + '/(hub|file|api/(comment|resolve|reopen|set|order|addrow|rebuild|open))', 'i').test(full)))
    return deny(`the hub server on :${cfg.port} is the user's write path (it writes as "you"); agents use \`${HUBCMD} ...\`.`);
  if (!inScope) return null;
  if (/\bthread\b[^;&|]*--by\s+["']?(?!agent)\S/.test(full)) return deny('agents cannot write as "you". Drop `--by`; agent writes are always by "agent".');
  const lead = plain.replace(/^\s*cd\s+\S+\s*&&\s*/, '');
  if (HUB_THREAD.test(lead) && !/[;&|<>`]|\$\(/.test(bare.replace(/^\s*cd\s+\S+\s*&&\s*/, ''))) return null; // a pure `loopboard thread` call is the allowed path
  if (/THREAD\.jsonl/.test(full)) return deny(`THREAD.jsonl is only read and written through \`${HUBCMD}\`. Read a thread with \`show <stream> <ID>\`; write with \`add\` / \`resolve\` / \`reopen\`.`);
  if (/hub\.token\b/.test(full)) return deny("the hub token is the hub page's write key; agents may not read or use it.");
  if (segments(full).some(g => writes(g, /STATUS\.md/))) return deny('STATUS.md may not be changed from the shell. ' + BOARD_HOW + ' For the prose sections use the Edit tool.');
  return null;
}

export function checkPre(cfg, input) {
  const tool = input.tool_name, ti = input.tool_input || {};
  const cwd = path.resolve(String(input.cwd || process.cwd()));
  if (tool === 'Bash') return checkBash(cfg, cwd, ti.command);
  const p = ti.file_path || ti.notebook_path || ti.path ? path.resolve(cwd, String(ti.file_path || ti.notebook_path || ti.path)) : '';
  if (p && p === tokenFile(cfg)) return deny("the hub token is the hub page's write key; agents may not read or write it.");
  if (!p || !isInside(cfg.roots, p)) return null;
  const base = path.basename(p);
  if (PRE_TOOLS.includes(tool)) {
    if (base === 'THREAD.jsonl') return deny(`THREAD.jsonl is append-only history written by \`${HUBCMD} add|resolve|reopen\`, never by hand.`);
    if (base === 'STATUS.md') {
      const { before, after } = afterEdit(p, ti, tool);
      if (before != null && after != null && boardOf(before) !== boardOf(after)) return deny('this edit changes ## Board rows of ' + relTo(cfg, p) + '. ' + BOARD_HOW);
    }
    return null;
  }
  if (tool === 'Read' && base === 'THREAD.jsonl') return deny(`read threads with \`${HUBCMD} show <stream> <ID>\` (or \`open\`), not the raw file.`);
  return null;
}

// ---------- session state (which workstream files this session touched) ----------
const stateFile = (cfg, input) => path.join(cfg.dataDir, 'state', String(input.session_id || 'unknown').replace(/[^\w-]/g, '') + '.json');
const loadState = (cfg, input) => { try { return JSON.parse(readFileSync(stateFile(cfg, input), 'utf8')); } catch { return { touched: {}, status: {} }; } };
function statusFor(cfg, file) { // nearest STATUS.md above the file, inside the roots
  for (let d = path.dirname(file); isInside(cfg.roots, d); d = path.dirname(d)) {
    const s = path.join(d, 'STATUS.md'); if (existsSync(s)) return s;
    if (path.dirname(d) === d) break;
  }
  return null;
}

export function checkPost(cfg, input) {
  const ti = input.tool_input || {}, cwd = path.resolve(String(input.cwd || process.cwd()));
  const raw = ti.file_path || ti.notebook_path; if (!raw) return null;
  const p = path.resolve(cwd, String(raw));
  const parts = path.relative(cfg.roots.find(r => isInside([r], p)) || '', p).split(path.sep);
  if (!isInside(cfg.roots, p) || ['STATUS.md', 'THREAD.jsonl'].includes(path.basename(p)) || parts.some(x => cfg.skip.includes(x) || x === '.claude')) return null;
  const st = statusFor(cfg, p); if (!st) return null;
  const s = loadState(cfg, input); s.touched[p] ||= Date.now(); s.status[p] = st;
  mkdirSync(path.dirname(stateFile(cfg, input)), { recursive: true }); writeFileSync(stateFile(cfg, input), JSON.stringify(s));
  return null;
}

export function checkStop(cfg, input) {
  const s = loadState(cfg, input); if (!Object.keys(s.touched || {}).length) return null;
  const need = {};
  for (const [f, t] of Object.entries(s.touched)) {
    const st = s.status?.[f]; if (!st) continue;
    const m = (() => { try { return statSync(st).mtimeMs; } catch { return 0; } })();
    if (m < t) (need[st] ||= []).push(path.relative(path.dirname(st), f));
  }
  const list = Object.entries(need);
  if (!list.length) return null;
  const msg = list.map(([st, fs]) => `- ${relTo(cfg, st)} (you changed ${fs.slice(0, 4).join(', ')}${fs.length > 4 ? ` +${fs.length - 4}` : ''})`).join('\n');
  if (input.stop_hook_active) return { systemMessage: `[loopboard guard] STATUS.md still not updated after changes:\n${msg}` };
  return { decision: 'block', reason: `[loopboard guard] This session changed files in a hub workstream but did not update its STATUS.md:\n${msg}\nUpdate it now: set \`updated:\`, Now / Done recently / Waiting on you as needed (Edit tool), board rows via \`${HUBCMD} set|addrow|rmrow\`, then \`node "${BIN}" build\`.` };
}

export function checkStart(cfg, input) {
  const cwd = path.resolve(String(input.cwd || process.cwd()));
  if (!isInside(cfg.roots, cwd)) return null;
  const all = streams(cfg);
  const atRoot = cfg.roots.includes(cwd);
  const here = all.filter(s => atRoot || all.length === 1 || cwd === s.dir || isInside([s.dir], cwd) || isInside([cwd], s.dir));
  const lines = [];
  for (const s of here) {
    const open = openComments(readThread(s.dir));
    if (!open.length) continue;
    lines.push(`${s.fm.title} (stream ${s.id} · ${relTo(cfg, s.file)})`);
    for (const { id, c } of open) lines.push(`  ${id} · ${c.cid} · ${c.by} · ${COMMENT_KINDS[c.kind]}: ${c.text}`);
  }
  const ctx = `Loopboard (enforced by the loopboard guard): threads and board rows change only through \`${HUBCMD} ...\`; agent writes are always by "agent". ` +
    (lines.length ? `Open hub comments for this work: treat them as the task list and follow the hub-work skill (/loopboard:hub-work):\n${lines.join('\n').slice(0, 3500)}` : 'Open hub comments for this workstream: none.');
  return { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: ctx } };
}

// → the JSON to print for the hook, or null for "nothing to say". Never throws: a broken hub must not break the session.
export function handle(event, input, { env = process.env } = {}) {
  try {
    const cwd = path.resolve(String(input?.cwd || process.cwd()));
    let cfg; try { cfg = loadConfig({ cwd, env }); } catch { return null; }
    if (!cfg.file || cfg.guard === false) return null;
    const f = { pre: checkPre, post: checkPost, stop: checkStop, start: checkStart }[event];
    return f ? f(cfg, input || {}) : null;
  } catch { return null; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  let input = {};
  try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { process.exit(0); }
  const out = handle(process.argv[2] || '', input);
  if (out) process.stdout.write(JSON.stringify(out));
  process.exit(0);
}
