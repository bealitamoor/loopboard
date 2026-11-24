// Implementations of the `loopboard` commands other than `thread` (init, new, doctor, build, serve, open, service, list).
// Each returns the process exit code; output goes to stdout/stderr.
import fs from 'node:fs';
import net from 'node:net';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { CONFIG_NAME, DEFAULTS, loadConfig } from './config.mjs';
import { REPO, BIN, HubError, die, stagesOf, BUILTIN_KINDS, HEALTH, discover, readThread, openComments, relTo, todayStr, read } from './lib.mjs';
import { build, formatReport } from './build.mjs';
import { startServer, instanceId } from './server.mjs';
import * as platform from './platform.mjs';
import { collectSkills, canonRole, SOURCE_LABEL } from './skills.mjs';

const out = s => process.stdout.write(s + '\n');
const err = s => process.stderr.write(s + '\n');

// ---------------------------------------------------------------- templates
const APP_MARKERS = ['package.json', 'build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts', 'pom.xml', 'Cargo.toml', 'go.mod', 'pyproject.toml', 'requirements.txt', 'Package.swift', 'pubspec.yaml', 'composer.json', 'Gemfile', 'Makefile'];
export function inferKind(dir) {
  try {
    const names = fs.readdirSync(dir);
    if (names.some(n => APP_MARKERS.includes(n) || /\.(csproj|sln|xcodeproj)$/.test(n))) return 'app';
  } catch { /* unreadable: fall through */ }
  return 'plan';
}

export function renderTemplate(cfg, kind, vars) {
  const stages = stagesOf(cfg)[kind];
  if (!stages) die(`unknown kind "${kind}". Known: ${Object.keys(stagesOf(cfg)).join(', ')}`);
  let text = read(path.join(REPO, 'templates', `STATUS-${kind}.md`));
  if (text == null) { // a kind added in loopboard.config.json has no template file: use a generic one
    text = `---\ntitle: {{TITLE}}\narea: {{AREA}}\nkind: ${kind}\nhealth: green\nphase: Starting\nupdated: {{DATE}}\nsummary: Describe what this is and where it stands.\nnow: R1\n---\n\n## Waiting on you\n- nothing\n\n## Now\n- First item\n\n## Next\n- Second item\n\n## Board\n| ID | Item | Stage | Status | Next step | Date | Note |\n|---|---|---|---|---|---|---|\n| R1 | First item | ${stages[0]} | doing | Start it | — | |\n| R2 | Second item | ${stages[0]} | todo | — | — | |\n\n## Done recently\n- {{DATE}} Created this STATUS.md\n\n## Links\n- (add links here)\n`;
  }
  const v = { TITLE: vars.title, AREA: vars.area || 'Work', DATE: todayStr() };
  return text.replace(/\{\{(TITLE|AREA|DATE)\}\}/g, (_, k) => v[k]);
}

// ---------------------------------------------------------------- init / new
export function init(cwd, flags) {
  const file = path.join(cwd, CONFIG_NAME);
  if (fs.existsSync(file)) { err(`${file} already exists; not overwriting it.`); return 1; }
  if (flags.single && flags.multi) { err('choose --single or --multi, not both'); return 1; }
  const cfg = { roots: ['.'], mode: flags.single ? 'single' : flags.multi ? 'multi' : 'auto', areas: flags.areas ? String(flags.areas).split(',').map(s => s.trim()).filter(Boolean) : DEFAULTS.areas,
    skip: DEFAULTS.skip, port: DEFAULTS.port, editor: DEFAULTS.editor, kinds: {}, guard: true };
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n');
  out(`wrote ${file} (mode ${cfg.mode})`);
  if (flags.single) {
    const status = path.join(cwd, 'STATUS.md');
    if (fs.existsSync(status)) out('STATUS.md already exists; left as it is.');
    else {
      const kind = inferKind(cwd);
      fs.writeFileSync(status, renderTemplate(loadConfig({ cwd, file }), kind, { title: path.basename(cwd), area: cfg.areas[0] }));
      out(`wrote ${status} (kind ${kind}; edit the title, summary and board)`);
    }
  }
  out('next: `loopboard doctor`, then `loopboard build` and `loopboard serve`');
  return 0;
}

