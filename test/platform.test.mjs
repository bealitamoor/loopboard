import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import * as P from '../engine/platform.mjs';
import { tmp, cleanup } from './_helpers.mjs';

// a fake spawn that records its calls and "spawns" successfully
const fakeSpawn = () => {
  const calls = [];
  const spawn = (cmd, args, options) => { calls.push({ cmd, args, options }); const c = new EventEmitter(); c.unref = () => { }; process.nextTick(() => c.emit('spawn')); return c; };
  return { calls, spawn };
};

test('reveal picks the right command on each OS', () => {
  assert.deepEqual(P.revealCommand('/a/b.txt', 'darwin'), { cmd: 'open', args: ['-R', '/a/b.txt'] });
  assert.deepEqual(P.revealCommand('C:\\a\\b.txt', 'win32'), { cmd: 'explorer.exe', args: ['/select,C:\\a\\b.txt'] });
  assert.deepEqual(P.revealCommand('/a/b.txt', 'linux', false), { cmd: 'xdg-open', args: ['/a'] });
  assert.deepEqual(P.revealCommand('/a/dir', 'linux', true), { cmd: 'xdg-open', args: ['/a/dir'] });
});

test('open URL picks the right command on each OS', () => {
  assert.deepEqual(P.openUrlCommand('http://localhost:4747/hub/', 'darwin'), { cmd: 'open', args: ['http://localhost:4747/hub/'] });
  assert.deepEqual(P.openUrlCommand('http://localhost:4747/hub/', 'linux'), { cmd: 'xdg-open', args: ['http://localhost:4747/hub/'] });
  const w = P.openUrlCommand('http://localhost:4747/hub/', 'win32');
  assert.equal(w.cmd, 'cmd');
  assert.deepEqual(w.args.slice(0, 3), ['/d', '/s', '/c']);
  assert.equal(w.args[3], 'start "" "http://localhost:4747/hub/"');
  assert.equal(w.options.windowsVerbatimArguments, true);
  assert.throws(() => P.openUrlCommand('http://x/" & calc & "', 'win32'), /refusing/);
});

test('editor commands: -g for known editors, plain path otherwise, none disables', () => {
  assert.deepEqual(P.editorCommand('code', '/p/f.md', 'linux'), { cmd: 'code', args: ['-g', '/p/f.md'] });
  assert.deepEqual(P.editorCommand('cursor', '/p/f.md', 'darwin'), { cmd: 'cursor', args: ['-g', '/p/f.md'] });
  assert.deepEqual(P.editorCommand('zed', '/p/f.md', 'linux'), { cmd: 'zed', args: ['/p/f.md'] });
  assert.deepEqual(P.editorCommand('subl', '/p/f.md', 'darwin'), { cmd: 'subl', args: ['/p/f.md'] });
  assert.equal(P.editorCommand('none', '/p', 'linux'), null);
  assert.equal(P.editorCommand('', '/p', 'linux'), null);
  const w = P.editorCommand('code', 'C:\\My Docs\\f.md', 'win32');
  assert.equal(w.cmd, 'cmd');
  assert.equal(w.args[3], '""code" "-g" "C:\\My Docs\\f.md""');
  assert.throws(() => P.editorCommand('code', 'C:\\x"&calc&"\\f.md', 'win32'), /refusing/);
});

test('user paths are passed as one argument each, never through a shell', async () => {
  const f = fakeSpawn();
  const nasty = '/tmp/a b; rm -rf ~ $(touch x) `id`/file.md';
  await P.openInEditor(nasty, 'code', { spawn: f.spawn, platform: 'linux' });
  assert.deepEqual(f.calls[0].args, ['-g', nasty]);
  assert.equal(f.calls[0].cmd, 'code');
  assert.ok(!('shell' in f.calls[0].options));
  await P.reveal(nasty, { spawn: f.spawn, platform: 'darwin' });
  assert.deepEqual(f.calls[1], { cmd: 'open', args: ['-R', nasty], options: f.calls[1].options });
});

test('openInEditor with no editor reveals files and opens folders; openUrl rejects other schemes', async () => {
  const f = fakeSpawn(), dir = tmp();
  fs.writeFileSync(path.join(dir, 'x.sh'), '');
  await P.openInEditor(path.join(dir, 'x.sh'), 'none', { spawn: f.spawn, platform: 'darwin' });
  assert.equal(f.calls[0].cmd, 'open');
  assert.equal(f.calls[0].args[0], '-R', 'a file is revealed, never opened');
  await P.openInEditor(dir, 'none', { spawn: f.spawn, platform: 'darwin' });
  assert.equal(f.calls[1].args[0].startsWith('file://'), true);
  await assert.rejects(P.openUrl('javascript:alert(1)', { spawn: f.spawn }), /only http/);
  await assert.rejects(P.openUrl('ms-settings:privacy', { spawn: f.spawn }), /only http/);
  cleanup(dir);
});

