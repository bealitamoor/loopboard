// Loopboard page script (inlined by engine/build.mjs). Data comes from the embedded JSON; everything renders here.
// Served from http://localhost:<port>/hub/ every write is a fetch() to the local API. Opened as a plain file the page is read-only.
const D = JSON.parse(document.getElementById('data').textContent);
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inline = s => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
  .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, h) => /^\s*(javascript|data|vbscript):/i.test(h) ? t : h.startsWith('hubfile:') ? `<a href="${esc(U(decodeURIComponent(h.slice(8))))}" target="_blank" rel="noopener">${t}</a>` : /^(https?:|mailto:|#)/i.test(h) ? `<a href="${h}" target="_blank" rel="noopener">${t}</a>` : t);
function md(src) { // lines of one paragraph or list item are joined (soft wraps), not turned into hard breaks
  if (!src || !src.trim()) return '<p class="empty">nothing</p>';
  const L = src.split('\n'); let h = '', list = 0, para = [], li = null;
  const flush = () => { if (li !== null) { h += '<li>' + inline(li) + '</li>'; li = null; } if (para.length) { h += '<p>' + inline(para.join(' ')) + '</p>'; para = []; } };
  const close = () => { flush(); if (list) { h += '</ul>'; list = 0; } };
  for (let i = 0; i < L.length; i++) {
    const l = L[i];
    if (/^\s*\|/.test(l) && /^\s*\|?\s*:?-{2,}/.test(L[i + 1] || '')) {
      close(); const row = x => x.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      h += '<div class="tablewrap"><table><tr>' + row(l).map(c => '<th>' + inline(c) + '</th>').join('') + '</tr>'; i += 2;
      while (i < L.length && /^\s*\|/.test(L[i])) { h += '<tr>' + row(L[i]).map(c => '<td>' + inline(c) + '</td>').join('') + '</tr>'; i++; }
      i--; h += '</table></div>'; continue;
    }
    if (/^```/.test(l)) { close(); let b = ''; i++; while (i < L.length && !/^```/.test(L[i])) b += L[i++] + '\n'; h += '<pre>' + esc(b) + '</pre>'; continue; }
    const b = l.match(/^\s*(?:[-*]|\d+\.)\s+(.*)/); if (b) { flush(); if (!list) { h += '<ul>'; list = 1; } li = b[1]; continue; }
    if (li !== null && /^\s+\S/.test(l)) { li += ' ' + l.trim(); continue; }
    if (!l.trim()) { close(); continue; }
    const bq = l.match(/^\s*>\s?(.*)/), hd = l.match(/^(#{1,6})\s+(.*)/);
    if (bq || hd) { close(); h += bq ? '<p class="meta">' + inline(bq[1]) + '</p>' : `<h4>${inline(hd[2])}</h4>`; continue; }
    if (list) close();
    para.push(l.trim());
  }
  close(); return h;
}
const SERVED = location.protocol.startsWith('http');
const RO = !SERVED;
// a file path from the build data -> a URL: served by the local server, or file:// when the page was opened directly
const U = abs => SERVED ? '/file?p=' + encodeURIComponent(abs) : 'file://' + encodeURI(/^[A-Za-z]:/.test(abs) ? '/' + abs.replace(/\\/g, '/') : abs).replace(/[?#]/g, c => '%' + c.charCodeAt(0).toString(16));
const openBtn = (how, abs, label) => SERVED && (how !== 'editor' || D.canEditor) ? `<button class="btn" data-open="${how}" data-path="${esc(abs)}">${label}</button>` : '';
const copyBtn = (text, label = 'Copy') => text ? `<button class="btn copy" data-copy="${esc(text)}">${esc(label)}</button>` : '';
const pathActions = (abs, { dir = false } = {}) => `${copyBtn(abs, 'Copy path')}${dir ? '' : `<a class="btn" href="${esc(U(abs))}" target="_blank">Open</a>`}${openBtn('editor', abs, 'Editor')}${openBtn('reveal', abs, 'Reveal')}`;
const chip = st => `<span class="chip s-${esc(st)}">${esc(st || '—')}</span>`;
const hd = h => `<span class="hd h-${esc(h)}"></span>`;
const ageTxt = s => s.age == null ? 'no date' : s.age <= 0 ? 'updated today' : s.age === 1 ? 'updated yesterday' : `updated ${s.age} days ago`;
const day = d => { const t = new Date(String(d).slice(0, 10) + 'T12:00:00Z'); return isNaN(t) ? d : t.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }); };
const sbar = c => { const t = D.STATUSES.reduce((a, s) => a + c[s], 0); return t ? `<div class="sbar" title="${D.STATUSES.map(s => s + ' ' + c[s]).join(' · ')}">${D.STATUSES.map(s => c[s] ? `<span class="b-${s}" style="width:${100 * c[s] / t}%"></span>` : '').join('')}</div>` : ''; };
const stageIdx = (s, r) => s.stages.indexOf(r.stage);
function dots(s, r) {
  const i = stageIdx(s, r), done = r.status === 'done';
  return `<span class="dots" title="${esc(r.stage)}">${s.stages.map((g, k) => `<i class="${k < i || (k === i && done) ? 'ok' : k === i ? 'cur' : ''}" title="${esc(g)}"></i>`).join('')}</span>`;
}
const nextStage = (s, r) => { const i = stageIdx(s, r); return r.status === 'done' ? (r.stage || 'done') : i >= 0 && i < s.stages.length - 1 ? 'next: ' + s.stages[i + 1] : r.stage; };
const findS = id => D.streams.find(s => s.id === id);
const PROJ = 'PROJECT';
const itemHref = (s, id) => id === PROJ ? `#${s.id}/talk` : `#${s.id}/i/${encodeURIComponent(id)}`;
const plain = s => String(s).replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[`*]/g, '');

// ---------- icons (heroicons-style outline, inline so the page stays self-contained) ----------
const IC = {
  home: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  app: 'M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z',
  pipeline: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z',
  campaign: 'M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z',
  research: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
  refresh: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
  todo: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  doing: 'M13 10V3L4 14h7v7l9-11h-7z',
  waiting: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  blocked: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
  done: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  all: 'M4 6h16M4 10h16M4 14h16M4 18h16',
  skills: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z',
  logo: 'M4 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10-3a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1v-7z',
};
const ic = (k, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${IC[k] || IC.all}"/></svg>`;
const SCOL = { todo: 'c-gray', doing: 'c-blue', waiting: 'c-yellow', blocked: 'c-red', done: 'c-green' };
const statCards = (counts, total, allLabel) => `<div class="stats">${D.STATUSES.map(k => `<button class="stat" data-group="${k}">${ic(k, SCOL[k])}<dl><dt>${k}</dt><dd>${counts[k]}</dd></dl></button>`).join('')}<button class="stat on" data-group="">${ic('all', 'c-indigo')}<dl><dt>${allLabel}</dt><dd>${total}</dd></dl></button></div>`;

// ---------- sidebar (bg-gray-900) + white top bar + page header ----------
function side(cur, page) {
  const total = D.streams.reduce((a, s) => a + s.waiting.length, 0), single = D.mode === 'single';
  let h = `<div class="logo-row"><a class="brand" href="#overview"><span class="logo">${ic('logo', 'sm')}</span>Loopboard</a></div><nav>`;
  if (!single) h += `<a class="it${cur || page ? '' : ' on'}" href="#overview">${ic('home')}<span class="t">Overview</span>${total ? `<span class="wb">${total}</span>` : ''}</a>`;
  h += `<a class="it${page === 'skills' ? ' on' : ''}" href="#skills" title="Which skill to use for what">${ic('skills')}<span class="t">Skills</span><span class="cb">${SK.count}</span></a>`;
  for (const a of [...new Set(D.streams.map(s => s.area || 'Other'))]) {
    if (!single) h += `<div class="div"></div><div class="grp">${esc(a)}</div>`;
    for (const s of D.streams.filter(x => (x.area || 'Other') === a))
      h += `<a class="it${cur === s.id ? ' on' : ''}" href="#${s.id}" title="${esc(s.kind + ' · ' + s.phase)}">${ic(s.kind)}<span class="t">${esc(s.title)}</span>${s.waiting.length ? `<span class="wb">${s.waiting.length}</span>` : hd(s.health)}</a>`;
  }
  h += `</nav><div class="foot">${RO ? '' : `<a class="rb" data-rebuild href="#" title="Re-read every STATUS.md">${ic('refresh')}Rebuild hub</a>`}<div class="user"><span class="av">PH</span><div style="min-width:0"><b>${D.streams.length} workstream${D.streams.length === 1 ? '' : 's'}</b><span>Built ${esc(new Date(D.built).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}</span></div></div></div>`;
  $('#side').innerHTML = h;
}
function nav(s, tab, crumb, page) {
  const tabs = s ? [['', 'Board', s.rows.length], ['notes', 'Notes', s.waiting.length || ''], ['pages', 'Pages & visuals', s.pages.length], ['talk', 'Discussion', (s.thread[PROJ] || []).filter(x => x.state === 'open').length || ''], ...(s.rules ? [['rules', 'Rules', '']] : [])] : [];
  $('#top').innerHTML = `<div class="crumb">${page === 'skills' ? (crumb ? `<a href="#skills" style="color:inherit;text-decoration:none">Skills</a> / <b>${esc(crumb)}</b>` : '<b>Skills</b>') : s ? `<a href="${D.mode === 'single' ? '#' + s.id : '#overview'}" style="color:inherit;text-decoration:none">${esc(D.mode === 'single' ? 'Project' : s.area || 'Hub')}</a> / <b>${esc(s.title)}</b>${crumb ? ' / ' + esc(crumb) : ''}` : '<b>Overview</b>'}</div><input id="q" placeholder="Search${page === 'skills' ? ' skills' : s ? ' this board' : ' everything'}…" autocomplete="off" value="${esc(Q)}">${RO ? `<span class="chip s-waiting" title="Opened as a file: writes are off. Serve it with loopboard serve and open ${esc(D.url)}">Read-only</span>` : `<a class="btn big" data-rebuild href="#" title="Re-read every STATUS.md">${ic('refresh', 'sm')}Rebuild</a>`}`;
  $('#nav').innerHTML = crumb ? '' : page === 'skills'
    ? `<div class="ph"><div><h1>Skills catalog</h1><p>Which skill to use for what. Copy the command, paste it into your agent, or open a skill to read how it works.</p></div></div>`
    : s
    ? `<div class="ph"><div><h1>${hd(s.health)}${esc(s.title)}</h1><p>${inline(s.summary)} <span class="pname">· ${esc(s.kind)} · ${esc(s.phase)} · ${ageTxt(s)}</span></p></div></div><div class="tabs">${tabs.map(([k, l, n]) => `<a href="#${s.id}${k ? '/' + k : ''}" class="${tab === k ? 'on' : ''}">${l}${n !== '' ? `<i>${n}</i>` : ''}</a>`).join('')}</div>`
    : `<div class="ph"><div><h1>Overview</h1><p>Every workstream, read from its STATUS.md. Open a board, comment on any item, and agents pick it up from the inbox.</p>${SK.count ? '<p class="tip">Not sure which skill? <a href="#skills">Browse the Skills catalog →</a></p>' : ''}</div></div>`;
  $('#q').addEventListener('input', e => { Q = e.target.value; try { sessionStorage.setItem('hubQ', Q); } catch { } filter(); });
}

// ---------- overview ----------
function overview() {
  const all = D.streams.flatMap(s => s.rows.map(r => ({ s, r })));
  const c = Object.fromEntries(D.STATUSES.map(k => [k, all.filter(x => x.r.status === k).length]));
  const W = D.streams.filter(s => s.waiting.length), stale = D.streams.filter(s => s.age == null || s.age > 7);
  let h = statCards(c, all.length, 'all items');
  const inbox = D.streams.flatMap(s => Object.keys(s.thread).flatMap(id => openOf(s, id).map(x => ({ s, id, x }))));
  h += `<div class="field ${inbox.length ? 'wait' : ''}"><div class="fhead"><b>Agent inbox</b><span class="meta">${inbox.length} open instruction${inbox.length === 1 ? '' : 's'} / blockers / questions</span><span class="spacer"></span>${inbox.length ? copyBtn(INBOX_PROMPT, 'Copy prompt: work the inbox') : ''}</div>
${inbox.length ? `<div class="tablewrap"><table class="files"><tbody>${inbox.map(({ s, id, x }) => `<tr><td><span class="chip kk-${esc(x.kind)}">${esc(D.KINDS[x.kind])}</span></td><td><a href="${itemHref(s, id)}">${esc(s.title)} › ${id === PROJ ? 'project discussion' : esc(id)}</a><div class="meta">${esc(x.by)} · ${esc(when(x.at))}: ${esc(plain(x.text).slice(0, 140))}</div></td><td><div class="row">${copyBtn(agentPrompt(s, id), 'Copy agent prompt')}</div></td></tr>`).join('')}</tbody></table></div>` : '<p class="meta">Nothing open. Open any item, or the <b>Discussion</b> tab of a project, and add an <b>Instruction for agent</b> or a <b>Blocker</b>; it shows up here.</p>'}</div>`;
  if (stale.length || D.issues.length) h += `<div class="field wait"><div class="fhead"><b>Needs attention</b></div><ul class="issues">${stale.map(s => `<li><a href="#${s.id}">${esc(s.title)}</a> — ${ageTxt(s)}</li>`).join('')}${D.issues.map(i => `<li><code>${esc(i.file)}</code> ${inline(i.msg)}</li>`).join('')}</ul></div>`;
  h += `<div id="hits" hidden><h3 class="first">Matching items</h3><div class="tablewrap"><table class="board"><tbody>${all.map(({ s, r }) => `<tr data-text="${esc((s.title + ' ' + r.id + ' ' + plain(r.item) + ' ' + r.note + ' ' + r.stage).toLowerCase())}" data-group="${esc(r.status)}"><td class="n">${esc(r.id)}</td><td class="t">${s.items[r.id] ? `<a href="${itemHref(s, r.id)}">${inline(r.item)}</a>` : inline(r.item)}<div class="pname">${esc(s.title)}</div></td><td>${chip(r.status)}<div class="meta">${esc(nextStage(s, r))}</div></td><td>${dots(s, r)}</td></tr>`).join('')}</tbody></table></div></div>`;
  for (const a of [...new Set(D.streams.map(s => s.area || 'Other'))]) {
    h += `<h3 class="tilegrp">${esc(a)}</h3><div class="tiles">`;
    for (const s of D.streams.filter(x => (x.area || 'Other') === a)) {
      const now = s.now && s.rows.find(r => r.id === s.now);
      h += `<a class="tile" href="#${s.id}" data-text="${esc((s.title + ' ' + s.summary + ' ' + s.phase).toLowerCase())}"><div class="th">${hd(s.health)}<span style="flex:1">${esc(s.title)}</span>${s.waiting.length ? `<span class="wb">${s.waiting.length}</span>` : ''}</div><div class="meta">${esc(s.kind)} · ${esc(s.phase)} · ${ageTxt(s)}</div>${now ? `<div class="upwhen" style="margin-top:6px">Now: ${esc(now.id)} · ${esc(plain(now.item))}</div>` : ''}<p>${inline(s.summary)}</p>${sbar(s.counts)}</a>`;
    }
    h += '</div>';
  }
  h += `<h3>Waiting on you</h3>${W.length ? W.map(s => `<div class="field wait" data-text="${esc((s.title + ' ' + s.waiting.join(' ')).toLowerCase())}"><div class="fhead">${hd(s.health)}<b><a href="#${s.id}" style="color:inherit">${esc(s.title)}</a></b><span class="meta">${s.waiting.length}</span></div><div class="md"><ul>${s.waiting.map(w => `<li>${inline(w)}</li>`).join('')}</ul></div></div>`).join('') : '<p class="empty">nothing — all clear</p>'}`;
  return h;
}

// ---------- one board ----------
function board(s) {
  const now = s.now && s.rows.find(r => r.id === s.now);
  let h = '';
  const po = (s.thread[PROJ] || []).filter(x => x.state === 'open');
  if (po.length) h += `<div class="banner" style="background:#fef2f2;border-color:#fecaca"><b style="color:#b91c1c">Project discussion</b><strong>${po.length} open</strong><span class="meta">${esc(plain(po[po.length - 1].text).slice(0, 110))}</span><span class="spacer"></span><a class="btn pri" href="#${s.id}/talk">Open discussion</a></div>`;
  if (now) { const it = s.items[now.id]; h += `<div class="banner"><b>Now working on</b><strong>${esc(now.id)} · ${inline(now.item)}</strong>${chip(now.status)}<span class="meta">${esc(nextStage(s, now))}</span><span class="spacer"></span>${it ? `<a class="btn pri" href="${itemHref(s, now.id)}">Open details</a>` : ''}${it?.preview?.type === 'video' ? `<a class="btn" href="${esc(U(it.preview.abs))}" target="_blank">▶ Latest render</a>` : ''}</div>`; }
  if (s.waiting.length) h += `<details class="field wait"${s.waiting.length <= 3 ? ' open' : ''} style="margin-top:0;padding-top:10px"><summary><b>Waiting on you · ${s.waiting.length}</b> <span class="meta">${esc(plain(s.waiting[0]).slice(0, 90))}${s.waiting.length > 1 ? ' …' : ''}</span></summary><div class="md"><ul>${s.waiting.map(w => `<li>${inline(w)}</li>`).join('')}</ul></div></details>`;
    h += statCards(s.counts, s.rows.length, 'all');
  if (!s.rows.length) return h + '<p class="empty">No board rows yet.</p>';
  h += `<div class="orderbar" id="orderbar" hidden><b>Order changed</b><span class="meta">top = highest priority</span><span class="spacer"></span><button class="btn" id="undoorder">Undo</button><button class="btn pri" id="saveorder">Save order</button></div>`;
  if (!RO) h += `<div class="row" style="justify-content:flex-end;margin:-6px 0 8px"><span class="meta">Drag ⋮⋮ to reorder</span><button class="btn" id="addrow">+ Add item</button></div>`;
  h += `<div class="tablewrap"><table class="board"><thead><tr><th></th><th>ID</th><th>Item</th>${s.extraHead.map(x => `<th>${esc(x)}</th>`).join('')}<th>Status</th><th>Progress</th><th></th></tr></thead><tbody>`;
  for (const r of s.rows) {
    const it = s.items[r.id];
    const btns = [`<a class="btn${it ? ' pri' : ''}" href="${itemHref(s, r.id)}">${it ? 'Details' : 'Open'}</a>`,
      it?.preview?.type === 'video' ? `<a class="btn" href="${esc(U(it.preview.abs))}" target="_blank" title="Play ${esc(it.preview.name)}">▶</a>` : '',
      it?.folder ? openBtn('reveal', it.folder.abs, 'Folder') : '',
      ...(it?.urls || []).slice(0, 1).map(u => `<a class="btn" href="${esc(u.url)}" target="_blank" rel="noopener">${esc(u.label.slice(0, 14))}</a>`)].join('');
    const iso = String(r.date).slice(0, 10), future = iso > new Date().toISOString().slice(0, 10);
    const when = /^\d{4}-\d\d-\d\d/.test(iso) ? `<div class="upwhen">${r.status === 'done' ? 'Done ' : future ? 'Due ' : ''}${esc(day(iso))}</div>` : '';
    const oc = openOf(s, r.id).length, tc = (s.thread[r.id] || []).filter(x => x.kind !== 'edit').length;
    h += `<tr data-id="${esc(r.id)}" draggable="${!RO}" data-text="${esc((r.id + ' ' + plain(r.item) + ' ' + plain(r.note) + ' ' + plain(r.next) + ' ' + r.stage + ' ' + r.extra.join(' ')).toLowerCase())}" data-group="${esc(r.status)}">
<td class="grip" title="${RO ? '' : 'Drag to reorder'}">${RO ? '' : '⋮⋮'}</td><td class="n">${esc(r.id)}${tc ? `<div><a class="cbadge${oc ? ' open' : ''}" href="${itemHref(s, r.id)}" title="${oc} open of ${tc} comments">💬 ${oc || tc}</a></div>` : ''}</td><td class="t">${when}<div><a href="${itemHref(s, r.id)}">${inline(r.item)}</a></div><div class="meta">${inline(r.note)}</div></td>
${r.extra.map(x => `<td>${inline(x)}</td>`).join('')}<td>${chip(r.status)}<div class="meta">${r.next ? inline(r.next) : esc(nextStage(s, r))}</div></td><td>${dots(s, r)}<div class="meta">${esc(r.stage)}</div></td><td><div class="row">${btns}</div></td></tr>`;
  }
  return h + '</tbody></table></div>';
}

// ---------- one item ----------
function detail(s, id) {
  const it = s.items[id], r = s.rows.find(x => x.id === id) || { id, item: it?.title || id, stage: '', status: '', note: '', next: '', date: '', extra: [] };
  const ids = s.rows.map(x => x.id), k = ids.indexOf(id);
  const prev = ids[k - 1], next = ids[k + 1];
  let h = `<div class="dtop"><a class="btn" href="#${s.id}">← ${esc(s.title)}</a><span class="spacer"></span>${prev ? `<a class="btn" data-prev href="${itemHref(s, prev)}">‹ Prev</a>` : ''}${next ? `<a class="btn" data-next href="${itemHref(s, next)}">Next ›</a>` : ''}</div>`;
  h += `<div class="dhead"><span class="num">${esc(id)}</span><div class="dtitle"><h2>${inline(r.item)}</h2><p class="meta">${[r.stage, r.date && r.date !== '—' ? day(r.date) : '', ...r.extra.map(plain)].filter(Boolean).map(esc).join(' · ')}</p></div>${chip(r.status)}<span class="meta">${r.next ? inline(r.next) : esc(nextStage(s, r))}</span></div>`;
  const i = stageIdx(s, r);
  h += `<ol class="steps">${s.stages.map((g, n) => `<li class="${n < i || (n === i && r.status === 'done') ? 'ok' : n === i ? 'next' : ''}">${esc(g)}</li>`).join('')}</ol>`;
  if (!it) return h + `<div class="split"><div class="player"><div class="noplay wide">no files linked</div><p class="meta">Link files by adding <code>### ${esc(id)}</code> under <code>## Items</code> in <code>${esc(s.folder === '.' ? 'STATUS.md' : s.folder + '/STATUS.md')}</code>.</p></div><div>${threadPanel(s, id, r)}</div></div>`;
  const pv = it.preview;
  const left = pv ? (pv.type === 'video' ? `<figure class="vid"><video controls preload="metadata" src="${esc(U(pv.abs))}#t=0.1"></video><figcaption>${esc(pv.name)}</figcaption></figure>`
    : pv.type === 'image' ? `<img class="pv" src="${esc(U(pv.abs))}" data-zoom alt=""><figcaption>${esc(pv.name)}</figcaption>`
      : pv.type === 'html' ? `<iframe src="${esc(U(pv.abs))}" loading="lazy"></iframe><figcaption>${esc(pv.name)}</figcaption>` : `<div class="noplay">${esc(pv.name)}</div>`) + `<div class="row">${pathActions(pv.abs)}</div>`
    : `<div class="noplay wide">no preview yet</div>`;
  let right = threadPanel(s, id, r) + '<h3>Details</h3>';
  if (r.note || it.notes) right += `<div class="field md">${r.note ? `<p>${inline(r.note)}</p>` : ''}${it.notes ? md(it.notes) : ''}</div>`;
  if (it.urls.length) right += `<div class="field"><div class="fhead"><b>Links</b></div><div class="row">${it.urls.map(u => `<a class="btn pri" href="${esc(u.url)}" target="_blank" rel="noopener">${esc(u.label)}</a>${copyBtn(u.url, 'Copy link')}`).join('')}</div></div>`;
  if (it.kit) {
    right += `<h3 class="first">Kit <small class="meta">${esc(it.kit.rel)}</small></h3>`;
    if (it.kit.top) right += `<div class="field md">${md(it.kit.top)}</div>`;
    right += it.kit.fields.map(f => `<div class="field"><div class="fhead"><b>${esc(f.label)}</b><span class="meta">${f.text.length} chars</span>${copyBtn(f.text)}</div><pre>${esc(f.text)}</pre></div>`).join('');
    right += `<div class="row" style="margin-bottom:10px">${pathActions(it.kit.abs)}</div>`;
  }
  for (const c of it.copies) right += `<div class="field"><div class="fhead"><b>${esc(c.label)}</b>${copyBtn(c.text)}</div><div class="fval">${esc(c.text)}</div></div>`;
  if (it.docs.length) right += `<h3>Files</h3><div class="tablewrap"><table class="files"><tbody>${it.docs.map(d => `<tr><td>${esc(d.label)}</td><td class="mono">${esc(d.rel)}${d.exists ? '' : ' <span class="warn">missing</span>'}</td><td><div class="row">${pathActions(d.abs, { dir: d.isDir })}</div></td></tr>`).join('')}</tbody></table></div>`;
  if (it.cmds.length) right += `<h3>Commands</h3><div class="tablewrap"><table class="files"><tbody>${it.cmds.map(c => `<tr><td>${esc(c.label)}</td><td class="mono">${esc(c.cmd)}</td><td><div class="row">${copyBtn(c.full)}</div></td></tr>`).join('')}</tbody></table></div>`;
  if (it.folder) {
    const f = it.folder, vids = f.files.filter(x => /\.(mp4|mov|webm|m4v)$/i.test(x.name)), imgs = f.files.filter(x => /\.(png|jpe?g|gif|webp|svg)$/i.test(x.name)).slice(0, 24);
    right += `<h3>Folder <small class="meta">${esc(f.rel)}</small></h3><div class="row" style="margin-bottom:10px">${pathActions(f.abs, { dir: true })}</div>`;
    if (vids.length > 1) right += `<details><summary>${vids.length} videos</summary>${vids.slice(0, 8).map(v => `<figure class="vid"><video controls preload="none" src="${esc(U(v.abs))}" style="max-height:300px"></video><figcaption>${esc(v.name)}</figcaption></figure>`).join('')}</details>`;
    if (imgs.length) right += `<details${vids.length ? '' : ' open'}><summary>${imgs.length} images</summary><div class="grid">${imgs.map(x => `<figure><img loading="lazy" src="${esc(U(x.abs))}" data-zoom alt=""><figcaption>${esc(x.name)}</figcaption></figure>`).join('')}</div></details>`;
    right += `<details><summary>All ${f.files.length} files</summary><div class="tablewrap"><table class="files"><tbody>${f.files.slice(0, 80).map(x => `<tr><td class="mono">${esc(x.name)}</td><td class="meta">${new Date(x.mtime).toISOString().slice(0, 16).replace('T', ' ')}</td><td><div class="row">${pathActions(x.abs)}</div></td></tr>`).join('')}</tbody></table></div></details>`;
  }
  return h + `<div class="split"><div class="player">${left}</div><div>${right}</div></div>`;
}

const notes = s => `<p class="meta" style="margin-bottom:12px">${copyBtn(s.statusAbs, 'Copy STATUS.md path')} ${openBtn('editor', s.statusAbs, 'Edit STATUS.md')} ${openBtn('reveal', s.dirAbs, esc(s.folder) + '/')} <span class="meta">${ageTxt(s)}</span></p>` +
  [['Waiting on you', s.waitMd, 'wait'], ['Now', s.nowMd], ['Next', s.nextMd], ['Done recently', s.doneMd], ['Links', s.linksMd]]
    .map(([l, m, c]) => `<div class="field md ${c || ''}"><div class="fhead"><b>${l}</b></div>${md(m)}</div>`).join('');
const pages = s => s.pages.length ? `<div class="pgrid">${s.pages.map(p => `<a class="page" href="${esc(U(p.abs))}" target="_blank" data-text="${esc(p.rel.toLowerCase())}">${p.svg ? `<img loading="lazy" src="${esc(U(p.abs))}" alt="">` : '<div class="textcard">HTML<small>page</small></div>'}${esc(p.rel)}</a>`).join('')}</div>` : '<p class="empty">No .html or .svg pages in this folder.</p>';
const rules = s => `<div class="row" style="margin-bottom:12px">${pathActions(s.rules.abs)}</div><div class="field md">${md(s.rules.md)}</div>`;

// ---------- interaction ----------
async function api(op, body) {
  const r = await fetch('/api/' + op, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Hub-Token': D.token }, body: JSON.stringify(body || {}) });
  const j = await r.json().catch(() => ({ error: 'server said ' + r.status }));
  if (!r.ok || j.error) throw new Error(j.error || 'failed');
  return j;
}
function reloadKeep(msg = 'Saved ✓') { try { sessionStorage.setItem('hubY', String($('#scroll').scrollTop)); sessionStorage.setItem('hubSaid', msg); } catch { } location.reload(); }
function act(op, p) {
  if (RO) return say('Read-only: serve the hub (loopboard serve) and open ' + D.url, 6000);
  say('Saving…', 8000); api(op, p).then(() => reloadKeep(), e => say('Not saved: ' + e.message, 7000));
}
const agentPrompt = (s, id) => `Use the hub-work skill: /loopboard:hub-work ${s.id} ${id}`;
const INBOX_PROMPT = 'Use the hub-work skill: /loopboard:hub-work inbox';
const openOf = (s, id) => (s.thread[id] || []).filter(x => x.state === 'open');
const when = iso => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
function comment(s, x) {
  if (x.kind === 'edit') return `<div class="tedit">${esc(when(x.at))} · ${esc(x.by)} changed <b>${esc(x.field)}</b>${x.field === 'order' ? '' : `: ${esc(x.from || '—')} → ${esc(x.to)}`}</div>`;
  return `<div class="tc k-${esc(x.kind)} ${x.state === 'done' ? 'tdone' : ''}"><div class="fhead"><span class="chip kk-${esc(x.kind)}">${esc(D.KINDS[x.kind] || x.kind)}</span><b>${esc(x.by)}</b><span class="meta">${esc(when(x.at))} · ${esc(x.cid)}</span>${x.state === 'open' ? '<span class="chip s-blocked">open</span>' : x.state === 'done' ? '<span class="chip s-done">resolved</span>' : ''}
<span class="spacer"></span>${RO ? '' : `<button class="btn" data-reply="${esc(x.cid)}">Reply</button>`}${RO ? '' : x.state === 'open' ? `<button class="btn" data-resolve="${esc(x.cid)}">Resolve</button>` : x.state === 'done' ? `<button class="btn" data-reopen="${esc(x.cid)}">Reopen</button>` : ''}</div>
<div class="md">${md(x.text)}</div>${x.resolved ? `<p class="meta">✓ resolved ${esc(when(x.resolved.at))} by ${esc(x.resolved.by)}${x.resolved.note ? ': ' + inline(x.resolved.note) : ''}</p>` : ''}
${x.replies.length ? `<div class="treplies">${x.replies.map(r => comment(s, r)).join('')}</div>` : ''}</div>`;
}
function threadPanel(s, id, r) {
  const t = s.thread[id] || [];
  const intro = r ? '' : `<div class="field"><div class="fhead"><b>Project discussion</b><span class="meta">instructions, blockers, questions and decisions about ${esc(s.title)} as a whole, not one board item</span><span class="spacer"></span>${copyBtn(agentPrompt(s, id), 'Copy agent prompt')}</div></div>`;
  const sel = (f, list, cur) => `<label class="meta">${f} <select data-set="${f}">${list.map(v => `<option${v === cur ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></label>`;
  return intro + (!r ? '' : `<div class="field"><div class="fhead"><b>Actions</b><span class="spacer"></span>${copyBtn(agentPrompt(s, id), 'Copy agent prompt')}</div>
<div class="row"${RO ? ' hidden' : ''}>${sel('status', D.STATUSES, r.status)}${sel('stage', s.stages, r.stage)}
<button class="btn" data-edit="item">Edit title</button><button class="btn" data-edit="next">Edit next step</button><button class="btn" data-edit="note">Edit note</button><button class="btn" data-edit="date">Edit date</button></div>
${RO ? '<p class="meta">Read-only view. Serve the hub to change rows and comment.</p>' : ''}<p class="meta" style="margin-top:6px">Paste the agent prompt into Claude Code: the agent reads this row, its files and every open comment below, does the work, replies here and updates the row.</p></div>`) + `
<h3 class="first">Thread <small class="meta">${t.filter(x => x.kind !== 'edit').length} comments · ${openOf(s, id).length} open</small></h3>
${t.length ? t.map(x => comment(s, x)).join('') : '<p class="empty">No comments yet. Add an instruction, a blocker, or an answer for the agent.</p>'}
${RO ? `<div class="field"><p class="meta">Read-only: this page was opened as a file. Run <code>loopboard serve</code> (or <code>loopboard service install</code>) and open <b>${esc(D.url)}</b> to comment.</p></div>` : ''}
<div class="field" id="cform"${RO ? ' hidden' : ''}><div class="fhead"><b id="cformlabel">Add a comment</b><span class="spacer"></span><button class="btn" id="cancelre" hidden>Cancel reply</button></div>
<div class="row"><select id="ckind">${Object.entries(D.KINDS).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></div>
<textarea id="ctext" rows="4" placeholder="e.g. Blocked: the API key is missing. Next step: add it to the env file, rerun the tests, then update the row and tell me."></textarea>
<div class="row"><button class="btn pri" id="cadd">Add comment</button><span class="meta">Instruction / Blocker / Question stay open until resolved.</span></div></div>`;
}
function wireDetail(s, id, r) {
  let re = '';
  const m = $('#main');
  m.querySelectorAll('[data-set]').forEach(el => el.addEventListener('change', () => act('set', { s: s.id, i: id, f: el.dataset.set, v: el.value })));
  m.querySelectorAll('[data-edit]').forEach(el => el.addEventListener('click', () => {
    const f = el.dataset.edit, cur = { item: plain(r.item), next: plain(r.next), note: plain(r.note), date: r.date }[f];
    const v = prompt(`New ${f === 'item' ? 'title' : f === 'next' ? 'next step' : f} for ${id}:`, cur || ''); if (v != null && v !== cur) act('set', { s: s.id, i: id, f, v });
  }));
  m.querySelectorAll('[data-resolve]').forEach(el => el.addEventListener('click', () => { const n = prompt('Resolved — what was done? (optional)', ''); if (n != null) act('resolve', { s: s.id, c: el.dataset.resolve, x: n }); }));
  m.querySelectorAll('[data-reopen]').forEach(el => el.addEventListener('click', () => act('reopen', { s: s.id, c: el.dataset.reopen })));
  m.querySelectorAll('[data-reply]').forEach(el => el.addEventListener('click', () => { re = el.dataset.reply; $('#cformlabel').textContent = 'Reply to ' + re; $('#ckind').value = 'answer'; $('#cancelre').hidden = false; $('#ctext').focus(); }));
  $('#cancelre')?.addEventListener('click', () => { re = ''; $('#cformlabel').textContent = 'Add a comment'; $('#cancelre').hidden = true; });
  $('#cadd')?.addEventListener('click', () => { const x = $('#ctext').value.trim(); if (!x) return $('#ctext').focus(); try { sessionStorage.setItem('hubDraft', ''); } catch { } act('comment', { s: s.id, i: id, k: $('#ckind').value, x, re }); });
}
function wireBoard(s) {
  const tb = $('#main tbody'); if (!tb) return;
  let drag = null;
  if (RO) return;
  tb.querySelectorAll('tr[data-id]').forEach(tr => {
    tr.addEventListener('dragstart', e => { drag = tr; tr.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
    tr.addEventListener('dragend', () => { tr.classList.remove('dragging'); drag = null; });
    tr.addEventListener('dragover', e => { e.preventDefault(); if (!drag || drag === tr) return; const r = tr.getBoundingClientRect(); tb.insertBefore(drag, e.clientY > r.top + r.height / 2 ? tr.nextSibling : tr); $('#orderbar').hidden = false; });
  });
  $('#saveorder')?.addEventListener('click', () => act('order', { s: s.id, ids: [...tb.querySelectorAll('tr[data-id]')].map(t => t.dataset.id).join(',') }));
  $('#undoorder')?.addEventListener('click', () => route());
  $('#addrow')?.addEventListener('click', () => {
    const id = prompt('ID for the new item (e.g. ' + (s.rows[s.rows.length - 1]?.id || 'X-1') + '-next):'); if (!id) return;
    const x = prompt('Title for ' + id + ':'); if (x) act('addrow', { s: s.id, i: id.trim(), x });
  });
}

// ---------- routing, search, filters ----------
let Q = '', G = '', R = '';
try { R = sessionStorage.getItem('hubR') || ''; } catch { }

// ---------- skills catalog: every skill is untrusted text, so it is only ever escaped (esc) or run through md() ----------
const SK = D.skills || { items: [], count: 0, roles: [], sources: {} };
const skById = id => SK.items.find(k => k.id === id);
const skSrc = k => `<span class="chip sk-${esc(k.source)}">${esc(k.sourceLabel)}</span>`;
const kb = n => n < 1024 ? n + ' B' : (n / 1024).toFixed(1) + ' KB';
function skillCard(k) {
  return `<article class="skcard" data-text="${esc((k.name + ' ' + k.description).toLowerCase())}" data-role="${esc(k.role)}">
<div class="skh"><a class="skn" href="#skills/${encodeURIComponent(k.id)}">${esc(k.name)}</a>${skSrc(k)}<span class="spacer"></span>${copyBtn(k.copy, 'Copy')}</div>
<p class="sks">${esc(k.summary || 'No description.')}</p>
${k.hint ? `<div class="skhint"><span>Arguments</span><code>${esc(k.hint)}</code></div>` : ''}
${k.when ? `<div class="skwhen"><b>When to use</b><p>${esc(k.when)}</p></div>` : ''}
<div class="skfoot"><code>${esc(k.copy)}</code><a href="#skills/${encodeURIComponent(k.id)}">Details →</a></div></article>`;
}
function skillsPage() {
  if (!SK.count) return `<div class="field"><p class="meta">No skills found. The Loopboard plugin ships its own in <code>skills/</code>; project skills live in <code>.claude/skills/&lt;name&gt;/SKILL.md</code>${SK.userEnabled === false ? ' (user skills are hidden: <code>skills.user</code> is false)' : ', user skills in <code>~/.claude/skills</code>'}.</p></div>`;
  const chips = [{ role: '', count: SK.count }, ...SK.roles].map(r => `<button class="rchip${r.role === R ? ' on' : ''}" data-rchip="${esc(r.role)}">${esc(r.role || 'All')}<i>${r.count}</i></button>`).join('');
  let h = `<div class="rchips">${chips}</div>`;
  for (const { role } of SK.roles) {
    const list = SK.items.filter(k => k.role === role);
    if (role !== 'Other') { h += `<section class="skgrp"><h3>${esc(role)} <small class="meta">${list.length}</small></h3><div class="skgrid">${list.map(skillCard).join('')}</div></section>`; continue; }
    for (const src of ['project', 'user', 'extra', 'plugin']) {
      const sub = list.filter(k => k.source === src);
      if (sub.length) h += `<section class="skgrp" data-role="Other"><h3>Other · ${esc(sub[0].sourceLabel)} <small class="meta">${sub.length}</small></h3><div class="skgrid">${sub.map(skillCard).join('')}</div></section>`;
    }
  }
  h += `<p class="empty" id="skempty" hidden>No skill matches.</p>`;
  const bits = Object.entries(SK.sources || {}).filter(([, n]) => n).map(([k, n]) => `${esc(k)} ${n}`).join(' · ');
  h += `<p class="meta sknote">${SK.count} skill${SK.count === 1 ? '' : 's'}${bits ? ' (' + bits + ')' : ''}${SK.capped ? ' · the catalog stops at 500 skills' : ''}${SK.userEnabled === false ? ' · user skills are hidden (<code>skills.user</code> is false)' : ''}. Same list in the terminal: <code>loopboard skills</code>.</p>`;
  return h;
}
function skillDetail(k) {
  if (!k) return `<p class="dtop"><a class="btn" href="#skills">← Skills</a></p><div class="field"><p class="meta">No skill with that name in the catalog.</p></div>`;
  const files = [['references', k.references || []], ['scripts', k.scripts || []]].filter(([, l]) => l.length);
  return `<div class="dtop"><a class="btn" href="#skills">← Skills</a></div>
<div class="dhead"><div class="dtitle"><h2>${esc(k.name)}</h2><p class="meta">${skSrc(k)} <span class="chip">${esc(k.role)}</span> <span class="mono">${esc(k.shown)}</span></p></div>${copyBtn(k.copy, 'Copy ' + k.copy)}${openBtn('editor', k.file, 'Open in editor')}${openBtn('reveal', k.dir, 'Reveal folder')}</div>
<div class="field" style="margin-top:20px"><div class="fhead"><b>About</b></div><p class="fval">${esc(k.summary || 'No description in the SKILL.md frontmatter.')}</p>${k.when ? `<div class="skwhen"><b>When to use</b><p>${esc(k.when)}</p></div>` : ''}
${k.hint ? `<div class="skhint"><span>Arguments</span><code>${esc(k.hint)}</code></div>` : ''}<div class="row" style="margin-top:12px"><code>${esc(k.copy)}</code></div></div>
${files.map(([kind, l]) => `<div class="field"><div class="fhead"><b>${kind}/</b><span class="meta">${l.length} file${l.length === 1 ? '' : 's'}</span></div><div class="tablewrap"><table class="files"><tbody>${l.map(f => `<tr><td>${esc(f.name)}</td><td class="meta">${esc(kb(f.size))}</td><td><div class="row">${openBtn('editor', f.abs, 'Editor')}</div></td></tr>`).join('')}</tbody></table></div></div>`).join('')}
<div class="panel md skbody"><div class="fhead"><b>SKILL.md</b>${k.bodyTruncated ? '<span class="warn">shortened: the file is larger than the page keeps (200 KB per skill)</span>' : ''}</div>${md(k.body)}</div>`;
}

try { Q = sessionStorage.getItem('hubQ') || ''; } catch { }
function route() {
  const [sid, tab = '', a, b] = decodeURIComponent(location.hash.slice(1) || (D.mode === 'single' && D.streams[0] ? D.streams[0].id : 'overview')).split('/');
  const isSk = sid === 'skills', s = isSk ? null : findS(sid);
  side(s?.id, isSk ? 'skills' : ''); G = '';
  if (isSk) {
    const k = tab ? skById(tab) : null;
    nav(null, '', tab ? (k ? k.name : tab) : '', 'skills');
    $('#main').innerHTML = tab ? skillDetail(k) : skillsPage();
    document.title = (k ? k.name + ' · ' : '') + 'Skills · Loopboard';
    document.querySelectorAll('[data-rchip]').forEach(btn => btn.addEventListener('click', () => {
      R = btn.dataset.rchip; try { sessionStorage.setItem('hubR', R); } catch { }
      document.querySelectorAll('[data-rchip]').forEach(x => x.classList.toggle('on', x === btn)); filter();
    }));
  } else if (!s) { nav(null, ''); $('#main').innerHTML = overview(); document.title = 'Loopboard'; }
  else {
    const t = tab === 'i' ? 'i' : ['notes', 'pages', 'rules', 'talk'].includes(tab) ? tab : '';
    nav(s, t === 'i' ? '' : t, t === 'i' ? [a, b].filter(Boolean).join('/') : '');
    const iid = [a, b].filter(Boolean).join('/');
    $('#main').innerHTML = t === 'i' ? detail(s, iid) : t === 'talk' ? threadPanel(s, PROJ, null) : t === 'notes' ? notes(s) : t === 'pages' ? pages(s) : t === 'rules' && s.rules ? rules(s) : board(s);
    if (t === 'talk') wireDetail(s, PROJ, { item: '', next: '', note: '', date: '' }); else if (t === 'i') wireDetail(s, iid, s.rows.find(x => x.id === iid) || { item: iid, next: '', note: '', date: '' }); else if (!t) wireBoard(s);
    document.title = s.title + ' · Loopboard';
  }
  document.querySelectorAll('.stat').forEach(btn => btn.addEventListener('click', () => { G = btn.dataset.group; document.querySelectorAll('.stat').forEach(x => x.classList.toggle('on', x === btn)); filter(); }));
  filter(); $('#scroll').scrollTo(0, 0);
}
function filter() {
  const w = Q.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = $('#hits'); if (hits) hits.hidden = !w.length && !G;
  document.querySelectorAll('[data-text]').forEach(e => { e.hidden = !(w.every(x => e.dataset.text.includes(x)) && (!G || !e.dataset.group || e.dataset.group === G) && (!R || !e.dataset.role || e.dataset.role === R)); });
  const grps = document.querySelectorAll('.skgrp');
  grps.forEach(g => { g.hidden = !g.querySelector('.skcard:not([hidden])'); });
  const none = $('#skempty'); if (none) none.hidden = !grps.length || [...grps].some(g => !g.hidden);
  if (hits) document.querySelectorAll('.tiles, .tilegrp').forEach(e => e.hidden = !!(w.length || G));
}
const lb = $('#lb'), toast = $('#toast');
function copyText(s, btn) {
  const done = () => { const o = btn.textContent; btn.textContent = 'Copied ✓'; btn.classList.add('done'); toast.textContent = 'Copied to clipboard'; toast.classList.add('on'); setTimeout(() => { btn.textContent = o; btn.classList.remove('done'); toast.classList.remove('on'); }, 1400); };
  const fb = () => { const t = document.createElement('textarea'); t.value = s; t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); done(); } catch { } t.remove(); };
  if (navigator.clipboard && isSecureContext) navigator.clipboard.writeText(s).then(done, fb); else fb();
}
document.addEventListener('click', e => {
  const t = e.target;
  if (t.matches('img[data-zoom]')) { lb.querySelector('img').src = t.src; lb.classList.add('on'); } else if (t === lb || lb.contains(t)) lb.classList.remove('on');
  const c = t.closest('[data-copy]'); if (c) { e.preventDefault(); copyText(c.dataset.copy, c); }
  if (t.closest('[data-rebuild]')) { e.preventDefault(); if (RO) return say('Read-only: run loopboard build', 4000); say('Rebuilding…', 8000); api('rebuild').then(() => reloadKeep('Rebuilt ✓'), x => say('Rebuild failed: ' + x.message, 7000)); return; }
  const o = t.closest('[data-open]');
  if (o) api('open', { how: o.dataset.open, path: o.dataset.path }).then(() => say(o.dataset.open === 'editor' ? 'Opened in your editor' : 'Revealed'), x => say(x.message, 6000));
});
function say(msg, ms = 2200) { toast.textContent = msg; toast.classList.add('on'); clearTimeout(say.t); say.t = setTimeout(() => toast.classList.remove('on'), ms); }
try { const m = sessionStorage.getItem('hubSaid'); if (m) { sessionStorage.removeItem('hubSaid'); setTimeout(() => say(m), 300); } } catch { }
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') lb.classList.remove('on');
  if (e.target.matches && e.target.matches('input,textarea')) return;
  if (e.key === '/') { e.preventDefault(); $('#q')?.focus(); }
  if (e.key === 'ArrowLeft' && $('[data-prev]')) location.hash = $('[data-prev]').getAttribute('href');
  if (e.key === 'ArrowRight' && $('[data-next]')) location.hash = $('[data-next]').getAttribute('href');
});
addEventListener('hashchange', route); route();
// live: reload every 30 s so the page follows rebuilds; never while a video plays, the zoom view is open or you are typing
setInterval(() => {
  if (document.hidden || !$('#orderbar')?.hidden && $('#orderbar') || ($('#ctext')?.value || '').trim() || lb.classList.contains('on') || document.activeElement?.matches('input,textarea') || [...document.querySelectorAll('video')].some(v => !v.paused)) return;
  try { sessionStorage.setItem('hubY', String($('#scroll').scrollTop)); } catch { } location.reload();
}, 30000);
try { const y = sessionStorage.getItem('hubY'); if (y !== null) { sessionStorage.removeItem('hubY'); addEventListener('load', () => $('#scroll').scrollTo(0, +y)); } } catch { }
