// Every skills/<name>/SKILL.md follows the Agent Skills rules. Passes when skills/ is empty or missing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPO } from './_helpers.mjs';

const SKILLS = path.join(REPO, 'skills');
const dirs = (() => { try { return fs.readdirSync(SKILLS, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort(); } catch { return []; } })();

// minimal frontmatter reader: `key: value` lines, quoted values, and indented / block-scalar continuations
function frontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return null;
  const fm = {}; let key = null;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (kv && !/^\s/.test(line)) { key = kv[1]; fm[key] = /^[>|][+-]?$/.test(kv[2].trim()) ? '' : kv[2].trim().replace(/^(["'])([\s\S]*)\1$/, '$2'); }
    else if (key && /^\s+\S/.test(line)) fm[key] = (fm[key] + ' ' + line.trim()).trim();
  }
  return { fm, body: text.slice(m[0].length) };
}

test('skills folder: every skill directory has a SKILL.md', () => {
  for (const d of dirs) assert.ok(fs.existsSync(path.join(SKILLS, d, 'SKILL.md')), `skills/${d}/SKILL.md is missing`);
});

for (const d of dirs) {
  test(`skill ${d}: frontmatter and size follow the Agent Skills rules`, () => {
    const file = path.join(SKILLS, d, 'SKILL.md');
    if (!fs.existsSync(file)) return; // reported by the test above
    const text = fs.readFileSync(file, 'utf8');
    const p = frontmatter(text);
    assert.ok(p, 'has YAML frontmatter');
    const { name, description } = p.fm;
    assert.equal(name, d, 'name equals the folder name');
    assert.match(name, /^[a-z0-9]+(-[a-z0-9]+)*$/, 'name is lowercase letters, digits and single hyphens');
    assert.ok(name.length <= 64, 'name is at most 64 characters');
    assert.ok(description && description.length > 0, 'description is present');
    assert.ok(description.length <= 1024, `description is ${description.length} characters (max 1024)`);
    const bodyLines = p.body.split(/\r?\n/).length;
    assert.ok(bodyLines < 500, `body is ${bodyLines} lines (must be under 500)`);
  });
}
