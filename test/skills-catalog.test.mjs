// Skills catalog: discovery from the four sources, role inference, user:false, escaping in the built page, safety caps, the CLI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { build } from '../engine/build.mjs';
import { loadConfig } from '../engine/config.mjs';
import { collectSkills, inferRole, canonRole, firstSentence, whenToUse, parseSkill, MAX_BODY, MAX_SKILLS } from '../engine/skills.mjs';
import { tmp, writeFiles, hub, cleanup, status, REPO } from './_helpers.mjs';

const skill = (name, extra = '', body = `# ${name}\n\nSteps.\n`) =>
  `---\nname: ${name}\ndescription: Does ${name} things. Use when the user says "${name}".\n${extra}---\n\n${body}`;

// a workspace with a project skill, a fake home with a user skill and an extra folder; HOME and USERPROFILE point at the fake home
function setup(config = {}, files = {}) {
  const dir = tmp('sk-ws-'), home = tmp('sk-home-'), data = tmp('sk-data-'), extra = tmp('sk-extra-');
  writeFiles(dir, {
    'loopboard.config.json': JSON.stringify({ roots: ['.'], skills: { dirs: [extra], ...config } }),
    '.claude/skills/proj-thing/SKILL.md': skill('proj-thing', 'argument-hint: "<a> | <b>"\n'),
    ...files,
  });
  writeFiles(home, { '.claude/skills/home-thing/SKILL.md': skill('home-thing') });
  writeFiles(extra, { 'extra-thing/SKILL.md': skill('extra-thing') });
  const env = { ...process.env, HOME: home, USERPROFILE: home, LOOPBOARD_HOME: data };
  delete env.LOOPBOARD_CONFIG; delete env.CLAUDE_PLUGIN_DATA;
  return { dir, home, data, extra, env, cfg: () => loadConfig({ cwd: dir, env }), done: () => cleanup(dir, home, data, extra) };
}

test('discovers skills from the plugin, the project, the user home and extra folders', () => {
  const w = setup();
  const cat = collectSkills(w.cfg());
  const by = n => cat.items.find(k => k.name === n);
  assert.equal(by('hub-work').source, 'plugin');
  assert.equal(by('hub-work').invocation, '/loopboard:hub-work');
  assert.equal(by('proj-thing').source, 'project');
  assert.equal(by('proj-thing').invocation, '/proj-thing');
  assert.equal(by('home-thing').source, 'user');
  assert.equal(by('home-thing').invocation, '/home-thing');
  assert.equal(by('extra-thing').source, 'extra');
  assert.equal(cat.sources.plugin, fs.readdirSync(path.join(REPO, 'skills')).length);
  assert.deepEqual([cat.sources.project, cat.sources.user, cat.sources.extra], [1, 1, 1]);
  assert.equal(by('proj-thing').shown, '.claude/skills/proj-thing/SKILL.md');
  assert.equal(by('home-thing').shown, '~/.claude/skills/home-thing/SKILL.md', 'a home path is never shown in full');
  w.done();
});

