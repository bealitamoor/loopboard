import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { findConfigFile, loadConfig, normalize, DEFAULTS } from '../engine/config.mjs';
import { dataDir } from '../engine/platform.mjs';
import { HubError } from '../engine/lib.mjs';
import { tmp, writeFiles, cleanup } from './_helpers.mjs';

test('config is found by walking up from a nested folder', () => {
  const dir = tmp(), data = tmp();
  writeFiles(dir, { 'loopboard.config.json': '{"port": 4801}', 'a/b/c/x.txt': '' });
  const cfg = loadConfig({ cwd: path.join(dir, 'a', 'b', 'c'), env: { LOOPBOARD_HOME: data } });
  assert.equal(cfg.file, path.join(dir, 'loopboard.config.json'));
  assert.equal(cfg.port, 4801);
  assert.deepEqual(cfg.roots, [dir]);
  cleanup(dir, data);
});

test('discovery order: walk-up beats $LOOPBOARD_CONFIG beats the data dir', () => {
  const ws = tmp(), other = tmp(), data = tmp(), elsewhere = tmp();
  writeFiles(ws, { 'loopboard.config.json': '{"port": 1111}' });
  writeFiles(other, { 'custom.json': '{"port": 2222}' });
  writeFiles(data, { 'loopboard.config.json': '{"port": 3333}' });
  const env = { LOOPBOARD_HOME: data, LOOPBOARD_CONFIG: path.join(other, 'custom.json') };
  assert.equal(loadConfig({ cwd: ws, env }).port, 1111);
  assert.equal(loadConfig({ cwd: elsewhere, env }).port, 2222);
  assert.equal(loadConfig({ cwd: elsewhere, env: { LOOPBOARD_HOME: data } }).port, 3333);
  assert.equal(findConfigFile({ cwd: elsewhere, env: { LOOPBOARD_HOME: tmp() } }), null);
  cleanup(ws, other, data, elsewhere);
});

test('no config at all: defaults apply to the current folder', () => {
  const dir = tmp(), data = tmp();
  const cfg = loadConfig({ cwd: dir, env: { LOOPBOARD_HOME: data } });
  assert.equal(cfg.file, null);
  assert.deepEqual(cfg.roots, [dir]);
  assert.equal(cfg.mode, 'auto');
  assert.equal(cfg.port, DEFAULTS.port);
  assert.equal(cfg.dataDir, data);
  cleanup(dir, data);
});

test('roots are resolved relative to the config file', () => {
  const dir = tmp(), data = tmp();
  writeFiles(dir, { 'loopboard.config.json': '{"roots": ["work", "../sibling"]}' });
  const cfg = loadConfig({ cwd: dir, env: { LOOPBOARD_HOME: data } });
  assert.deepEqual(cfg.roots, [path.join(dir, 'work'), path.resolve(dir, '../sibling')]);
  cleanup(dir, data);
});

test('invalid JSON and invalid values are reported, not swallowed', () => {
  const dir = tmp(), data = tmp();
  writeFiles(dir, { 'loopboard.config.json': '{ nope' });
  assert.throws(() => loadConfig({ cwd: dir, env: { LOOPBOARD_HOME: data } }), HubError);
  assert.throws(() => normalize({ port: 'x', mode: 'weird', roots: [] }, dir), /port.*mode|mode.*port|roots/);
  assert.throws(() => normalize({ kinds: { Bad: ['a'] } }, dir), /kind name/);
  assert.throws(() => normalize({ kinds: { ok: [] } }, dir), /stage/);
  assert.doesNotThrow(() => normalize({ kinds: { support: ['new', 'resolved'] } }, dir));
  cleanup(dir, data);
});

test('data dir: env overrides, then plugin data, then the OS default', () => {
  assert.equal(dataDir({ env: { LOOPBOARD_HOME: '/x/home', CLAUDE_PLUGIN_DATA: '/x/plugin' }, platform: 'linux', home: '/h' }), path.resolve('/x/home'));
  assert.equal(dataDir({ env: { CLAUDE_PLUGIN_DATA: '/x/plugin' }, platform: 'linux', home: '/h' }), path.resolve('/x/plugin'));
  assert.equal(dataDir({ env: {}, platform: 'darwin', home: '/h' }), '/h/Library/Application Support/loopboard');
  assert.equal(dataDir({ env: {}, platform: 'linux', home: '/h' }), '/h/.local/share/loopboard');
  assert.equal(dataDir({ env: { XDG_DATA_HOME: '/xdg' }, platform: 'linux', home: '/h' }), '/xdg/loopboard');
  assert.equal(dataDir({ env: { APPDATA: 'C:\\Roaming' }, platform: 'win32', home: 'C:\\h' }), 'C:\\Roaming\\loopboard');
  assert.equal(dataDir({ env: {}, platform: 'win32', home: 'C:\\h' }), 'C:\\h\\AppData\\Roaming\\loopboard');
});