test('a failed spawn rejects', async () => {
  const spawn = () => { const c = new EventEmitter(); c.unref = () => { }; process.nextTick(() => c.emit('error', new Error('ENOENT'))); return c; };
  await assert.rejects(P.run({ cmd: 'nope', args: [] }, { spawn }), /ENOENT/);
});

test('file URLs', () => {
  assert.equal(P.pathToUrl('/a b/c#d.md', 'linux'), 'file:///a%20b/c%23d.md');
  assert.equal(P.pathToUrl('C:\\a b\\c.md', 'win32'), 'file:///C:/a%20b/c.md');
});

const SVC = { data: '/d/loopboard', node: '/usr/bin/node', script: '/p/bin/loopboard.mjs', cwd: '/w', env: { LOOPBOARD_CONFIG: '/w/loopboard.config.json' }, home: '/h', uid: 501 };

test('service on macOS: launchd plist, bootstrap and bootout commands', () => {
  const s = P.serviceSpec({ ...SVC, platform: 'darwin' });
  assert.equal(s.unitPath, '/d/loopboard/service/com.loopboard.server.plist');
  assert.equal(s.registerPath, '/h/Library/LaunchAgents/com.loopboard.server.plist');
  assert.match(s.text, /<key>Label<\/key><string>com\.loopboard\.server<\/string>/);
  assert.match(s.text, /<string>\/usr\/bin\/node<\/string><string>\/p\/bin\/loopboard\.mjs<\/string><string>serve<\/string>/);
  assert.match(s.text, /<key>RunAtLoad<\/key><true\/>/);
  assert.match(s.text, /<key>LOOPBOARD_CONFIG<\/key><string>\/w\/loopboard\.config\.json<\/string>/);
  assert.match(s.text, /StandardOutPath<\/key><string>\/d\/loopboard\/logs\/server\.log/);
  assert.deepEqual(s.install.map(c => [c.cmd, ...c.args]), [['launchctl', 'bootout', 'gui/501/com.loopboard.server'], ['launchctl', 'bootstrap', 'gui/501', s.registerPath]]);
  assert.deepEqual(s.status, { cmd: 'launchctl', args: ['print', 'gui/501/com.loopboard.server'] });
});

const WIN = { ...SVC, platform: 'win32', home: 'C:\\Users\\Me', appData: 'C:\\Users\\Me\\AppData\\Roaming', data: 'C:\\Users\\Me\\AppData\\Roaming\\loopboard', node: 'C:\\Program Files\\nodejs\\node.exe', script: 'C:\\p q\\bin\\loopboard.mjs', cwd: 'C:\\w', env: { LOOPBOARD_CONFIG: 'C:\\w\\loopboard.config.json' }, port: 4831 };

test('service on Windows: restart-loop .cmd in the data dir, hidden .vbs in the Startup folder, no schtasks', () => {
  const s = P.serviceSpec(WIN);
  const d = 'C:\\Users\\Me\\AppData\\Roaming\\loopboard';
  assert.equal(s.unitPath, d + '\\loopboard-run.cmd');
  assert.equal(s.registerPath, 'C:\\Users\\Me\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\loopboard.vbs');
  assert.equal(s.log, d + '\\server.log');
  assert.equal(s.pidFile, d + '\\server.pid');
  assert.equal(s.stopFlag, d + '\\stop.flag');
  assert.deepEqual(s.text.split('\r\n'), [
    '@echo off', 'cd /d "C:\\w"', 'set "LOOPBOARD_CONFIG=C:\\w\\loopboard.config.json"',
    ':loop', `if exist "${d}\\stop.flag" goto end`,
    `"C:\\Program Files\\nodejs\\node.exe" "C:\\p q\\bin\\loopboard.mjs" serve >> "${d}\\server.log" 2>&1`,
    'timeout /t 5 /nobreak >nul', 'goto loop', ':end', '']);
  assert.equal(s.registerText, `CreateObject("WScript.Shell").Run """${d}\\loopboard-run.cmd""", 0, False\r\n`);
  assert.deepEqual(s.install, [{ cmd: 'wscript.exe', args: [s.registerPath] }]);
  assert.ok(!JSON.stringify(s).includes('schtasks'));
  assert.equal(s.status, null);
});