test('frontmatter: argument hint, copy text, summary, "when to use" and reference/script files', () => {
  const w = setup({}, {
    '.claude/skills/proj-thing/references/guide.md': 'x', '.claude/skills/proj-thing/scripts/run.sh': 'echo', '.claude/skills/proj-thing/scripts/.hidden': 'x',
  });
  const k = collectSkills(w.cfg()).items.find(i => i.name === 'proj-thing');
  assert.equal(k.hint, '<a> | <b>');
  assert.equal(k.copy, '/proj-thing <a>', 'the copy text uses the first form of the hint as a placeholder');
  assert.equal(k.summary, 'Does proj-thing things.');
  assert.equal(k.when, 'Use when the user says "proj-thing".', 'the rest after the first sentence, no duplicate');
  assert.deepEqual(k.references.map(f => f.name), ['guide.md']);
  assert.deepEqual(k.scripts.map(f => f.name), ['run.sh']);
  assert.match(k.body, /^# proj-thing/);
  const noHint = collectSkills(w.cfg()).items.find(i => i.name === 'home-thing');
  assert.equal(noHint.hint, ''); assert.equal(noHint.copy, '/home-thing');
  w.done();
});

test('role: explicit category / metadata.role win, else the name prefix, else Other', () => {
  assert.deepEqual(['hub-x', 'dev-x', 'design-x', 'social-x', 'plan-x', 'seo-x', 'other-x', 'plain'].map(inferRole),
    ['Core', 'Developer', 'Designer', 'Social', 'Planner', 'SEO', 'Other', 'Other']);
  assert.equal(canonRole('dev'), 'Developer'); assert.equal(canonRole('seo'), 'SEO'); assert.equal(canonRole('  Ops  '), 'Ops');
  const w = setup({}, {
    '.claude/skills/hub-extra/SKILL.md': skill('hub-extra'),
    '.claude/skills/tagged/SKILL.md': skill('tagged', 'category: seo\n'),
    '.claude/skills/nested/SKILL.md': skill('nested', 'metadata:\n  role: designer\n'),
    '.claude/skills/dev-but-tagged/SKILL.md': skill('dev-but-tagged', 'category: Ops\n'),
  });
  const r = Object.fromEntries(collectSkills(w.cfg()).items.map(k => [k.name, k.role]));
  assert.equal(r['hub-extra'], 'Core'); assert.equal(r.tagged, 'SEO'); assert.equal(r.nested, 'Designer');
  assert.equal(r['dev-but-tagged'], 'Ops'); assert.equal(r['proj-thing'], 'Other'); assert.equal(r['hub-work'], 'Core');
  const roles = collectSkills(w.cfg()).roles.map(x => x.role);
  assert.deepEqual(roles, ['Core', 'Developer', 'Designer', 'Social', 'Planner', 'SEO', 'Ops', 'Other'], 'standard roles first, custom next, Other last');
  w.done();
});

test('parser: block scalars, wrapped values, quotes; first sentence; when-to-use', () => {
  const p = parseSkill('---\nname: a\ndescription: >\n  First part.\n  Second line. Use when x.\nargument-hint: "[y]"\n---\nbody\n');
  assert.equal(p.fm.description, 'First part. Second line. Use when x.');
  assert.equal(p.fm['argument-hint'], '[y]');
  assert.equal(p.body, 'body\n');
  assert.equal(firstSentence('One. Two.'), 'One.');
  assert.equal(firstSentence('No full stop'), 'No full stop');
  assert.equal(whenToUse('One. Two things. Use when asked.'), 'Use when asked.');
  assert.equal(whenToUse('One. Two things.'), 'Two things.');
  assert.equal(whenToUse('Only one.'), '');
});

test('skills.user false hides the home skills; it defaults to true', () => {
  const on = setup(), off = setup({ user: false });
  assert.ok(collectSkills(on.cfg()).items.some(k => k.source === 'user'));
  assert.equal(loadConfig({ cwd: on.dir, env: on.env }).skills.user, true);
  const cat = collectSkills(off.cfg());
  assert.ok(!cat.items.some(k => k.source === 'user' || k.name === 'home-thing'));
  assert.equal(cat.userEnabled, false);
  assert.ok(cat.items.some(k => k.source === 'project') && cat.items.some(k => k.source === 'extra'), 'other sources stay');
  on.done(); off.done();
});

test('config validation for skills', () => {
  const w = setup();
  for (const bad of [{ skills: 'yes' }, { skills: { user: 'no' } }, { skills: { dirs: 'x' } }, { skills: { dirs: [1] } }]) {
    fs.writeFileSync(path.join(w.dir, 'loopboard.config.json'), JSON.stringify(bad));
    assert.throws(() => w.cfg(), /invalid config.*skills/, JSON.stringify(bad));
  }
  fs.writeFileSync(path.join(w.dir, 'loopboard.config.json'), JSON.stringify({ skills: { dirs: ['rel'] } }));
  const c = w.cfg();
  assert.deepEqual(c.skills, { user: true, dirs: [path.join(w.dir, 'rel')] });
  w.done();
});

test('a malicious description is escaped in the built page and never becomes markup', () => {
  const evil = '<script>alert(1)</script><img src=x onerror=alert(2)>';
  const w = setup({}, {
    '.claude/skills/evil/SKILL.md': `---\nname: evil\ndescription: ${evil} Use when "</script><script>alert(3)</script>".\nargument-hint: "<script>alert(4)</script>"\n---\n\n# <script>alert(5)</script>\n\n<img src=x onerror=alert(6)>\n\n[x](javascript:alert(7))\n`,
  });
  const res = build(w.cfg(), { write: false });
  assert.ok(!res.html.includes('<script>alert'), 'no raw script from a skill in the page source');
  assert.ok(!res.html.includes('<img src=x'), 'no raw tag from a skill in the page source');
  const json = res.html.match(/<script id="data" type="application\/json">([\s\S]*?)<\/script>/)[1];
  assert.ok(!json.includes('</script>'), 'the embedded data cannot close its script tag');
  const d = JSON.parse(json);
  assert.ok(d.skills.items.find(k => k.name === 'evil').description.includes('<script>'), 'kept as data');
  // render it with the page script: every route, nothing unescaped comes out
  const html = renderRoutes(json, ['#skills', '#skills/evil']);
  for (const h of html) {
    assert.ok(!/<script|<img/i.test(h), 'only escaped text in the rendered skills page');
    assert.ok(!/href="javascript:/i.test(h));
  }
  assert.ok(html[0].includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  w.done();
});

test('safety: body cap, skill cap, unreadable skills, symlinks out of the skill folder', () => {
  const w = setup({ user: false }, { '.claude/skills/big/SKILL.md': skill('big', '', 'x'.repeat(MAX_BODY + 5000)) });
  const big = collectSkills(w.cfg()).items.find(k => k.name === 'big');
  assert.equal(big.bodyTruncated, true);
  assert.ok(big.body.length <= MAX_BODY);

  // a SKILL.md that is a link to a file outside its folder, a references/ link outside, and a folder without a SKILL.md
  const secret = path.join(w.home, 'secret.md'); fs.writeFileSync(secret, skill('secret-skill'));
  fs.mkdirSync(path.join(w.dir, '.claude/skills/linked'), { recursive: true });
  const outsideDir = tmp('sk-out-'); fs.writeFileSync(path.join(outsideDir, 'leak.txt'), 'x');
  fs.mkdirSync(path.join(w.dir, '.claude/skills/refs'), { recursive: true });
  fs.writeFileSync(path.join(w.dir, '.claude/skills/refs/SKILL.md'), skill('refs'));
  let linked = true;
  try {
    fs.symlinkSync(secret, path.join(w.dir, '.claude/skills/linked/SKILL.md'));
    fs.symlinkSync(outsideDir, path.join(w.dir, '.claude/skills/refs/references'));
  } catch { linked = false; } // symlinks may be unavailable (Windows without privileges)
  fs.mkdirSync(path.join(w.dir, '.claude/skills/empty'), { recursive: true });
  const cat = collectSkills(w.cfg());
  assert.ok(!cat.items.some(k => k.name === 'secret-skill' || k.name === 'linked'));
  if (linked) assert.deepEqual(cat.items.find(k => k.name === 'refs').references, [], 'a link out of the skill folder is not listed');
  assert.ok(cat.items.some(k => k.name === 'refs'));
  cleanup(outsideDir);

  const many = {};
  for (let i = 0; i < MAX_SKILLS + 20; i++) many[`.claude/skills/m${String(i).padStart(4, '0')}/SKILL.md`] = skill(`m${i}`);
  writeFiles(w.dir, many);
  const capped = collectSkills(w.cfg());
  assert.equal(capped.count, MAX_SKILLS);
  assert.equal(capped.capped, true);
  w.done();
});

test('a skill folder that is a symlink still works, and the same skill is listed once', () => {
  const w = setup({ user: false });
  const target = tmp('sk-target-'); writeFiles(target, { 'SKILL.md': skill('via-link') });
  let ok = true; try { fs.symlinkSync(target, path.join(w.dir, '.claude/skills/via-link')); } catch { ok = false; }
  if (ok) {
    writeFiles(w.dir, { '.claude/skills/dup/SKILL.md': skill('dup') });
    fs.symlinkSync(path.join(w.dir, '.claude/skills/dup'), path.join(w.dir, '.claude/skills/dup-alias'));
    const items = collectSkills(w.cfg()).items;
    assert.equal(items.filter(k => k.name === 'via-link').length, 1);
    assert.equal(items.filter(k => k.name === 'dup').length, 1);
  }
  cleanup(target); w.done();
});

test('a stream titled "Skills" does not take over the #skills route', () => {
  const w = setup({}, { 'STATUS.md': status({ title: 'Skills' }) });
  const res = build(w.cfg(), { write: false });
  assert.ok(!res.streams.some(s => s.id === 'skills'));
  w.done();
});

test('the page: sidebar entry with a count, overview tip, cards and a detail view', () => {
  const w = setup({ user: false }, { 'STATUS.md': status() });
  const res = build(w.cfg(), { write: false });
  const json = res.html.match(/<script id="data" type="application\/json">([\s\S]*?)<\/script>/)[1];
  const n = JSON.parse(json).skills.count;
  const [list, detail, over] = renderRoutes(json, ['#skills', '#skills/proj-thing', '#overview'], true);
  assert.match(list.side, new RegExp(`href="#skills"[^>]*>.*Skills.*<span class="cb">${n}</span>`));
  assert.equal((list.main.match(/class="skcard"/g) || []).length, n);
  assert.ok(list.main.includes('data-copy="/loopboard:hub-work &lt;stream&gt; &lt;ID&gt;"'), 'copy button carries the invocation with the hint placeholder');
  assert.ok(list.main.includes('data-rchip="Core"') && list.main.includes('data-rchip="Other"'));
  assert.ok(list.top.includes('Search skills'));
  assert.ok(detail.main.includes('SKILL.md') && detail.main.includes('proj-thing'));
  assert.ok(detail.main.includes('data-open="editor"'), 'Open in editor when served');
  assert.ok(over.nav.includes('Not sure which skill?') && over.nav.includes('href="#skills"'));
  assert.ok(renderRoutes(json, ['#skills/nope'])[0].includes('No skill with that name'));
  // single mode too
  const single = renderRoutes(json, ['#skills'], true)[0];
  assert.ok(single.main.includes('skcard'));
  w.done();
});

test('detail view joins soft-wrapped lines of a paragraph and of a list item', () => {
  const w = setup({ user: false }, { '.claude/skills/wrapped/SKILL.md': skill('wrapped', '', '# t\n\nline one\nline two\n\n- item a\n  continues here\n- item b\n') });
  const res = build(w.cfg(), { write: false });
  const json = res.html.match(/<script id="data" type="application\/json">([\s\S]*?)<\/script>/)[1];
  const main = renderRoutes(json, ['#skills/wrapped'])[0];
  assert.ok(main.includes('<p>line one line two</p>'), main);
  assert.ok(main.includes('<li>item a continues here</li>'));
  w.done();
});

test('the "open" API accepts a catalogued skill outside the roots and nothing else', async () => {
  const { startServer } = await import('../engine/server.mjs');
  const w = setup();
  const cfg = w.cfg(), calls = [];
  const srv = await startServer(cfg, { port: 0, platform: { openInEditor: async (...a) => calls.push(a), reveal: async () => { } } });
  const { token } = await import('../engine/lib.mjs');
  const post = async p => {
    const r = await fetch(`http://localhost:${srv.port}/api/open`, { method: 'POST', headers: { 'content-type': 'application/json', origin: `http://localhost:${srv.port}`, 'x-hub-token': token(cfg) }, body: JSON.stringify(p) });
    return r.status;
  };
  const home = path.join(w.home, '.claude/skills/home-thing/SKILL.md');
  assert.equal(await post({ how: 'editor', path: home }), 200);
  assert.equal(await post({ how: 'editor', path: path.join(w.home, '.claude/skills/home-thing') }), 200);
  assert.equal(await post({ how: 'editor', path: path.join(w.home, '.claude/settings.json') }), 403);
  fs.writeFileSync(path.join(w.home, 'notes.txt'), 'x');
  assert.equal(await post({ how: 'editor', path: path.join(w.home, 'notes.txt') }), 403);
  await srv.close(); w.done();
});

test('CLI: loopboard skills lists the catalog, --role filters, --json is valid, user:false hides home skills', () => {
  const w = setup();
  const r = hub(['skills'], { cwd: w.dir, env: w.env });
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /skill\(s\) \(plugin \d+, project 1, user 1, extra 1\)/);
  assert.match(r.out, /^Core$/m);
  assert.match(r.out, /\/loopboard:hub-work <stream> <ID>/);
  assert.match(r.out, /\/proj-thing <a>  \[project\]/);
  assert.match(r.out, /\/home-thing  \[user\]/);

  const dev = hub(['skills', '--role', 'dev'], { cwd: w.dir, env: w.env });
  assert.equal(dev.code, 0);
  assert.match(dev.out, /^Developer$/m);
  assert.ok(!/^Core$/m.test(dev.out) && !dev.out.includes('proj-thing'));
  assert.match(dev.out, /\/loopboard:dev-bug/);

  const j = JSON.parse(hub(['skills', '--json'], { cwd: w.dir, env: w.env }).out);
  assert.equal(j.skills.find(k => k.name === 'hub-work').role, 'Core');
  assert.equal(j.skills.find(k => k.name === 'proj-thing').copy, '/proj-thing <a>');
  assert.ok(!('body' in j.skills[0]));
  const jr = JSON.parse(hub(['skills', '--json', '--role', 'core'], { cwd: w.dir, env: w.env }).out);
  assert.ok(jr.skills.length > 0 && jr.skills.every(k => k.role === 'Core'));

  const none = hub(['skills', '--role', 'nonsense'], { cwd: w.dir, env: w.env });
  assert.equal(none.code, 1); assert.match(none.err, /no skills with role/);

  fs.writeFileSync(path.join(w.dir, 'loopboard.config.json'), JSON.stringify({ roots: ['.'], skills: { user: false } }));
  const off = hub(['skills'], { cwd: w.dir, env: w.env });
  assert.ok(!off.out.includes('home-thing'));
  assert.match(off.out, /user skills hidden/);
  w.done();
});

test('CLI output strips terminal escape sequences from skill text', () => {
  const w = setup({ user: false }, { '.claude/skills/esc/SKILL.md': '---\nname: esc\ndescription: "Bad \\u001b[31mred\\u001b[0m text."\n---\nbody\n' });
  // the YAML-style escape above stays literal text; use a real ESC byte to prove the filter
  fs.writeFileSync(path.join(w.dir, '.claude/skills/esc/SKILL.md'), `---\nname: esc\ndescription: Bad \u001b[31mred\u001b[0m text.\n---\nbody\n`);
  const r = hub(['skills'], { cwd: w.dir, env: w.env });
  assert.ok(!r.out.includes('\u001b'), 'no ESC byte reaches the terminal');
  assert.match(r.out, /Bad .\[31mred/);
  w.done();
});

test('the demo workspace has project skills and builds a catalog', () => {
  const demo = path.join(REPO, 'examples', 'demo-workspace');
  const data = tmp('sk-demo-');
  const env = { ...process.env, HOME: data, USERPROFILE: data, LOOPBOARD_HOME: data };
  const cat = collectSkills(loadConfig({ cwd: demo, env }));
  assert.deepEqual(cat.items.filter(k => k.source === 'project').map(k => k.name).sort(), ['brand-voice-check', 'design-token-audit', 'release-notes']);
  assert.equal(cat.items.find(k => k.name === 'design-token-audit').role, 'Designer');
  assert.deepEqual(cat.items.find(k => k.name === 'design-token-audit').scripts.map(f => f.name), ['find-colours.sh']);
  cleanup(data);
});

// ---- run engine/client.js in a stubbed browser (same approach as client.test.mjs) and return the rendered pieces
const CLIENT = fs.readFileSync(new URL('../engine/client.js', import.meta.url), 'utf8');
function renderRoutes(json, hashes, full = false) {
  return hashes.map(hash => {
    const els = {};
    const mk = () => ({ innerHTML: '', textContent: '', value: '', hidden: false, dataset: {}, classList: { add() { }, remove() { }, toggle() { }, contains: () => false },
      addEventListener() { }, scrollTo() { }, querySelector: () => null, querySelectorAll: () => [], matches: () => false, closest: () => null, contains: () => false, focus() { }, getAttribute: () => '' });
    const el = sel => (els[sel] ||= mk());
    const document = { getElementById: id => (id === 'data' ? { textContent: json } : el('#' + id)), querySelector: el, querySelectorAll: () => [], addEventListener() { }, title: '', hidden: false, activeElement: null, body: { appendChild() { } }, createElement: () => mk(), execCommand: () => true };
    const ctx = { document, location: { protocol: 'http:', hash, reload() { } }, sessionStorage: { getItem: () => null, setItem() { }, removeItem() { } },
      setInterval() { }, setTimeout() { }, clearTimeout() { }, addEventListener() { }, navigator: {}, isSecureContext: false, fetch: async () => ({ ok: true, json: async () => ({}) }), prompt: () => null, console, Date, JSON, Math, Object, Array, String, Number, Set, Map, RegExp, encodeURIComponent, decodeURIComponent, encodeURI, Promise, Error, parseInt, parseFloat, isNaN };
    vm.createContext(ctx);
    vm.runInContext(CLIENT, ctx);
    const out = { main: els['#main'].innerHTML, nav: els['#nav'].innerHTML, side: els['#side'].innerHTML, top: els['#top'].innerHTML };
    return full ? out : out.main;
  });
}