export function newStream(cfg, cwd, pos, flags) {
  const folder = pos[0] || die('usage: loopboard new <folder> --title T --kind K [--area A]');
  const dir = path.resolve(cwd, folder), file = path.join(dir, 'STATUS.md');
  if (fs.existsSync(file)) die(`${file} already exists; not overwriting it`);
  const kind = flags.kind || inferKind(dir);
  const title = flags.title || path.basename(dir);
  const text = renderTemplate(cfg, kind, { title, area: flags.area || cfg.areas[0] });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, text);
  out(`wrote ${file} (kind ${kind})`);
  return 0;
}

// ---------------------------------------------------------------- build / serve / open
export function buildCmd(cfg, flags) {
  const res = build(cfg, { write: !flags.check });
  out(formatReport(res));
  return flags.check && res.issues.length ? 1 : 0;
}

export async function serve(cfg, flags) {
  const port = flags.port !== undefined ? Number(flags.port) : cfg.port;
  if (!Number.isInteger(port) || port < 0 || port > 65535) { err('--port must be a number from 0 to 65535'); return 1; }
  try {
    const s = await startServer(cfg, { port });
    out(`Loopboard -> ${s.url}`);
    out(`roots: ${cfg.roots.join(', ')}  (Ctrl+C to stop)`);
    // pid file: lets `service remove` (Windows) stop this process; removed again on a clean exit
    const pidFile = path.join(cfg.dataDir, 'server.pid');
    try { fs.mkdirSync(cfg.dataDir, { recursive: true }); fs.writeFileSync(pidFile, String(process.pid) + '\n'); } catch (e) { err(`note: could not write ${pidFile}: ${e.message}`); }
    const cleanup = () => { try { if (fs.readFileSync(pidFile, 'utf8').trim() === String(process.pid)) fs.rmSync(pidFile, { force: true }); } catch { /* already gone */ } };
    process.on('exit', cleanup);
    for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => process.exit(0));
    await new Promise(() => { });
  } catch (e) {
    err(e.code === 'EADDRINUSE' ? `port ${port} is already in use (is a hub server already running? try \`loopboard open\`, or \`loopboard serve --port N\`)` : `cannot start the server: ${e.message}`);
    return 1;
  }
  return 0;
}

// true only when THIS hub (same data dir) answers on the port, not another server or another hub instance
const reachable = (port, cfg, timeout = 800) => new Promise(resolve => {
  const req = http.get({ host: '127.0.0.1', port, path: '/hub/', timeout }, res => { res.resume(); resolve(res.statusCode === 200 && res.headers['x-loopboard'] === instanceId(cfg)); });
  req.on('timeout', () => { req.destroy(); resolve(false); });
  req.on('error', () => resolve(false));
});

export async function openCmd(cfg, flags) {
  const port = flags.port !== undefined ? Number(flags.port) : cfg.port;
  const url = `http://localhost:${port}/hub/`;
  if (await reachable(port, cfg)) { await platform.openUrl(url); out(`opened ${url}`); return 0; }
  const page = path.join(cfg.dataDir, 'index.html');
  err(`no hub server answers on port ${port}. Start one with \`loopboard serve\` (or \`loopboard service install\`).`);
  if (fs.existsSync(page)) { await platform.openUrl(platform.pathToUrl(page)); out(`opened the built page read-only: ${page}`); return 0; }
  err('and nothing is built yet: run `loopboard build` first.');
  return 1;
}

// ---------------------------------------------------------------- list
export function list(cfg) {
  const { mode, streams } = discover(cfg);
  if (!streams.length) { out('no workstreams found. Create one with `loopboard new <folder> --title T --kind K` (or `loopboard init --single`).'); return 0; }
  const res = build(cfg, { write: false });
  const rows = res.streams.map(s => {
    const open = openComments(s.thread).length;
    return [s.id, s.health || '-', String(s.waiting.length), String(open), s.kind, s.phase || '', s.title];
  });
  const head = ['STREAM', 'HEALTH', 'WAITING', 'OPEN', 'KIND', 'PHASE', 'TITLE'];
  const w = head.map((h, i) => Math.max(h.length, ...rows.map(r => r[i].length)));
  const line = r => r.map((c, i) => c.padEnd(w[i])).join('  ').trimEnd();
  out(`${streams.length} workstream(s), mode ${mode}`);
  out(line(head)); for (const r of rows) out(line(r));
  return 0;
}

