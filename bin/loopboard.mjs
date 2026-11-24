#!/usr/bin/env node
// loopboard CLI. `node bin/loopboard.mjs <command>` or, after `npm link`, `loopboard <command>` or `lb <command>`. Zero dependencies, Node >= 18.
import { loadConfig } from '../engine/config.mjs';
import { HubError } from '../engine/lib.mjs';
import { parseArgs, cli as threadCli } from '../engine/thread.mjs';
import * as C from '../engine/commands.mjs';

const HELP = `loopboard <command>   (short alias: lb)

  init [--single|--multi] [--areas a,b]      write loopboard.config.json here (never overwrites); --single also a starter STATUS.md
  new <folder> --title T --kind K [--area A] create <folder>/STATUS.md from the kind's template
  doctor                                     check Node, config, data dir, port, editor and every STATUS.md
  build [--check]                            render the page into the data dir; --check only validates (writes nothing), fails on format errors
  serve [--port N]                           run the local server (foreground)
  open                                       open the served page in the default browser (starts nothing)
  service install|remove|status              keep the server running (launchd, Startup-folder launcher on Windows, systemd --user)
  list                                       workstreams with health, waiting count, open comments
  skills [--role R] [--json]                 the skills catalog: which skill to use for what (plugin, project, user, extra folders)
  thread open|show|add|resolve|reopen|set|order|addrow|rmrow ...   comments and board rows (agent writes only)

kinds: app pipeline campaign research design social plan (+ any "kinds" in loopboard.config.json)
Docs: docs/SPEC.md`;

async function main(argv) {
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') { console.log(HELP); return cmd ? 0 : 1; }
  const { pos, flags } = parseArgs(rest);
  const cwd = process.cwd();
  if (cmd === 'init') return C.init(cwd, flags);
  if (cmd === 'doctor') return C.doctor(cwd);
  const cfg = loadConfig({ cwd });
  switch (cmd) {
    case 'new': return C.newStream(cfg, cwd, pos, flags);
    case 'build': return C.buildCmd(cfg, flags);
    case 'serve': return C.serve(cfg, flags);
    case 'open': return C.openCmd(cfg, flags);
    case 'service': return C.service(cfg, pos[0]);
    case 'list': return C.list(cfg);
    case 'skills': return C.skills(cfg, flags);
    case 'thread': {
      const r = threadCli(cfg, rest);
      if (r.out) console.log(r.out);
      if (r.err) console.error(r.err);
      return r.code;
    }
    default: console.error(`loopboard: unknown command "${cmd}"\n`); console.error(HELP); return 1;
  }
}

main(process.argv.slice(2)).then(code => { process.exitCode = code; }, e => {
  if (e instanceof HubError) console.error("loopboard: " + e.message); else console.error(e);
  process.exitCode = 1;
});
