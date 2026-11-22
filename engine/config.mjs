// loopboard.config.json: discovery (walk up from cwd, then $LOOPBOARD_CONFIG, then the data dir) and defaults.
import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from './platform.mjs';
import { HubError } from './lib.mjs';

export const CONFIG_NAME = 'loopboard.config.json';
export const DEFAULTS = {
  roots: ['.'],
  mode: 'auto',
  areas: ['Work', 'Content', 'Lab'],
  skip: ['node_modules', '.git', 'dist', 'build', 'vendor', '.venv'],
  port: 4747,
  editor: 'code',
  kinds: {},
  guard: true,
};
export const MODES = ['auto', 'single', 'multi'];

const isFile = f => { try { return fs.statSync(f).isFile(); } catch { return false; } };

// → absolute path of the config file, or null
export function findConfigFile({ cwd = process.cwd(), env = process.env } = {}) {
  for (let d = path.resolve(cwd); ; d = path.dirname(d)) {
    const f = path.join(d, CONFIG_NAME);
    if (isFile(f)) return f;
    if (path.dirname(d) === d) break;
  }
  if (env.LOOPBOARD_CONFIG) {
    const f = path.resolve(env.LOOPBOARD_CONFIG);
    if (isFile(f)) return f;
  }
  const f = path.join(dataDir({ env }), CONFIG_NAME);
  return isFile(f) ? f : null;
}

// Validate and normalise a parsed config. Throws HubError listing every problem.
export function normalize(raw, base) {
  const problems = [];
  const c = { ...DEFAULTS, ...(raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) };
  if (raw && (typeof raw !== 'object' || Array.isArray(raw))) problems.push('the config must be a JSON object');
  const strs = (k, v) => { if (!Array.isArray(v) || v.some(x => typeof x !== 'string' || !x)) problems.push(`\`${k}\` must be an array of non-empty strings`); };
  strs('roots', c.roots); strs('areas', c.areas); strs('skip', c.skip);
  if (!Array.isArray(c.roots) || !c.roots.length) problems.push('`roots` needs at least one folder');
  if (!MODES.includes(c.mode)) problems.push(`\`mode\` must be one of ${MODES.join(', ')}`);
  if (!Number.isInteger(c.port) || c.port < 0 || c.port > 65535) problems.push('`port` must be an integer from 0 to 65535');
  if (typeof c.editor !== 'string') problems.push('`editor` must be a string (code, cursor, zed, subl, idea or none)');
  if (typeof c.guard !== 'boolean') problems.push('`guard` must be true or false');
  if (!c.kinds || typeof c.kinds !== 'object' || Array.isArray(c.kinds)) problems.push('`kinds` must be an object of { name: [stages] }');
  else for (const [k, v] of Object.entries(c.kinds)) {
    if (!/^[a-z][a-z0-9-]*$/.test(k)) problems.push(`kind name \`${k}\` must be lowercase letters, digits and dashes`);
    if (!Array.isArray(v) || !v.length || v.some(s => typeof s !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(s))) problems.push(`kind \`${k}\` needs a list of lowercase stage names`);
  }
  if (problems.length) throw new HubError('invalid config: ' + problems.join('; '));
  return { ...c, roots: c.roots.map(r => path.resolve(base, r)), base };
}

// → { file, base, roots (absolute), mode, areas, skip, port, editor, kinds, guard, dataDir }
// With no config file at all the defaults apply to the current folder (so `loopboard build` works anywhere).
export function loadConfig({ cwd = process.cwd(), env = process.env, file } = {}) {
  file = file || findConfigFile({ cwd, env });
  let raw = {}, base = path.resolve(cwd);
  if (file) {
    base = path.dirname(file);
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch (e) { throw new HubError(`cannot read ${file}: ${e.message}`); }
    try { raw = JSON.parse(text.replace(/^﻿/, '')); } catch (e) { throw new HubError(`${file} is not valid JSON: ${e.message}`); }
  }
  const cfg = normalize(raw, base);
  return { ...cfg, file: file || null, dataDir: dataDir({ env }), env };
}
