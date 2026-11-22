import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { handle } from '../engine/guard.mjs';
import { tokenFile, token } from '../engine/lib.mjs';
import { workspace, status, tmp, cleanup, REPO } from './_helpers.mjs';

const BOARD = '| G1 | Thing | build | doing | — | — | |';
const STATUS = status({ title: 'Guard Test' }, BOARD);
let w, cfg, SF, TF, outside;
const BIN = path.join(REPO, 'bin', 'loopboard.mjs');

before(() => {
  w = workspace({ 'STATUS.md': STATUS, 'src/a.txt': 'a' }, { roots: ['.'], port: 4747 });
  cfg = w.cfg(); SF = path.join(w.dir, 'STATUS.md'); TF = path.join(w.dir, 'THREAD.jsonl');
  fs.utimesSync(SF, new Date('2026-01-01'), new Date('2026-01-01'));
  outside = tmp('hub-outside-');
  fs.writeFileSync(path.join(outside, 'STATUS.md'), STATUS);
  token(cfg);
});
after(() => cleanup(w.dir, w.data, outside));

const run = (event, input, env = w.env) => handle(event, { session_id: 't1', cwd: w.dir, ...input }, { env });
const pre = (tool, tool_input, cwd) => run('pre', { tool_name: tool, tool_input, ...(cwd ? { cwd } : {}) });
const bash = (command, cwd) => pre('Bash', { command }, cwd);
const verdict = o => o?.hookSpecificOutput?.permissionDecision || (o?.decision === 'block' ? 'block' : 'allow');
const denied = o => assert.equal(verdict(o), 'deny', JSON.stringify(o));
const allowed = o => assert.equal(verdict(o), 'allow', JSON.stringify(o));

test('1. THREAD.jsonl is only touched through loopboard thread', () => {
  denied(pre('Edit', { file_path: TF, old_string: 'a', new_string: 'b' }));
  denied(pre('Write', { file_path: TF, content: '{}' }));
  denied(pre('MultiEdit', { file_path: TF, edits: [{ old_string: 'a', new_string: 'b' }] }));
  denied(pre('Read', { file_path: TF }));
  denied(bash(`echo '{"op":"add"}' >> ${TF}`));
  denied(bash('cat THREAD.jsonl'));
  denied(bash('rm THREAD.jsonl'));
  allowed(bash(`node "${BIN}" thread show guard-test G1`));
  allowed(bash('loopboard thread open'));
  allowed(bash(`cd ${w.dir} && node ${BIN} thread add guard-test G1 answer "done; see STATUS.md" --re c1`, tmp()));
  allowed(bash('node "${CLAUDE_PLUGIN_ROOT}/bin/loopboard.mjs" thread open'));
});

test('2. board rows change only through loopboard thread; prose stays editable', () => {
  denied(pre('Edit', { file_path: SF, old_string: '| G1 | Thing | build | doing |', new_string: '| G1 | Thing | test | done |' }));
  allowed(pre('Edit', { file_path: SF, old_string: '- testing', new_string: '- testing more' }));
  allowed(pre('Edit', { file_path: SF, old_string: 'updated: 2026-01-01', new_string: 'updated: 2026-11-22' }));
  denied(pre('Write', { file_path: SF, content: STATUS.replace('| doing |', '| done |') }));
  allowed(pre('Write', { file_path: SF, content: STATUS.replace('- x', '- y') }));
  allowed(pre('Write', { file_path: path.join(w.dir, 'new', 'STATUS.md'), content: STATUS }));
  denied(pre('MultiEdit', { file_path: SF, edits: [{ old_string: BOARD + '\n', new_string: '' }] }));
  allowed(pre('MultiEdit', { file_path: SF, edits: [{ old_string: '- testing', new_string: '- a' }, { old_string: '- more', new_string: '- b' }] }));
});

test('2b. shell writes to STATUS.md are denied, reads and unrelated redirects are not', () => {
  denied(bash(`sed -i '' 's/doing/done/' "${SF}"`));
  denied(bash('perl -pi -e "s/doing/done/" STATUS.md'));
  denied(bash('echo hi > STATUS.md'));
  denied(bash(`cat x >> "${SF}"`));
  denied(bash("ls && sed -i '' 's/a/b/' STATUS.md"));
  denied(bash('mv /tmp/x STATUS.md'));
  denied(bash('rm STATUS.md'));
  allowed(bash('grep -n Board STATUS.md 2>/dev/null'));
  allowed(bash('grep -n Board STATUS.md > /tmp/out.txt; echo hi > src/a.txt'));
  allowed(bash('claude -p "do not touch STATUS.md" > out.json 2>&1'));
  allowed(bash('ls -la && git status'));
});

