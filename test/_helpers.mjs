// Test helpers (not a test). Temp workspaces and a data dir per test; nothing touches the real home or data dir.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../engine/config.mjs';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const BIN = path.join(REPO, 'bin', 'loopboard.mjs');
export const DEMO = path.join(REPO, 'examples', 'demo-workspace');

export const tmp = (prefix = 'hub-test-') => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));

export function writeFiles(dir, files) {
  for (const [rel, content] of Object.entries(files)) {
    const f = path.join(dir, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, content);
  }
  return dir;
}

export const status = (over = {}, board = '| T1 | Thing | build | doing | — | — | |') => {
  const fm = { title: 'Test Project', area: 'Work', kind: 'app', health: 'green', phase: 'Now', updated: '2026-01-01', summary: 'A test.', now: 'T1', ...over };
  const head = Object.entries(fm).filter(([, v]) => v !== null).map(([k, v]) => `${k}: ${v}`).join('\n');
  return `---\n${head}\n---\n\n## Waiting on you\n- nothing\n\n## Now\n- testing\n\n## Next\n- more\n\n## Board\n| ID | Item | Stage | Status | Next step | Date | Note |\n|---|---|---|---|---|---|---|\n${board}\n\n## Done recently\n- x\n\n## Links\n- none\n`;
};

// a workspace with its own data dir; returns { dir, data, env, cfg() }
export function workspace(files = {}, config = { roots: ['.'] }) {
  const dir = tmp('hub-ws-'), data = tmp('hub-data-');
  if (config) writeFiles(dir, { 'loopboard.config.json': JSON.stringify(config) });
  writeFiles(dir, files);
  const env = { ...process.env, LOOPBOARD_HOME: data };
  delete env.LOOPBOARD_CONFIG; delete env.CLAUDE_PLUGIN_DATA;
  return { dir, data, env, cfg: (over = {}) => loadConfig({ cwd: dir, env, ...over }) };
}

export function copyDir(src, dest) {
  fs.cpSync(src, dest, { recursive: true });
  return dest;
}

export const hub = (args, { cwd, env, input } = {}) => {
  const r = spawnSync(process.execPath, [BIN, ...args], { cwd, env, input, encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
};

export const cleanup = (...dirs) => { for (const d of dirs) try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ } };
