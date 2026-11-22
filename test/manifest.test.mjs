import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPO } from './_helpers.mjs';

const readJson = rel => JSON.parse(fs.readFileSync(path.join(REPO, rel), 'utf8'));
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;

test('plugin.json and marketplace.json parse and agree', () => {
  const plugin = readJson('.claude-plugin/plugin.json');
  const market = readJson('.claude-plugin/marketplace.json');
  assert.equal(plugin.name, 'loopboard');
  assert.ok(market.name && market.owner, 'marketplace has a name and an owner');
  assert.ok(Array.isArray(market.plugins) && market.plugins.length === 1);
  const entry = market.plugins[0];
  assert.equal(entry.name, plugin.name, 'plugin names agree');
  assert.equal(entry.source, './');
  if (entry.version !== undefined) assert.equal(entry.version, plugin.version, 'versions agree');
});

test('version is semver; license, author and repository are set', () => {
  const plugin = readJson('.claude-plugin/plugin.json');
  assert.match(plugin.version, SEMVER);
  assert.equal(plugin.license, 'MIT');
  assert.ok(plugin.author && plugin.author.name);
  assert.match(plugin.repository, /^https:\/\/github\.com\/.+\/loopboard$/);
  assert.ok(plugin.description.length > 0);
});

test('the name is valid and does not use a reserved prefix', () => {
  const { name } = readJson('.claude-plugin/plugin.json');
  assert.match(name, /^[a-z0-9]+(-[a-z0-9]+)*$/);
  assert.ok(!/^(claude-|anthropic-|cc-plugin-)/.test(name), 'reserved prefix');
  assert.ok(!/^(claude-|anthropic-|cc-plugin-)/.test(readJson('.claude-plugin/marketplace.json').name));
});

test('package.json (for `loopboard` on PATH) matches and has no dependencies', () => {
  const pkg = readJson('package.json');
  assert.equal(pkg.version, readJson('.claude-plugin/plugin.json').version);
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.devDependencies, undefined);
  assert.equal(pkg.bin.loopboard, 'bin/loopboard.mjs');
  assert.ok(fs.existsSync(path.join(REPO, pkg.bin.loopboard)));
});

test('the CI workflow tests ubuntu, macos and windows on Node 18 and 22', () => {
  const wf = fs.readFileSync(path.join(REPO, '.github', 'workflows', 'test.yml'), 'utf8');
  for (const os of ['ubuntu-latest', 'macos-latest', 'windows-latest']) assert.ok(wf.includes(os), os);
  assert.match(wf, /node:\s*\[18,\s*22\]/);
  assert.match(wf, /node --test/);
  assert.match(wf, /command -v claude/);
  assert.match(wf, /claude plugin validate --strict \./);
});
