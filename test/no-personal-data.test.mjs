// Privacy checklist: nothing personal may ship. Scans every text file in the repo except test/ itself (this file and the
// other tests may name the patterns they check for) and .git.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPO } from './_helpers.mjs';

const SKIP_DIRS = new Set(['.git', 'node_modules']);
const RULES = [
  ['a macOS home path (/Users/<name>)', /\/Users\/[A-Za-z0-9_.-]+/],
  ['a Linux home path (/home/<name>)', /\/home\/[A-Za-z0-9_.-]+/],
  ['a Windows user profile path (C:\\Users\\<name>)', /[A-Za-z]:\\{1,2}Users\\{1,2}[A-Za-z0-9_.-]+/i],
  ['an email address', /[\w.+-]+@[\w-]+(\.[\w-]+)*\.[A-Za-z]{2,}/],
  ['a Gmail address', /@gmail/i],
  ['a private product name', /dishtuner/i],
  ['the maintainer name outside the public credit', /tamoor/i, text => text.replace(/Ali Tamoor|bealitamoor/g, '')],
];

// → the list of rule names that `text` breaks. The only allowed occurrences of the maintainer name are the exact public
// credit strings "Ali Tamoor" and the GitHub handle "bealitamoor"; anything else containing it (a path fragment,
// another casing) still fails.
export function scan(text) {
  const hits = [];
  for (const [what, re, prep] of RULES) {
    const m = (prep ? prep(text) : text).match(re);
    if (m) hits.push(`${what} -> ${JSON.stringify(m[0])}`);
  }
  return hits;
}

function* files(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) yield* files(path.join(dir, e.name)); }
    else if (e.isFile()) yield path.join(dir, e.name);
  }
}

test('the repo contains no personal data outside test/', () => {
  const hits = [];
  let scanned = 0;
  for (const f of files(REPO)) {
    const rel = path.relative(REPO, f);
    if (rel.split(path.sep)[0] === 'test') continue;
    const buf = fs.readFileSync(f);
    if (buf.includes(0)) continue; // binary
    scanned++;
    const text = buf.toString('utf8');
    for (const h of scan(text)) hits.push(`${rel}: ${h}`);
  }
  assert.ok(scanned > 20, `scanned ${scanned} files`);
  assert.deepEqual(hits, []);
});

test('the scanner allows the public credit and still fails on everything personal', () => {
  assert.deepEqual(scan('Copyright (c) 2026 Ali Tamoor'), []);
  assert.deepEqual(scan('https://github.com/bealitamoor/loopboard and "Ali Tamoor"'), []);
  assert.equal(scan('/Users/tamoor/x').length >= 1, true, 'a home path with the name still fails');
  assert.equal(scan('/Users/someone/x').length, 1);
  assert.equal(scan('/home/someone/x').length, 1);
  assert.equal(scan('C:\\Users\\someone\\x').length, 1);
  assert.equal(scan('write to me@example.com').length, 1);
  assert.equal(scan('the dishtuner app').length, 1);
  assert.equal(scan('a path fragment work-space/tamoor/notes').length, 1, 'a lowercase fragment fails');
  assert.equal(scan('Tamoor said so').length, 1, 'only the exact credit strings are allowed');
  assert.equal(scan('ali tamoor').length, 1);
});

test('generated output and secrets are git-ignored', () => {
  const ignore = fs.readFileSync(path.join(REPO, '.gitignore'), 'utf8');
  for (const pattern of ['*.token', 'index.html', '.hub/', '*.log']) assert.ok(ignore.includes(pattern), `.gitignore covers ${pattern}`);
});

test('no generated page, token or log file is present in the repo tree', () => {
  const bad = [];
  for (const f of files(REPO)) {
    const name = path.basename(f);
    if (name === 'index.html' || name === 'hub.token' || name.endsWith('.token') || name.endsWith('.log')) bad.push(path.relative(REPO, f));
  }
  assert.deepEqual(bad, []);
});