test('Windows .cmd and .vbs text: quoting, spaces, percent signs, refused values', () => {
  const vbs = P.windowsVbsText('C:\\My Data\\loopboard-run.cmd');
  assert.equal(vbs, 'CreateObject("WScript.Shell").Run """C:\\My Data\\loopboard-run.cmd""", 0, False\r\n');
  assert.equal(P.windowsVbsText('C:\\a"b\\x.cmd'), 'CreateObject("WScript.Shell").Run """C:\\a""b\\x.cmd""", 0, False\r\n', 'a quote is doubled for VBS');
  assert.throws(() => P.windowsVbsText('C:\\a\nb\\x.cmd'), /refusing/);
  assert.throws(() => P.windowsVbsText('C:\\a\rb\\x.cmd'), /refusing/);
  const base = { node: 'n', script: 's', cwd: 'c', env: {}, log: 'l', stopFlag: 'f' };
  assert.match(P.windowsRunText({ ...base, cwd: 'C:\\100%\\w' }), /cd \/d "C:\\100%%\\w"/);
  assert.throws(() => P.windowsRunText({ ...base, script: 'a\nb' }), /refusing/);
  assert.throws(() => P.windowsRunText({ ...base, node: 'x"y' }), /refusing/);
  assert.throws(() => P.serviceSpec({ ...WIN, data: 'C:\\bad\nname' }), /refusing/);
});

// an in-memory fs with just the calls the Windows service code makes
const memFs = (files = {}) => {
  const calls = [];
  return {
    files, calls,
    mkdirSync: d => calls.push(['mkdir', d]),
    writeFileSync: (f, t) => { calls.push(['write', f]); files[f] = t; },
    readFileSync: f => { if (!(f in files)) throw new Error('ENOENT'); return files[f]; },
    rmSync: f => { calls.push(['rm', f]); delete files[f]; },
    existsSync: f => f in files,
    copyFileSync: () => { throw new Error('not used on Windows'); },
  };
};

test('Windows install: writes the .cmd and the .vbs, clears stop.flag, then starts it with wscript.exe', () => {
  const s = P.serviceSpec(WIN);
  const f = memFs({ [s.stopFlag]: 'stop\n' });
  const ran = [];
  const r = P.serviceInstall(WIN, { fs: f, spawnSync: (cmd, args) => { ran.push([cmd, ...args]); return { status: 0, stdout: '', stderr: '' }; } });
  assert.equal(r.ok, true);
  assert.equal(f.files[s.unitPath], s.text);
  assert.equal(f.files[s.registerPath], s.registerText);
  assert.ok(!(s.stopFlag in f.files), 'a stale stop.flag is deleted');
  assert.deepEqual(ran, [['wscript.exe', s.registerPath]]);
});

test('Windows remove: writes stop.flag, kills the pid from server.pid, deletes the .vbs, keeps the logs and the .cmd', () => {
  const s = P.serviceSpec(WIN);
  const f = memFs({ [s.pidFile]: '4242\n', [s.registerPath]: 'x', [s.unitPath]: 'y', [s.log]: 'log' });
  const ran = [];
  const r = P.serviceRemove(WIN, { fs: f, spawnSync: (cmd, args) => { ran.push([cmd, ...args]); return { status: 0, stdout: '', stderr: '' }; } });
  assert.equal(r.ok, true);
  assert.deepEqual(ran, [['taskkill', '/PID', '4242', '/F']]);
  assert.ok(s.stopFlag in f.files, 'stop.flag stays so the loop ends');
  assert.ok(!(s.registerPath in f.files));
  assert.ok(s.log in f.files, 'logs are kept');
  assert.ok(s.unitPath in f.files, 'the running loop file is not pulled out from under cmd.exe');
  // no pid file, or junk in it: nothing is killed, remove still succeeds
  for (const pidText of [null, 'not a pid; calc']) {
    const g = memFs(pidText === null ? {} : { [s.pidFile]: pidText });
    const ran2 = [];
    const r2 = P.serviceRemove(WIN, { fs: g, spawnSync: (c, a) => { ran2.push([c, ...a]); return { status: 0 }; } });
    assert.equal(r2.ok, true);
    assert.deepEqual(ran2, []);
  }
  // a failed taskkill (process already gone) is optional
  const h = memFs({ [s.pidFile]: '7' });
  assert.equal(P.serviceRemove(WIN, { fs: h, spawnSync: () => ({ status: 128, stderr: 'not found' }) }).ok, true);
});