// ---------------------------------------------------------------- doctor
function findOnPath(cmd, env = process.env) {
  if (path.isAbsolute(cmd)) return fs.existsSync(cmd);
  const exts = process.platform === 'win32' ? (env.PATHEXT || '.EXE;.CMD;.BAT').split(';') : [''];
  for (const d of (env.PATH || env.Path || '').split(path.delimiter).filter(Boolean)) for (const e of exts) if (fs.existsSync(path.join(d, cmd + e.toLowerCase())) || fs.existsSync(path.join(d, cmd + e))) return true;
  return false;
}
const portFree = port => new Promise(resolve => {
  const s = net.createServer();
  s.once('error', e => resolve(e.code === 'EADDRINUSE' ? 'busy' : 'error'));
  s.listen(port, '127.0.0.1', () => s.close(() => resolve('free')));
});

export async function doctor(cwd, env = process.env) {
  const res = [];
  const add = (level, msg, fix) => res.push({ level, msg, fix });
  const major = Number(process.versions.node.split('.')[0]);
  major >= 18 ? add('ok', `Node ${process.versions.node}`) : add('fail', `Node ${process.versions.node} is too old`, 'install Node 18 or newer');
  let cfg = null;
  try { cfg = loadConfig({ cwd, env }); } catch (e) { add('fail', e.message, `fix or delete the config, or run \`loopboard init\` in an empty spot`); }
  if (cfg) {
    cfg.file ? add('ok', `config ${cfg.file}`) : add('warn', 'no loopboard.config.json found (defaults apply to the current folder)', 'run `loopboard init` (or `loopboard init --single` for one project)');
    for (const r of cfg.roots) fs.existsSync(r) && fs.statSync(r).isDirectory() ? add('ok', `root ${r}`) : add('fail', `root ${r} does not exist`, 'fix `roots` in loopboard.config.json');
    const d = discover(cfg);
    d.streams.length ? add('ok', `${d.streams.length} workstream(s), mode ${d.mode}`) : add('warn', 'no workstreams found (a STATUS.md needs `title` and `kind` frontmatter)', 'run `loopboard new <folder> --title T --kind K` or `loopboard init --single`');
    try {
      fs.mkdirSync(cfg.dataDir, { recursive: true });
      const probe = path.join(cfg.dataDir, '.write-test'); fs.writeFileSync(probe, 'x'); fs.rmSync(probe);
      add('ok', `data dir ${cfg.dataDir} is writable`);
    } catch (e) { add('fail', `data dir ${cfg.dataDir} is not writable: ${e.message}`, 'set LOOPBOARD_HOME to a writable folder'); }
    const pf = await portFree(cfg.port);
    pf === 'free' ? add('ok', `port ${cfg.port} is free`) : pf === 'busy' ? ((await reachable(cfg.port, cfg)) ? add('ok', `port ${cfg.port} is serving this hub`) : add('warn', `port ${cfg.port} is in use by something else (not this hub)`, 'change `port` in loopboard.config.json or stop that process')) : add('warn', `could not test port ${cfg.port}`);
    if (cfg.editor && cfg.editor !== 'none') findOnPath(cfg.editor, env) ? add('ok', `editor command \`${cfg.editor}\` found`) : add('warn', `editor command \`${cfg.editor}\` is not on PATH ("Open in editor" will not work)`, 'set `editor` in loopboard.config.json to a command you have, or "none"');
    cfg.guard ? add('ok', 'guard on (hooks only act when the loopboard plugin is enabled in Claude Code)') : add('warn', 'guard is off ("guard": false)');
    try {
      const b = build(cfg, { write: false });
      b.issues.length ? add('warn', `${b.issues.length} STATUS.md format issue(s):`) : add('ok', 'every STATUS.md follows the format');
      for (const i of b.issues) add('warn', `  ${i.file}: ${i.msg.replace(/`/g, '')}`);
      if (b.issues.length) res[res.length - 1].fix = 'edit the files above, then run `loopboard build --check`';
    } catch (e) { add('fail', 'build failed: ' + e.message); }
  }
  const tag = { ok: ' ok  ', warn: 'warn ', fail: 'FAIL ' };
  for (const r of res) { out(`${tag[r.level]} ${r.msg}`); if (r.fix && r.level !== 'ok') out(`       fix: ${r.fix}`); }
  return res.some(r => r.level === 'fail') ? 1 : 0;
}

// ---------------------------------------------------------------- skills
const plainTerm = s => String(s ?? '').replace(/[\u0000-\u001f\u007f-\u009f]/g, ' '); // skill text is untrusted: no terminal escape sequences
export function skills(cfg, flags = {}) {
  const cat = collectSkills(cfg, { bodies: false });
  const want = flags.role ? canonRole(flags.role).toLowerCase() : '';
  const items = cat.items.filter(k => !want || k.role.toLowerCase() === want);
  if (flags.json) {
    const rows = items.map(({ id, name, invocation, source, role, summary, description, hint, copy, file, dir, references, scripts, bodyTruncated }) =>
      ({ id, name, invocation, source, role, summary, description, hint, copy, file, dir, references: references.map(f => f.abs), scripts: scripts.map(f => f.abs), bodyTruncated }));
    out(JSON.stringify({ count: rows.length, capped: cat.capped, skills: rows }, null, 2));
    return 0;
  }
  if (flags.role && !items.length) { err(`no skills with role "${flags.role}". Roles here: ${cat.roles.map(r => r.role).join(', ') || 'none'}`); return 1; }
  const src = Object.entries(cat.sources).filter(([, n]) => n).map(([k, n]) => `${SOURCE_LABEL[k].toLowerCase()} ${n}`).join(', ');
  out(`${items.length} skill(s)${want ? ` with role ${canonRole(flags.role)}` : ''} (${src || 'none'})${cat.capped ? '; the catalog stops at 500 skills' : ''}${cat.userEnabled ? '' : '; user skills hidden (skills.user is false)'}`);
  for (const { role } of cat.roles) {
    const list = items.filter(k => k.role === role);
    if (!list.length) continue;
    out('');
    out(role);
    for (const k of list) {
      const call = plainTerm(k.copy);
      out(`  ${call}${k.source === 'plugin' ? '' : `  [${k.sourceLabel.toLowerCase()}]`}`);
      if (k.summary) out(`      ${plainTerm(k.summary)}`);
    }
  }
  out('');
  out('The page shows the same catalog with the full "when to use" text: Skills in the sidebar (#skills).');
  return 0;
}

// ---------------------------------------------------------------- service
function serviceOpts(cfg) {
  const env = {};
  if (cfg.file) env.LOOPBOARD_CONFIG = cfg.file;
  if (cfg.env?.LOOPBOARD_HOME) env.LOOPBOARD_HOME = path.resolve(cfg.env.LOOPBOARD_HOME);
  return { platform: process.platform, home: os.homedir(), data: cfg.dataDir, port: cfg.port, node: process.execPath, script: BIN, cwd: cfg.file ? cfg.base : process.cwd(), env };
}
export async function service(cfg, action) {
  if (action === 'install') {
    if (!cfg.file) err('note: no loopboard.config.json found; the service will serve the current folder with default settings.');
    const r = platform.serviceInstall(serviceOpts(cfg));
    out(`unit file: ${r.spec.unitPath}`);
    for (const s of r.log) out(`${s.ok ? ' ok ' : s.optional ? 'skip' : 'FAIL'} ${s.cmd} ${s.args.join(' ')}${s.ok ? '' : '  ' + s.stderr}`);
    out(r.ok ? `service installed; hub at http://localhost:${cfg.port}/hub/  (log: ${r.spec.log})` : 'service install failed (see above)');
    return r.ok ? 0 : 1;
  }
  if (action === 'remove') {
    const r = platform.serviceRemove(serviceOpts(cfg));
    for (const s of r.log) out(`${s.ok ? ' ok ' : s.optional ? 'skip' : 'FAIL'} ${s.cmd} ${s.args.join(' ')}${s.ok ? '' : '  ' + s.stderr}`);
    out(r.ok ? 'service removed' : 'service removal reported errors (see above)');
    return r.ok ? 0 : 1;
  }
  if (action === 'status') {
    const r = await platform.serviceStatus(serviceOpts(cfg), { probe: () => reachable(cfg.port, cfg) });
    out(r.installed ? (r.running ? `installed and running (${r.detail})` : `installed, not running (${r.detail})`) : `not installed (${r.detail})`);
    return 0;
  }
  err('usage: loopboard service install|remove|status');
  return 1;
}

export { HubError, BUILTIN_KINDS, HEALTH, readThread, relTo };