test('3. agents cannot write as "you", call the hub server, or read the token', () => {
  denied(bash('loopboard thread add s I decision "ship it" --by you'));
  denied(bash(`node "${BIN}" thread add s I decision "ship it" --by you`));
  allowed(bash('loopboard thread add s I note "x" --by agent'));
  denied(bash('curl -s http://localhost:4747/hub/'));
  denied(bash('curl 127.0.0.1:4747/api/comment -X POST'));
  denied(bash('node -e "fetch(\'http://localhost:4747/hub/\')"'));
  allowed(bash('curl -s http://localhost:3000/health'));
  denied(pre('Read', { file_path: tokenFile(cfg) }));
  denied(pre('Grep', { pattern: 'a', path: tokenFile(cfg) }));
  denied(pre('Write', { file_path: tokenFile(cfg), content: 'x' }));
  denied(bash('cat hub.token'));
  denied(bash(`cat ${tokenFile(cfg)}`));
  denied(bash('T=$(cat hub.token); echo $T'));
});

test('3b. the server port is denied from anywhere only for the hub paths (config found via $LOOPBOARD_CONFIG)', () => {
  const env = { ...w.env, LOOPBOARD_CONFIG: path.join(w.dir, 'loopboard.config.json') };
  const away = command => handle('pre', { cwd: outside, tool_name: 'Bash', tool_input: { command } }, { env });
  denied(away('curl localhost:4747/hub/'));
  denied(away('curl localhost:4747/api/set -X POST'));
  allowed(away('curl localhost:4747/health'));
  allowed(away('curl localhost:3000/hub/'));
  allowed(bash('curl localhost:4747/hub/', outside)); // no config reachable from there: the guard stays out of it
});

test('4. scope: nothing outside the configured roots', () => {
  allowed(pre('Edit', { file_path: path.join(outside, 'THREAD.jsonl'), old_string: 'a', new_string: 'b' }, outside));
  allowed(pre('Edit', { file_path: path.join(outside, 'STATUS.md'), old_string: '| G1 | Thing | build | doing |', new_string: '| G1 | Thing | test | done |' }, outside));
  allowed(bash("sed -i '' s/a/b/ STATUS.md", outside));
  allowed(bash('cat hub.token', outside));
  allowed(pre('Read', { file_path: path.join(outside, 'THREAD.jsonl') }, outside));
  allowed(pre('Edit', { file_path: path.join(w.dir, 'src', 'a.txt'), old_string: 'a', new_string: 'b' }));
});

test('5. no config, or "guard": false, turns every rule off', () => {
  const bare = tmp('hub-bare-');
  allowed(handle('pre', { cwd: bare, tool_name: 'Bash', tool_input: { command: 'sed -i s/a/b/ STATUS.md' } }, { env: { LOOPBOARD_HOME: tmp() } }));
  const off = workspace({ 'STATUS.md': STATUS }, { roots: ['.'], guard: false });
  allowed(handle('pre', { cwd: off.dir, tool_name: 'Edit', tool_input: { file_path: path.join(off.dir, 'THREAD.jsonl'), old_string: 'a', new_string: 'b' } }, { env: off.env }));
  assert.equal(handle('start', { cwd: off.dir }, { env: off.env }), null);
  const broken = workspace({}, null);
  fs.writeFileSync(path.join(broken.dir, 'loopboard.config.json'), '{ nope');
  assert.equal(handle('pre', { cwd: broken.dir, tool_name: 'Bash', tool_input: { command: 'ls' } }, { env: broken.env }), null);
  cleanup(bare, off.dir, off.data, broken.dir, broken.data);
});

