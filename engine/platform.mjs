// OS layer: data dir, reveal / open URL / open in editor, and background-mode install for launchd (macOS), a Startup-folder
// launcher with a restart loop (Windows, no admin) and systemd --user (Linux). Everything that runs a program uses spawn with an argument array, never a shell string built from
// user paths. The command builders are pure (and take the platform as a parameter) so every OS branch is unit-tested
// on any machine; the run helpers take an injectable spawn / spawnSync.
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { spawn as nodeSpawn, spawnSync as nodeSpawnSync } from 'node:child_process';

export const SERVICE_NAME = 'loopboard';
export const SERVICE_LABEL = 'com.loopboard.server';

const flavor = platform => (platform === 'win32' ? path.win32 : path.posix);

// ---------------------------------------------------------------- data dir
// $LOOPBOARD_HOME > ${CLAUDE_PLUGIN_DATA} > OS default. Holds the generated page, the token, logs, guard state.
export function dataDir({ env = process.env, platform = process.platform, home = os.homedir() } = {}) {
  if (env.LOOPBOARD_HOME) return path.resolve(env.LOOPBOARD_HOME);
  if (env.CLAUDE_PLUGIN_DATA) return path.resolve(env.CLAUDE_PLUGIN_DATA);
  const p = flavor(platform);
  if (platform === 'darwin') return p.join(home, 'Library', 'Application Support', 'loopboard');
  if (platform === 'win32') return p.join(env.APPDATA || p.join(home, 'AppData', 'Roaming'), 'loopboard');
  return p.join(env.XDG_DATA_HOME || p.join(home, '.local', 'share'), 'loopboard');
}

// ---------------------------------------------------------------- command builders (pure)
// cmd.exe is only reached for `start` and for editor shims (.cmd). Values are placed inside double quotes, so the only
// characters that can break out are the quote itself, line breaks and %VAR% expansion; refuse those.
function cmdSafe(v) {
  const s = String(v);
  if (/["\r\n\0]/.test(s)) throw new Error('refusing a value with quotes or line breaks for cmd.exe: ' + JSON.stringify(s.slice(0, 60)));
  return s;
}

export function revealCommand(target, platform = process.platform, isDir = false) {
  if (platform === 'darwin') return { cmd: 'open', args: ['-R', target] };
  if (platform === 'win32') return { cmd: 'explorer.exe', args: ['/select,' + target] };
  return { cmd: 'xdg-open', args: [isDir ? target : path.posix.dirname(target)] };
}

export function openUrlCommand(url, platform = process.platform) {
  if (platform === 'darwin') return { cmd: 'open', args: [url] };
  if (platform === 'win32') {
    return { cmd: 'cmd', args: ['/d', '/s', '/c', `start "" "${cmdSafe(url)}"`], options: { windowsVerbatimArguments: true } };
  }
  return { cmd: 'xdg-open', args: [url] };
}

// editors that understand `-g <path>`; anything else gets just the path
const GOTO = new Set(['code', 'code-insiders', 'cursor', 'windsurf', 'codium', 'vscodium']);
export function editorCommand(editor, target, platform = process.platform) {
  if (!editor || editor === 'none') return null;
  const base = path.basename(String(editor)).replace(/\.(cmd|exe|bat)$/i, '').toLowerCase();
  const args = [...(GOTO.has(base) ? ['-g'] : []), target];
  if (platform === 'win32') { // editor CLIs are .cmd shims on Windows, which need cmd.exe
    const q = v => `"${cmdSafe(v)}"`;
    return { cmd: 'cmd', args: ['/d', '/s', '/c', `"${[editor, ...args].map(q).join(' ')}"`], options: { windowsVerbatimArguments: true } };
  }
  return { cmd: editor, args };
}

// ---------------------------------------------------------------- running
export function run(command, { spawn = nodeSpawn } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command.cmd, command.args, { stdio: 'ignore', detached: true, windowsHide: true, ...(command.options || {}) });
    child.once('error', reject);
    child.once('spawn', () => { try { child.unref?.(); } catch { /* ignore */ } resolve({ ok: true, command }); });
  });
}

const isDir = p => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };

export function reveal(target, deps = {}) {
  const platform = deps.platform || process.platform;
  return run(revealCommand(target, platform, isDir(target)), deps);
}
export function openUrl(url, deps = {}) {
  if (!/^(https?|file):/i.test(url)) return Promise.reject(new Error('only http, https and file URLs can be opened'));
  return run(openUrlCommand(url, deps.platform || process.platform), deps);
}
// Opens the editor; if there is none, a folder goes to the file manager and a file is revealed (never "opened" by
// the OS, which could execute it).
export async function openInEditor(target, editor, deps = {}) {
  const platform = deps.platform || process.platform;
  const cmd = editorCommand(editor, target, platform);
  if (cmd) return run(cmd, deps);
  if (isDir(target)) return openUrl(pathToUrl(target, platform), deps);
  return reveal(target, deps);
}
export function pathToUrl(p, platform = process.platform) {
  const norm = platform === 'win32' ? '/' + p.replace(/\\/g, '/') : p;
  return 'file://' + encodeURI(norm).replace(/[?#]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

// ---------------------------------------------------------------- service
const xml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const sdq = s => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/%/g, '%%') + '"';

export function plistText({ node, script, cwd, env = {}, log }) {
  const envXml = Object.entries(env).map(([k, v]) => `<key>${xml(k)}</key><string>${xml(v)}</string>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${SERVICE_LABEL}</string>
  <key>ProgramArguments</key><array><string>${xml(node)}</string><string>${xml(script)}</string><string>serve</string></array>
  <key>WorkingDirectory</key><string>${xml(cwd)}</string>
  <key>EnvironmentVariables</key><dict>${envXml}</dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${xml(log)}</string>
  <key>StandardErrorPath</key><string>${xml(log)}</string>
</dict></plist>
`;
}

export function systemdUnitText({ node, script, cwd, env = {} }) {
  const envLines = Object.entries(env).map(([k, v]) => `Environment=${sdq(`${k}=${v}`)}`).join('\n');
  return `[Unit]
Description=Loopboard local dashboard server
After=network.target

[Service]
ExecStart=${sdq(node)} ${sdq(script)} serve
WorkingDirectory=${sdq(cwd)}
${envLines}
Restart=on-failure
RestartSec=3

[Install]
WantedBy=default.target
`;
}

// Windows: a restart loop. It exits when `stop.flag` exists (written by `service remove`). Values go inside double
// quotes; cmdSafe refuses quotes and line breaks.
export function windowsRunText({ node, script, cwd, env = {}, log, stopFlag }) {
  const q = v => cmdSafe(v).replace(/%/g, '%%'); // in a .cmd file a literal % is written %%
  const lines = ['@echo off', `cd /d "${q(cwd)}"`];
  for (const [k, v] of Object.entries(env)) lines.push(`set "${q(k)}=${q(v)}"`);
  lines.push(':loop', `if exist "${q(stopFlag)}" goto end`, `"${q(node)}" "${q(script)}" serve >> "${q(log)}" 2>&1`, 'timeout /t 5 /nobreak >nul', 'goto loop', ':end');
  return lines.join('\r\n') + '\r\n';
}

// Windows: the Startup-folder script that runs the .cmd with no visible window (window style 0, do not wait).
// VBScript escapes a quote by doubling it; a line break would end the statement, so refuse it.
export function windowsVbsText(cmdPath) {
  const s = String(cmdPath);
  if (/[\r\n\0]/.test(s)) throw new Error('refusing a path with line breaks for the Startup script: ' + JSON.stringify(s.slice(0, 60)));
  return `CreateObject("WScript.Shell").Run """${s.replace(/"/g, '""')}""", 0, False\r\n`;
}

// Everything the service commands need, as data: the unit text, where it goes, and the commands to run.
export function serviceSpec({ platform = process.platform, home = os.homedir(), data, node = process.execPath, script, cwd, env = {}, uid = process.getuid?.() ?? 0, appData = process.env.APPDATA, pid, port }) {
  const p = flavor(platform);
  const dir = p.join(data, 'service');
  const log = p.join(data, 'logs', 'server.log');
  const base = { platform, dir, log };
  if (platform === 'darwin') {
    const unitPath = p.join(dir, SERVICE_LABEL + '.plist');
    const registerPath = p.join(home, 'Library', 'LaunchAgents', SERVICE_LABEL + '.plist');
    const target = `gui/${uid}/${SERVICE_LABEL}`;
    return { ...base, unitPath, registerPath, text: plistText({ node, script, cwd, env: { PATH: `${p.dirname(node)}:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin`, ...env }, log }),
      install: [{ cmd: 'launchctl', args: ['bootout', target], optional: true }, { cmd: 'launchctl', args: ['bootstrap', `gui/${uid}`, registerPath] }],
      remove: [{ cmd: 'launchctl', args: ['bootout', target], optional: true }],
      status: { cmd: 'launchctl', args: ['print', target] }, files: [unitPath, registerPath] };
  }
  if (platform === 'win32') {
    // No admin rights and no visible window: <data>\\loopboard-run.cmd is a restart loop, started at logon by a
    // hidden .vbs in the Startup folder. `stop.flag` ends the loop; `server.pid` (written by `serve`) lets remove kill the server.
    const unitPath = p.join(data, 'loopboard-run.cmd');
    const logFile = p.join(data, 'server.log');
    const pidFile = p.join(data, 'server.pid');
    const stopFlag = p.join(data, 'stop.flag');
    const registerPath = p.join(appData || p.join(home, 'AppData', 'Roaming'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'loopboard.vbs');
    const kill = /^\d+$/.test(String(pid ?? '')) ? [{ cmd: 'taskkill', args: ['/PID', String(pid), '/F'], optional: true }] : [];
    return { platform, dir: data, log: logFile, unitPath, registerPath, pidFile, stopFlag, port,
      text: windowsRunText({ node, script, cwd, env, log: logFile, stopFlag }), registerText: windowsVbsText(unitPath),
      install: [{ cmd: 'wscript.exe', args: [registerPath] }],
      remove: kill,
      status: null, files: [registerPath, pidFile] };
  }
  const unitPath = p.join(dir, SERVICE_NAME + '.service');
  const unit = SERVICE_NAME + '.service';
  return { ...base, unitPath, text: systemdUnitText({ node, script, cwd, env }),
    install: [{ cmd: 'systemctl', args: ['--user', 'link', unitPath], optional: true }, { cmd: 'systemctl', args: ['--user', 'daemon-reload'] }, { cmd: 'systemctl', args: ['--user', 'enable', '--now', unit] }],
    remove: [{ cmd: 'systemctl', args: ['--user', 'disable', '--now', unit] }, { cmd: 'systemctl', args: ['--user', 'daemon-reload'], optional: true }],
    status: { cmd: 'systemctl', args: ['--user', 'is-active', unit] }, files: [unitPath] };
}

function runSteps(steps, spawnSync) {
  const log = [];
  for (const s of steps) {
    const r = spawnSync(s.cmd, s.args, { encoding: 'utf8', windowsHide: true });
    const ok = !r.error && r.status === 0;
    log.push({ ...s, ok, stderr: String(r.stderr || r.error?.message || '').trim() });
    if (!ok && !s.optional) return { ok: false, log };
  }
  return { ok: true, log };
}

export function serviceInstall(opts, { fs: f = fs, spawnSync = nodeSpawnSync } = {}) {
  const spec = serviceSpec(opts);
  const p = flavor(spec.platform);
  f.mkdirSync(spec.dir, { recursive: true });
  f.mkdirSync(p.dirname(spec.log), { recursive: true });
  f.writeFileSync(spec.unitPath, spec.text);
  if (spec.registerPath) {
    f.mkdirSync(p.dirname(spec.registerPath), { recursive: true });
    if (spec.registerText !== undefined) f.writeFileSync(spec.registerPath, spec.registerText); else f.copyFileSync(spec.unitPath, spec.registerPath);
  }
  if (spec.stopFlag) f.rmSync(spec.stopFlag, { force: true });
  return { spec, ...runSteps(spec.install, spawnSync) };
}
export function serviceRemove(opts, { fs: f = fs, spawnSync = nodeSpawnSync } = {}) {
  let spec = serviceSpec(opts);
  if (spec.stopFlag) { // Windows: stop the restart loop first, then kill the running server (its pid is in server.pid)
    f.mkdirSync(spec.dir, { recursive: true });
    f.writeFileSync(spec.stopFlag, 'stop\n');
    let pid; try { pid = String(f.readFileSync(spec.pidFile, 'utf8')).trim(); } catch { /* no pid file: nothing to kill */ }
    spec = serviceSpec({ ...opts, pid });
  }
  const res = runSteps(spec.remove, spawnSync);
  for (const file of spec.files) { try { f.rmSync(file, { force: true }); } catch { /* ignore */ } }
  return { spec, ...res };
}
// Async: on Windows it also asks the port (injectable `probe`, true only when THIS instance answers).
export async function serviceStatus(opts, { fs: f = fs, spawnSync = nodeSpawnSync, probe } = {}) {
  const spec = serviceSpec(opts);
  if (!spec.status) { // Windows: no service manager, just the Startup file and the identity check on the port
    const installed = f.existsSync(spec.registerPath);
    let running = false;
    try { running = probe ? !!(await probe()) : false; } catch { /* not reachable */ }
    return { spec, installed, running, detail: `Startup file ${installed ? 'present' : 'missing'}; this instance ${running ? 'answers' : 'does not answer'} on port ${spec.port ?? '?'}` };
  }
  const r = spawnSync(spec.status.cmd, spec.status.args, { encoding: 'utf8', windowsHide: true });
  const out = String(r.stdout || '').trim();
  const installed = !r.error && (r.status === 0 || (spec.platform === 'linux' && /^(inactive|failed|activating)$/.test(out)));
  return { spec, installed, running: !r.error && r.status === 0, detail: out.split('\n')[0] || String(r.stderr || r.error?.message || '').trim().split('\n')[0] };
}