test('Windows status: Startup file present + this instance answers on the port', async () => {
  const s = P.serviceSpec(WIN);
  const never = () => { throw new Error('no commands run for status on Windows'); };
  const probed = [];
  const up = await P.serviceStatus(WIN, { fs: memFs({ [s.registerPath]: 'x' }), spawnSync: never, probe: () => { probed.push(1); return true; } });
  assert.equal(up.installed, true);
  assert.equal(up.running, true);
  assert.match(up.detail, /Startup file present.*answers on port 4831/);
  assert.equal(probed.length, 1);
  const down = await P.serviceStatus(WIN, { fs: memFs({ [s.registerPath]: 'x' }), spawnSync: never, probe: async () => false });
  assert.deepEqual([down.installed, down.running], [true, false]);
  const none = await P.serviceStatus(WIN, { fs: memFs(), spawnSync: never, probe: async () => { throw new Error('refused'); } });
  assert.deepEqual([none.installed, none.running], [false, false]);
  assert.match(none.detail, /missing/);
});

test('service on Linux: systemd --user unit, link + enable --now', () => {
  const s = P.serviceSpec({ ...SVC, platform: 'linux', cwd: '/w with space' });
  assert.equal(s.unitPath, '/d/loopboard/service/loopboard.service');
  assert.match(s.text, /ExecStart="\/usr\/bin\/node" "\/p\/bin\/loopboard\.mjs" serve/);
  assert.match(s.text, /WorkingDirectory="\/w with space"/);
  assert.match(s.text, /Environment="LOOPBOARD_CONFIG=\/w\/loopboard\.config\.json"/);
  assert.match(s.text, /WantedBy=default\.target/);
  assert.deepEqual(s.install.map(c => c.args.join(' ')), [`--user link ${s.unitPath}`, '--user daemon-reload', '--user enable --now loopboard.service']);
  assert.deepEqual(s.remove[0].args, ['--user', 'disable', '--now', 'loopboard.service']);
  assert.deepEqual(s.status.args, ['--user', 'is-active', 'loopboard.service']);
});

test('unit files escape their values', () => {
  const plist = P.plistText({ node: '/n', script: '/s & <x>', cwd: '/c', env: {}, log: '/l' });
  assert.match(plist, /\/s &amp; &lt;x&gt;/);
  const unit = P.systemdUnitText({ node: '/n', script: '/100%/s', cwd: '/c', env: {} });
  assert.match(unit, /"\/100%%\/s"/);
  assert.throws(() => P.windowsRunText({ node: 'n', script: 's"x', cwd: 'c', env: {}, log: 'l', stopFlag: 'f' }), /refusing/);
});

test('install / remove / status run the chosen commands (mock spawnSync, temp dirs, no real registration)', { skip: process.platform === 'win32' && 'macOS unit paths are posix-style' }, async () => {
  const data = tmp(), home = tmp();
  const ran = [];
  const spawnSync = (cmd, args) => { ran.push([cmd, ...args]); return { status: 0, stdout: 'active\n', stderr: '' }; };
  const opts = { ...SVC, platform: 'darwin', data, home, uid: 7 };
  const r = P.serviceInstall(opts, { spawnSync });
  assert.equal(r.ok, true);
  assert.ok(fs.existsSync(r.spec.unitPath), 'plist generated into the data dir');
  assert.ok(fs.existsSync(r.spec.registerPath), 'and copied into LaunchAgents (the temp home)');
  assert.deepEqual(ran, [['launchctl', 'bootout', 'gui/7/com.loopboard.server'], ['launchctl', 'bootstrap', 'gui/7', r.spec.registerPath]]);
  const st = await P.serviceStatus(opts, { spawnSync });
  assert.equal(st.installed, true);
  assert.equal(st.running, true);
  const rm = P.serviceRemove(opts, { spawnSync });
  assert.equal(rm.ok, true);
  assert.ok(!fs.existsSync(r.spec.unitPath) && !fs.existsSync(r.spec.registerPath));
  cleanup(data, home);
});

test('a failing required step stops the install; optional steps may fail', { skip: process.platform === 'win32' && 'macOS unit paths are posix-style' }, async () => {
  const data = tmp();
  const spawnSync = (cmd, args) => ({ status: args[0] === 'bootout' ? 3 : 1, stdout: '', stderr: 'boom' });
  const r = P.serviceInstall({ ...SVC, platform: 'darwin', data, home: tmp(), uid: 1 }, { spawnSync });
  assert.equal(r.ok, false);
  assert.equal(r.log.length, 2);
  assert.equal(r.log[0].ok, false);
  assert.equal(r.log[0].optional, true);
  const linux = await P.serviceStatus({ ...SVC, platform: 'linux' }, { spawnSync: () => ({ status: 3, stdout: 'inactive\n', stderr: '' }) });
  assert.equal(linux.installed, true);
  assert.equal(linux.running, false);
  cleanup(data);
});