test('6. STATUS.md must be updated before the session stops', () => {
  const sess = { session_id: 'stop-test', cwd: w.dir };
  const touch = f => run('post', { ...sess, tool_name: 'Edit', tool_input: { file_path: f } });
  assert.equal(run('stop', { ...sess, stop_hook_active: false }), null, 'nothing touched yet');
  touch(path.join(w.dir, 'src', 'a.txt'));
  const blocked = run('stop', { ...sess, stop_hook_active: false });
  assert.equal(blocked.decision, 'block');
  assert.match(blocked.reason, /STATUS\.md/);
  assert.match(blocked.reason, /src[\\/]a\.txt/);
  const warn = run('stop', { ...sess, stop_hook_active: true });
  assert.equal(warn.decision, undefined, 'second stop warns instead of looping');
  assert.match(warn.systemMessage, /still not updated/);
  fs.writeFileSync(SF, STATUS.replace('updated: 2026-01-01', 'updated: 2026-11-22'));
  assert.equal(run('stop', { ...sess, stop_hook_active: false }), null, 'updated STATUS.md lets the session end');
  // files in skipped folders and STATUS.md itself are not tracked
  const s2 = { session_id: 'stop-test-2', cwd: w.dir };
  run('post', { ...s2, tool_name: 'Write', tool_input: { file_path: path.join(w.dir, 'node_modules', 'x', 'y.js') } });
  run('post', { ...s2, tool_name: 'Write', tool_input: { file_path: SF } });
  run('post', { ...s2, tool_name: 'Write', tool_input: { file_path: path.join(outside, 'z.txt') } });
  assert.equal(run('stop', { ...s2, stop_hook_active: false }), null);
  assert.equal(run('stop', { session_id: 'untouched', cwd: w.dir }), null);
});

test('7. session start lists open comments, or says none', () => {
  const none = run('start', { cwd: w.dir });
  assert.match(none.hookSpecificOutput.additionalContext, /Open hub comments for this workstream: none/);
  assert.equal(none.hookSpecificOutput.hookEventName, 'SessionStart');
  const r = spawnSync(process.execPath, [BIN, 'thread', 'add', 'guard-test', 'G1', 'todo', 'Please check the thing', '--no-build'], { cwd: w.dir, env: w.env, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const some = run('start', { cwd: w.dir });
  assert.match(some.hookSpecificOutput.additionalContext, /G1 · c[0-9a-f]{6} · agent · Instruction for agent: Please check the thing/);
  assert.match(some.hookSpecificOutput.additionalContext, /hub-work/);
  assert.equal(handle('start', { cwd: outside }, { env: w.env }), null, 'silent outside the roots');
});

test('8. the hook protocol works end to end (stdin JSON in, JSON out)', () => {
  const guard = path.join(REPO, 'engine', 'guard.mjs');
  const call = (event, input) => spawnSync(process.execPath, [guard, event], { input: JSON.stringify(input), env: w.env, encoding: 'utf8' });
  const denyRes = call('pre', { cwd: w.dir, tool_name: 'Edit', tool_input: { file_path: TF, old_string: 'a', new_string: 'b' } });
  assert.equal(denyRes.status, 0);
  assert.equal(JSON.parse(denyRes.stdout).hookSpecificOutput.permissionDecision, 'deny');
  const ok = call('pre', { cwd: w.dir, tool_name: 'Bash', tool_input: { command: 'ls' } });
  assert.equal(ok.status, 0);
  assert.equal(ok.stdout, '');
  const garbage = spawnSync(process.execPath, [guard, 'pre'], { input: 'not json', env: w.env, encoding: 'utf8' });
  assert.equal(garbage.status, 0);
  assert.equal(garbage.stdout, '');
});

test('9. hooks.json wires every event to the guard through ${CLAUDE_PLUGIN_ROOT}', () => {
  const hooks = JSON.parse(fs.readFileSync(path.join(REPO, 'hooks', 'hooks.json'), 'utf8')).hooks;
  const cmds = ev => hooks[ev].flatMap(g => g.hooks.map(h => h.command));
  for (const [ev, arg] of [['SessionStart', 'start'], ['PreToolUse', 'pre'], ['PostToolUse', 'post'], ['Stop', 'stop']]) {
    assert.deepEqual(cmds(ev), [`node "\${CLAUDE_PLUGIN_ROOT}/engine/guard.mjs" ${arg}`], ev);
  }
  assert.match(hooks.PreToolUse[0].matcher, /Bash/);
});
