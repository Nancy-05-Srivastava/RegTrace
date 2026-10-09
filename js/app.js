// RegTrace console: UI controller. Wires the engine (pure logic) to the views and the 3D graph.
import { buildBank, LAYERS, LAYER_LABEL, EDGE_LABEL, SCALES, exportBank, importBank } from './bank.js';
import { Engine, CFG } from './engine.js';
import { Graph3D, TYPE_COLOR, REG_COLOR, heat } from './graph3d.js';
import { CIRCULARS, getCircular } from './corpus.js';
import { runBenchmark } from './benchmark.js';
import { fmtParam, TOPIC_LABELS, splitClauses, detectRegulator, findDate } from './text.js';
import { Tour } from './tour.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (x) => `${Math.round(x * 100)}%`;
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const colorOf = (n) => (n?.type === 'regulation' ? REG_COLOR[n.regulator] : TYPE_COLOR[n?.type] || TYPE_COLOR.clause);
const TYPE_NAME = { regulation: 'Obligation', policy: 'Policy', process: 'Process', system: 'System', api: 'API', datastore: 'Data store', control: 'Control', evidence: 'Evidence', team: 'Team', clause: 'Clause' };

const S = { source: null, result: null, tickets: [], seq: 1, audit: [], links: [], linkState: new Map(), view: 'overview', selected: null };

function toast(msg, ms = 3200) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), ms);
}
function download(name, text, type = 'text/plain') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function label(id) {
  if (id?.startsWith('cl_')) return `Clause ${id.slice(3)}`;
  const n = S.bank.nodes.get(id);
  return n ? (n.code ? `${n.code} ${n.name}` : n.name) : id;
}

// ------------------------------------------------------------------ audit (hash chain)
async function sha256(s) {
  if (crypto?.subtle) {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
  }
  let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, '0').repeat(8);
}
async function log(action, detail) {
  const prev = S.audit.length ? S.audit[S.audit.length - 1].hash : '0'.repeat(64);
  const e = { i: S.audit.length, at: new Date().toISOString(), actor: 'compliance.analyst (demo)', action, detail, prev };
  e.hash = await sha256(JSON.stringify([e.i, e.at, e.actor, e.action, e.detail, e.prev]));
  S.audit.push(e);
  if (S.view === 'audit') renderAudit();
}
async function verifyChain() {
  let ok = true, prev = '0'.repeat(64);
  for (const e of S.audit) {
    const h = await sha256(JSON.stringify([e.i, e.at, e.actor, e.action, e.detail, e.prev]));
    e.bad = h !== e.hash || e.prev !== prev;
    if (e.bad) ok = false;
    prev = e.hash;
  }
  renderAudit();
  toast(ok ? `✔ Chain verified: ${S.audit.length} entries intact.` : '✖ Chain broken – an entry was altered.');
}

// ------------------------------------------------------------------ navigation
function show(view) {
  S.view = view;
  $$('.sidenav button').forEach((b) => b.classList.toggle('active', b.dataset.nav === view));
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${view}`));
  if (view === 'graph') { S.graph.mount($('#stage-graph')); renderGraphPanel(); }
  if (view === 'overview') S.graph.mount($('#stage-hero'));
  if (view === 'crossmap') renderCrossmap();
  if (view === 'tickets') renderTickets();
  if (view === 'audit') renderAudit();
  requestAnimationFrame(() => S.graph.resize());
}

// ------------------------------------------------------------------ overview
function renderOverview() {
  const counts = {};
  for (const n of S.bank.list) counts[n.type] = (counts[n.type] || 0) + 1;
  const obs = S.engine.observedEdges.length;
  $('#hero-stats').innerHTML = [
    [S.bank.list.length, 'graph nodes'], [S.bank.edges.length, 'dependencies'], [counts.regulation, 'MAS + RBI obligations'],
  ].map(([b, s]) => `<div><b>${b}</b><span>${s}</span></div>`).join('');
  const max = Math.max(...LAYERS.map((l) => counts[l] || 0));
  $('#layer-bars').innerHTML = LAYERS.map((l) => `<div class="bar-row"><span>${LAYER_LABEL[l]}</span><div class="track"><div class="fill" style="width:${((counts[l] || 0) / max) * 100}%;background:${l === 'regulation' ? 'linear-gradient(90deg,#ff4d6d,#ff9f43)' : TYPE_COLOR[l]}"></div></div><b>${counts[l] || 0}</b></div>`).join('')
    + `<p class="muted" style="margin:10px 0 0;font-size:12px">${obs} documented links visible to RegTrace · ${S.bank.edges.length - obs} undocumented (held out for ground truth)</p>`;
  const docs = {};
  for (const o of S.engine.obligations) docs[`${o.regulator}|${o.doc}`] = (docs[`${o.regulator}|${o.doc}`] || 0) + 1;
  $('#lib-summary').innerHTML = Object.entries(docs).sort().map(([k, v]) => { const [r, d] = k.split('|'); return `<div class="lib-row"><span><span class="reg ${r}">${r}</span> ${esc(d)}</span><b class="mono">${v}</b></div>`; }).join('');
  $('#chip-graph').innerHTML = `<i class="dot ok"></i>${S.bank.list.length} nodes · ${S.bank.edges.length} links`;
  const m = S.bank.meta || {};
  const hid = S.bank.edges.filter((e) => e.hidden).length;
  $('#bank-title').textContent = m.source === 'imported' ? `${m.name} (imported)` : `${bankName()} · seed ${m.seed} · ${m.scale}`;
  $('#bank-desc').textContent = m.source === 'imported'
    ? `Imported dependency map: ${S.bank.list.length} items, ${S.bank.edges.length} links${hid ? `, ${hid} marked undocumented` : ''}.`
    : `A fictional bank operating in Singapore and India, generated from seed ${m.seed}. ${hid} of its ${S.bank.edges.length} links (${Math.round((hid / S.bank.edges.length) * 100)}%) are left out of the documented map RegTrace sees, so ground truth can test it honestly. Change any of this in Data studio.`;
}

// ------------------------------------------------------------------ analyse
function renderDemoList() {
  $('#demo-list').innerHTML = CIRCULARS.map((c) => `<button class="demo" data-id="${c.id}"><span class="reg ${c.regulator}">${c.regulator}</span><span><b>${esc(c.title)}</b><small>${esc(c.ref)} · effective ${fmtDate(findDate(c.text))}</small></span></button>`).join('');
  $$('#demo-list .demo').forEach((b) => b.addEventListener('click', () => {
    const c = getCircular(b.dataset.id);
    setSource({ text: c.text, title: c.title, regulator: c.regulator, id: c.id, name: c.ref });
  }));
}

function setSource(src) {
  S.source = src;
  $$('#demo-list .demo').forEach((b) => b.classList.toggle('on', b.dataset.id === src.id));
  const reg = src.regulator || detectRegulator(src.text);
  $('#sel-reg').value = src.regulator || '';
  const eff = findDate(src.text);
  $('#inp-eff').value = eff ? eff.toISOString().slice(0, 10) : '';
  $('#doc-meta').textContent = `${src.name || src.title} · ${splitClauses(src.text).length} clauses · ${reg || 'regulator unknown'}`;
  $('#doc-view').textContent = src.text;
  $('#btn-run').disabled = false;
  $('#btn-edit-doc').disabled = false;
  if (!$('#doc-edit').hidden) { $('#doc-edit').hidden = true; $('#doc-view').hidden = false; $('#btn-edit-doc').textContent = 'Edit text'; }
}

async function readFile(file) {
  if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
    toast('Reading PDF locally…');
    const pdfjs = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs';
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    let out = '';
    for (let p = 1; p <= pdf.numPages; p++) {
      const tc = await (await pdf.getPage(p)).getTextContent();
      let lastY = null;
      for (const it of tc.items) {
        const y = it.transform?.[5];
        if (lastY !== null && Math.abs(y - lastY) > 2) out += '\n';
        out += it.str;
        if (it.hasEOL) out += '\n';
        lastY = y;
      }
      out += '\n\n';
    }
    return out.replace(/\n{3,}/g, '\n\n');
  }
  return file.text();
}

async function useFile(file) {
  try {
    const text = await readFile(file);
    if (!text || text.trim().length < 80) { toast('Could not extract enough text from this file.'); return; }
    setSource({ text, title: file.name.replace(/\.[^.]+$/, ''), regulator: null, id: null, name: file.name });
    log('Document loaded', `${file.name} (${(file.size / 1024).toFixed(0)} KB)`);
    toast(`Loaded <b>${esc(file.name)}</b> – ${splitClauses(text).length} clauses found.`);
  } catch (e) { console.error(e); toast('Failed to read file: ' + esc(e.message)); }
}

async function runAnalysis(opts = {}) {
  if (!S.source) return;
  const steps = $$('#pipeline .pstep');
  steps.forEach((s) => { s.className = 'pstep'; s.querySelector('em').textContent = ''; });
  const reg = $('#sel-reg').value || S.source.regulator || null;
  const eff = $('#inp-eff').value ? new Date($('#inp-eff').value + 'T00:00:00Z') : null;
  const t0 = performance.now();
  const nClauses = S.source.clauses ? S.source.clauses.length : splitClauses(S.source.text).length;
  const tParse = performance.now() - t0;
  const t1 = performance.now();
  const res = S.engine.analyze({ text: S.source.text, title: S.source.title, regulator: reg, id: S.source.id, effective: eff, clauses: S.source.clauses });
  const tAll = performance.now() - t1 + tParse;
  if (opts.renumber) S.source.renumber = opts.renumber;
  if (S.source.renumber) res.clauses.forEach((c, i) => { c.n = S.source.renumber[i]; });
  const cosmetic = opts.fast ? 0 : 230;
  const times = [tParse, tAll * 0.3, tAll * 0.35, tAll * 0.25, tAll * 0.1];
  for (let i = 0; i < steps.length; i++) {
    steps[i].classList.add('run');
    await sleep(cosmetic);
    steps[i].classList.remove('run'); steps[i].classList.add('done');
    steps[i].querySelector('em').textContent = i === 0 ? `${nClauses} cl` : `${times[i].toFixed(1)} ms`;
  }
  applyResult(res, tAll);
}

function applyResult(res, ms, quiet = false) {
  S.result = res;
  S.tickets = S.engine.tickets(res, S.seq);
  S.seq += S.tickets.length;
  const sm = res.summary;
  $('#result-kpis').innerHTML = [
    ['c', sm.clauses, `clauses · ${sm.mandatory} mandatory`],
    ['c', sm.impacted, 'impacted items (9 layers)'],
    ['a', S.tickets.filter((t) => t.priority === 'P1').length, 'P1 actions'],
    ['g', sm.crossmap.covered, 'already covered'],
    ['a', sm.crossmap.partial, 'partially covered'],
    ['r', sm.crossmap.gap, 'gaps'],
    ['', `${ms.toFixed(0)} ms`, 'end-to-end in browser'],
  ].map(([c, b, s]) => `<div class="kpi ${c}"><b>${b}</b><span>${s}</span></div>`).join('');
  renderClauses(res);
  highlightDoc(res);
  S.graph.setResult(res);
  $('#chip-circ').innerHTML = `<i class="dot live"></i>${esc(res.regulator)} · ${sm.impacted} impacted`;
  const b = $('#nav-tickets-count'); b.hidden = false; b.textContent = S.tickets.length;
  if (!quiet) log('Circular analysed', `${res.title} (${res.regulator}) – ${sm.clauses} clauses, ${sm.impacted} impacted, ${S.tickets.length} tickets proposed`);
  if (S.view === 'graph') renderGraphPanel();
  if (S.view === 'crossmap') renderCrossmap();
  if (S.view === 'tickets') renderTickets();
  fillOwnerFilter();
}

function highlightDoc(res) {
  let html = esc(res.text);
  for (const c of res.clauses) {
    const t = esc(c.text.slice(0, 60));
    html = html.replace(t, `<mark>${t}</mark>`);
  }
  html = html.replace(/\b(shall not|must not|shall|must)\b/g, '<mark class="modal">$1</mark>');
  $('#doc-view').innerHTML = html;
}

function clauseTextHTML(c) {
  let h = esc(c.text);
  for (const p of c.params) h = h.replace(esc(p.raw), `<span class="num">${esc(p.raw)}</span>`);
  if (c.modalWord) h = h.replace(new RegExp(`\\b${c.modalWord}\\b`, 'i'), (m) => `<mark>${m}</mark>`);
  return h;
}

function anchorReason(a) {
  const r = a.reasons.find((x) => x.kind === 'obligation');
  const t = a.reasons.find((x) => x.kind === 'text');
  const parts = [];
  if (t) parts.push(`text match ${t.cos.toFixed(2)}${t.concepts ? ' + shared concepts' : ''}`);
  if (r) parts.push(`via ${S.bank.nodes.get(r.via).regulator} obligation (${r.sim.toFixed(2)})`);
  if (a.low) parts.push('low-confidence fallback – review');
  return parts.join(' · ');
}

// ------------------------------------------------------------------ graph panel
function renderLegend() {
  const items = [['regulation', 'Obligation (MAS / RBI)', 'linear-gradient(90deg,#ff4d6d,#ff9f43)'], ...LAYERS.slice(1).map((l) => [l, LAYER_LABEL[l], TYPE_COLOR[l]])];
  $('#g-legend').innerHTML = items.map(([k, l, c]) => `<span data-k="${k}"><i style="background:${c}"></i>${l}</span>`).join('');
  $$('#g-legend span').forEach((s) => s.addEventListener('click', () => {
    const off = !s.classList.contains('off');
    s.classList.toggle('off', off);
    S.graph.setOption('hideType', [s.dataset.k, off]);
  }));
  const dl = $('#g-nodes');
  S.searchMap = new Map();
  dl.innerHTML = S.bank.list.filter((n) => n.type !== 'evidence').map((n) => { const l = label(n.id); S.searchMap.set(l, n.id); return `<option value="${esc(l)}">`; }).join('');
}

function renderGraphPanel() {
  const res = S.result;
  if (!res) {
    $('#g-summary').innerHTML = `<div class="section"><h3>Dependency graph</h3><p class="muted" style="font-size:12.5px">Nine layers from regulations (top) to owning teams (bottom). Nodes of the same topic share a sector, so impact flows look like vertical streams. Drag to orbit, scroll to zoom, click any node.</p><button class="btn primary sm" id="g-quick">Trace a demo circular</button></div>`;
    $('#g-quick')?.addEventListener('click', quickDemo);
  } else {
    const by = {};
    for (const [id, r] of res.impact) { const t = S.bank.nodes.get(id).type; (by[t] = by[t] || []).push([id, r]); }
    const max = Math.max(...Object.values(by).map((a) => a.length));
    const top = [...res.impact.entries()].filter(([id]) => S.bank.nodes.get(id).type !== 'team').sort((a, b) => b[1].score - a[1].score).slice(0, 40);
    $('#g-summary').innerHTML = `<div class="section"><span class="reg ${res.regulator}">${res.regulator}</span> <b style="font-size:13.5px">${esc(res.title)}</b>
      <p class="muted" style="font-size:12px;margin:4px 0 10px">Effective ${fmtDate(res.effective)} · ${res.summary.impacted} impacted · ${res.summary.teams.length} teams</p>
      <div class="layer-mini">${LAYERS.slice(1).map((l) => `<div class="bar-row"><span>${LAYER_LABEL[l]}</span><div class="track"><div class="fill" style="width:${((by[l]?.length || 0) / max) * 100}%;background:${TYPE_COLOR[l]}"></div></div><b>${by[l]?.length || 0}</b></div>`).join('')}</div></div>
      <div class="section"><h3>Most impacted</h3><div class="imp-list">${top.map(([id, r]) => { const n = S.bank.nodes.get(id); return `<div class="imp ${S.selected === id ? 'on' : ''}" data-id="${id}"><i style="background:${colorOf(n)}"></i><span>${esc(n.code ? n.code + ' ' + n.name : n.name)}<small>${TYPE_NAME[n.type]} · ${r.hop ? `${r.hop} hop${r.hop === 1 ? '' : 's'}` : 'direct'} · clause ${res.clauses[r.clause].n}</small></span><b style="color:#${heat(r.score).getHexString()}">${pct(r.score)}</b></div>`; }).join('')}</div></div>`;
    $$('#g-summary .imp').forEach((el) => el.addEventListener('click', () => selectNode(el.dataset.id)));
  }
  renderDetail(S.selected);
}

function selectNode(id) {
  S.selected = id;
  S.graph.select(id, !!id);
  const res = S.result;
  if (id && res) {
    if (id.startsWith('cl_')) S.graph.setPath(null);
    else {
      const ex = S.engine.explain(res, id);
      S.graph.setPath(ex ? [`cl_${ex.clause.n}`, ...ex.path.map((p) => p.id)] : null);
    }
  } else S.graph.setPath(null);
  if (S.view === 'graph') renderGraphPanel();
}

function renderDetail(id) {
  const box = $('#g-detail');
  if (!id) { box.innerHTML = ''; return; }
  const res = S.result;
  if (id.startsWith('cl_')) {
    const c = res?.clauses.find((x) => `cl_${x.n}` === id);
    if (!c) { box.innerHTML = ''; return; }
    box.innerHTML = `<div class="section"><div class="detail-head"><i style="background:${TYPE_COLOR.clause}"></i><h3 style="margin:0">Clause ${c.n}</h3><span class="st ${c.crossmap.status}" style="margin-left:auto">${c.crossmap.status}</span></div>
      <div class="quote">${clauseTextHTML(c)}</div>
      <h3>Directly affects</h3><div class="imp-list">${c.anchors.map((a) => { const n = S.bank.nodes.get(a.id); return `<div class="imp" data-id="${a.id}"><i style="background:${colorOf(n)}"></i><span>${esc(label(a.id))}<small>${esc(anchorReason(a))}</small></span><b>${pct(a.conf)}</b></div>`; }).join('')}</div>
      <p class="muted" style="font-size:12px">${esc(c.crossmap.reasons.join(' '))}</p></div>`;
    $$('#g-detail .imp').forEach((el) => el.addEventListener('click', () => selectNode(el.dataset.id)));
    return;
  }
  const n = S.bank.nodes.get(id);
  if (!n) { box.innerHTML = ''; return; }
  const r = res?.impact.get(id);
  const ex = r ? S.engine.explain(res, id) : null;
  const owner = S.bank.nodes.get(n.owner)?.name;
  const outs = (S.engine.adjObserved.get(id) || []).filter((e) => e.type !== 'owned_by').slice(0, 8);
  const ins = S.engine.observedEdges.filter((e) => e.t === id && e.type !== 'owned_by').slice(0, 8);
  const tk = S.tickets.find((t) => t.nodeId === id);
  let trace = '';
  if (ex) {
    const anc = ex.anchor;
    trace = `<h3>Why it is impacted</h3><div class="quote"><b>Clause ${ex.clause.n}:</b> ${esc(ex.clause.text)}</div><div class="trace">
      <div class="hop first"><span class="s">${pct(anc?.conf || ex.path[0].score)}</span><b>${esc(label(ex.path[0].id))}</b><span class="e">linked to the clause – ${esc(anc ? anchorReason(anc) : '')}</span></div>
      ${ex.path.slice(1).map((p, i) => `<div class="hop"><span class="s">${pct(p.score)}</span><span class="e">${esc(label(ex.path[i].id).split(' ').slice(0, 4).join(' '))} ${EDGE_LABEL[p.edge] || p.edge} ↓</span><b>${esc(label(p.id))}</b></div>`).join('')}
    </div><p class="muted" style="font-size:11.5px">Score = link confidence × edge weights × 0.92 per hop. ${ex.clauses.length > 1 ? `Also reached from clauses ${ex.clauses.join(', ')}.` : ''}</p>`;
  }
  box.innerHTML = `<div class="section"><div class="detail-head"><i style="background:${colorOf(n)}"></i><h3 style="margin:0">${esc(n.code ? n.code + ' · ' + n.name : n.name)}</h3></div>
    <div class="kv"><span>Type</span><b>${TYPE_NAME[n.type]}${n.type === 'regulation' ? ` · ${n.regulator}` : ''}</b>
      ${owner ? `<span>Owner</span><b>${esc(owner)}</b>` : ''}<span>Region</span><b>${n.region || 'Global'}</b>
      ${n.crit ? `<span>Criticality</span><b>${['', 'Low', 'Medium', 'High'][n.crit]}</b>` : ''}
      ${n.topics?.length ? `<span>Topics</span><b>${n.topics.map((t) => TOPIC_LABELS[t]).join(', ')}</b>` : ''}
      ${r ? `<span>Impact</span><b style="color:#${heat(r.score).getHexString()}">${pct(r.score)} · ${r.hop} hop${r.hop === 1 ? '' : 's'}</b>` : ''}
      ${tk ? `<span>Ticket</span><b>${tk.key} · <span class="pr ${tk.priority}">${tk.priority}</span> · ${tk.status}</b>` : ''}</div>
    <p style="font-size:12.5px;color:var(--ink2);margin:0 0 10px">${esc(n.type === 'regulation' ? `${n.doc}: ${n.desc}` : n.desc)}</p>
    ${trace}
    ${tk ? `<div class="signoff"><button class="btn primary sm" data-sign="Approved">Approve change</button><button class="btn ghost sm" data-sign="Rejected">Reject</button></div>` : ''}
    </div>
    <div class="section"><h3>Connections (documented)</h3><div class="imp-list">
      ${ins.map((e) => `<div class="imp" data-id="${e.s}"><i style="background:${colorOf(S.bank.nodes.get(e.s))}"></i><span>${esc(label(e.s))}<small>${EDGE_LABEL[e.type]} this</small></span><b></b></div>`).join('')}
      ${outs.map((e) => `<div class="imp" data-id="${e.t}"><i style="background:${colorOf(S.bank.nodes.get(e.t))}"></i><span>${esc(label(e.t))}<small>this ${EDGE_LABEL[e.type]}</small></span><b></b></div>`).join('')}
    </div></div>`;
  $$('#g-detail .imp').forEach((el) => el.addEventListener('click', () => selectNode(el.dataset.id)));
  $$('#g-detail [data-sign]').forEach((b) => b.addEventListener('click', () => { setTicketStatus(tk, b.dataset.sign); renderDetail(id); }));
}

// ------------------------------------------------------------------ crossmap
function donut(parts) {
  const total = parts.reduce((s, p) => s + p[1], 0) || 1;
  let a = -Math.PI / 2;
  const R = 70, r = 46, cx = 90, cy = 90;
  const arcs = parts.map(([c, v]) => {
    const a2 = a + (v / total) * Math.PI * 2;
    const large = a2 - a > Math.PI ? 1 : 0;
    const p = (ang, rad) => `${cx + Math.cos(ang) * rad} ${cy + Math.sin(ang) * rad}`;
    const d = v === total ? `M ${p(-Math.PI / 2, R)} A ${R} ${R} 0 1 1 ${p(-Math.PI / 2 - 0.0001, R)} L ${p(-Math.PI / 2 - 0.0001, r)} A ${r} ${r} 0 1 0 ${p(-Math.PI / 2, r)} Z`
      : `M ${p(a, R)} A ${R} ${R} 0 ${large} 1 ${p(a2, R)} L ${p(a2, r)} A ${r} ${r} 0 ${large} 0 ${p(a, r)} Z`;
    a = a2;
    return v ? `<path d="${d}" fill="${c}" />` : '';
  }).join('');
  return `<svg viewBox="0 0 180 180" style="width:180px;height:180px;stroke:none">${arcs}<text x="90" y="88" text-anchor="middle" fill="#e8eefc" font-size="26" font-weight="800">${total}</text><text x="90" y="108" text-anchor="middle" fill="#8291b3" font-size="11">clauses</text></svg>`;
}

function renderCrossmap() {
  const res = S.result;
  const body = $('#xm-body');
  if (!res) {
    body.innerHTML = `<div class="empty"><p>Trace a circular first – every clause is then checked against the MAS and RBI obligations the bank already meets.</p><button class="btn primary sm" id="xm-quick">Trace a demo circular</button></div>`;
    $('#xm-quick').addEventListener('click', quickDemo);
  } else {
    const xm = res.summary.crossmap;
    body.innerHTML = `<div class="card xm-top">${donut([['#3ddc97', xm.covered], ['#ffd43b', xm.partial], ['#ff5c7a', xm.gap]])}
      <div><h3><span class="reg ${res.regulator}">${res.regulator}</span> ${esc(res.title)}</h3>
      <div class="kpis" style="margin-top:10px"><div class="kpi g"><b>${xm.covered}</b><span>Covered – reuse existing control & evidence</span></div><div class="kpi a"><b>${xm.partial}</b><span>Partial – strengthen (stricter or wider)</span></div><div class="kpi r"><b>${xm.gap}</b><span>Gap – new implementation</span></div></div>
      <p class="muted" style="font-size:12.5px;margin:0">Thresholds and timelines are compared automatically (e.g. a 24-hour cooling-off is stricter than an existing 12-hour one). Amounts in SGD and INR are compared at an indicative rate.</p></div></div>
      <div class="card" style="padding:0;overflow:auto"><table class="tbl"><thead><tr><th>§</th><th style="width:30%">Clause</th><th>Status</th><th style="width:28%">Closest existing obligation</th><th>Assessment</th><th>Reuse</th></tr></thead><tbody>
      ${res.clauses.map((c) => {
        const x = c.crossmap; const ob = x.best ? S.bank.nodes.get(x.best.id) : null;
        return `<tr><td class="mono">${c.n}</td><td>${esc(c.text)}</td><td><span class="st ${x.status}">${x.status}</span></td>
          <td>${ob ? `<div class="ob"><b><span class="reg ${ob.regulator}">${ob.regulator}</span> ${esc(ob.doc)} · sim ${x.best.sim.toFixed(2)}</b>${esc(ob.desc)}</div>` : '<span class="muted">None in library</span>'}</td>
          <td><ul class="xm-reasons">${x.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></td>
          <td>${x.reuse.map((id) => `<span class="pill">${esc(S.bank.nodes.get(id).code)}</span>`).join(' ')}</td></tr>`;
      }).join('')}</tbody></table></div>`;
  }
  const m = S.engine.corridorMatrix();
  const maxN = Math.max(...Object.values(m).map((t) => Math.max(t.MAS, t.RBI)));
  $('#xm-matrix').innerHTML = `<div class="matrix-row matrix-head"><span>Topic</span><span>MAS obligations</span><span>RBI obligations</span><span>Shared controls</span></div>` +
    Object.entries(m).sort((a, b) => b[1].MAS + b[1].RBI - a[1].MAS - a[1].RBI).map(([t, v]) => `<div class="matrix-row"><span>${TOPIC_LABELS[t] || t}</span>
      <span><span class="mbar" style="width:${(v.MAS / maxN) * 100}%;background:#ff4d6d">${v.MAS}</span></span>
      <span><span class="mbar" style="width:${(v.RBI / maxN) * 100}%;background:#ff9f43">${v.RBI}</span></span>
      <span class="mono">${v.shared.size} <span class="muted">${[...v.shared].map((c) => S.bank.nodes.get(c).code).join(' ')}</span></span></div>`).join('');
}

// ------------------------------------------------------------------ diff
function fillDiffSelectors() {
  const opts = CIRCULARS.map((c) => `<option value="${c.id}">${esc(c.short)}</option>`).join('');
  $('#diff-old').innerHTML = opts; $('#diff-new').innerHTML = opts;
  $('#diff-old').value = 'rbi-xb-v1'; $('#diff-new').value = 'rbi-xb-v2';
}

function runDiff() {
  const A = getCircular($('#diff-old').value), B = getCircular($('#diff-new').value);
  const rows = S.engine.diff(A.text, B.text);
  const ra = S.engine.analyze({ text: A.text, regulator: A.regulator, title: A.title });
  const rb = S.engine.analyze({ text: B.text, regulator: B.regulator, title: B.title });
  const ia = new Set([...ra.impact.keys()]), ib = new Set([...rb.impact.keys()]);
  const added = [...ib].filter((x) => !ia.has(x) && S.bank.nodes.get(x).type !== 'team');
  const gone = [...ia].filter((x) => !ib.has(x) && S.bank.nodes.get(x).type !== 'team');
  const changed = rows.filter((r) => r.status === 'modified' || r.status === 'added');
  const cnt = (s) => rows.filter((r) => r.status === s).length;
  const ops = (o) => o.map(([k, w]) => (k === '=' ? esc(w) : k === '+' ? `<ins>${esc(w)}</ins>` : `<del>${esc(w)}</del>`)).join(' ');
  const xmA = new Map(ra.clauses.map((c) => [c.text, c.crossmap.status]));
  $('#diff-body').innerHTML = `<div class="kpis"><div class="kpi a"><b>${cnt('modified')}</b><span>clauses modified</span></div><div class="kpi g"><b>${cnt('added')}</b><span>clauses added</span></div><div class="kpi r"><b>${cnt('removed')}</b><span>clauses removed</span></div><div class="kpi"><b>${cnt('unchanged')}</b><span>unchanged (skipped)</span></div><div class="kpi c"><b>+${added.length}</b><span>newly impacted items</span></div></div>
    <div class="grid-2" style="align-items:start"><div>${rows.map((r) => {
      const rbC = rb.clauses.find((c) => c.text === r.new);
      const xmNote = rbC && r.status !== 'unchanged' ? ` <span class="st ${rbC.crossmap.status}">${rbC.crossmap.status}</span>${r.status === 'modified' && xmA.get(r.old) !== rbC.crossmap.status ? ` <span class="muted" style="font-size:11px">was ${xmA.get(r.old)}</span>` : ''}` : '';
      return `<div class="diff-row ${r.status}"><div><span class="ds ${r.status}">${r.status}</span><div class="muted mono" style="font-size:11px">${r.oldN ? `old §${r.oldN}` : ''}${r.oldN && r.newN ? ' → ' : ''}${r.newN ? `new §${r.newN}` : ''}</div>${xmNote}</div>
      <div class="dt">${r.status === 'modified' ? ops(r.ops) : esc(r.new || r.old)}${rbC && r.status !== 'unchanged' ? `<div class="muted" style="font-size:12px;margin-top:6px">${esc(rbC.crossmap.reasons[0])}</div>` : ''}</div></div>`;
    }).join('')}</div>
    <div class="card"><h3>Impact delta</h3><p class="muted" style="font-size:12.5px">Items that become impacted only because of the amendment. Unchanged clauses need no re-analysis.</p>
      <div class="imp-list">${added.sort((x, y) => rb.impact.get(y).score - rb.impact.get(x).score).slice(0, 18).map((id) => `<div class="imp"><i style="background:${colorOf(S.bank.nodes.get(id))}"></i><span>${esc(label(id))}<small>${TYPE_NAME[S.bank.nodes.get(id).type]}</small></span><b>${pct(rb.impact.get(id).score)}</b></div>`).join('') || '<p class="muted">None</p>'}</div>
      ${gone.length ? `<p class="muted" style="font-size:12px">${gone.length} item(s) no longer impacted.</p>` : ''}
      <button class="btn primary wide" id="btn-trace-changes">Trace only the ${changed.length} changed clauses</button></div></div>`;
  $('#btn-trace-changes').addEventListener('click', async () => {
    const text = `${B.title} – changes only\n\n` + changed.map((r, i) => `${i + 1}. ${r.new}`).join('\n') + `\n\nThese directions shall come into effect from ${new Date(findDate(B.text)).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}.`;
    setSource({ text, title: `${B.title} (changed clauses)`, regulator: B.regulator, id: null, name: `${B.ref} – delta` });
    $('#inp-eff').value = findDate(B.text)?.toISOString().slice(0, 10) || '';
    await runAnalysis({ fast: true, renumber: changed.map((r) => r.newN) });
    show('graph');
    toast(`Traced ${changed.length} changed clauses only.`);
  });
  log('Version diff', `${A.ref} → ${B.ref}: ${cnt('modified')} modified, ${cnt('added')} added, +${added.length} newly impacted`);
}

// ------------------------------------------------------------------ link prediction
function runLinks() {
  S.links = S.engine.predictLinks(20);
  S.linkCands = S.links.candidates; S.linkHidden = S.links.hidden;
  renderLinks();
  log('Link prediction', `${S.links.length} missing-dependency suggestions from ${S.links.candidates} candidate pairs`);
}
function renderLinks() {
  const truth = $('#tg-truth').checked;
  const L = S.links;
  if (!L.length) { $('#links-body').innerHTML = `<div class="empty"><p>Click <b>Suggest links</b> to find dependencies that are probably missing from the bank's documented map.</p></div>`; $('#links-metrics').innerHTML = ''; return; }
  const acc = [...S.linkState.values()].filter((v) => v === 'accepted').length;
  const hits = L.filter((x) => x.heldOut).length;
  const base = S.linkHidden / S.linkCands;
  $('#links-metrics').innerHTML = `<div class="kpi"><b>${S.linkCands.toLocaleString()}</b><span>candidate pairs scored</span></div><div class="kpi c"><b>${L.length}</b><span>suggestions</span></div><div class="kpi g"><b>${acc}</b><span>accepted into graph</span></div>` +
    (truth ? `<div class="kpi a"><b>${hits}/${L.length}</b><span>are real held-out links</span></div><div class="kpi a"><b>${((hits / L.length) / base).toFixed(0)}×</b><span>better than random (${(base * 100).toFixed(2)}%)</span></div>` : '');
  const mx = Math.max(...L.map((x) => x.p2 + x.p3));
  $('#links-body').innerHTML = L.map((p, i) => {
    const st = S.linkState.get(`${p.s}>${p.t}`) || '';
    const s = S.bank.nodes.get(p.s), t = S.bank.nodes.get(p.t);
    return `<div class="lp ${st}"><div class="pair"><b>${esc(label(p.s))}</b> <span class="muted">${EDGE_LABEL[p.type]}</span> <b>${esc(label(p.t))}</b>${truth && p.heldOut ? ' <span class="truth">held-out link ✓</span>' : ''}<small>${TYPE_NAME[s.type]} → ${TYPE_NAME[t.type]} · ${p.common} shared neighbour${p.common === 1 ? '' : 's'} · score ${p.score.toFixed(2)}</small></div>
      <div class="feat"><div><span>Graph paths</span><span class="conf"><i style="width:${pct((p.p2 + p.p3) / (mx || 1))}"></i></span></div><div><span>Text match</span><span class="conf"><i style="width:${pct(Math.min(1, p.cos * 2))}"></i></span></div><div><span>Same topic</span><span class="conf"><i style="width:${p.topic ? '100%' : '0%'}"></i></span></div></div>
      <div class="acts">${st ? `<span class="muted" style="font-size:12px">${st}</span>` : `<button class="btn primary sm" data-acc="${i}">Accept</button><button class="btn ghost sm" data-rej="${i}">Reject</button>`}</div></div>`;
  }).join('');
  $$('[data-acc]').forEach((b) => b.addEventListener('click', () => acceptLink(L[+b.dataset.acc])));
  $$('[data-rej]').forEach((b) => b.addEventListener('click', () => { const p = L[+b.dataset.rej]; S.linkState.set(`${p.s}>${p.t}`, 'rejected'); renderLinks(); log('Link rejected', `${label(p.s)} → ${label(p.t)}`); }));
  const badge = $('#nav-links-count'); badge.hidden = false; badge.textContent = L.length - S.linkState.size;
}
// Items whose impact score rose by more than half a point after a change.
function strongerCount(a, b) {
  let n = 0;
  for (const [id, r] of b.impact) { const o = a.impact.get(id); if (!o || r.score > o.score + 0.005) n++; }
  return n;
}
async function acceptLink(p) {
  const before = S.result ? S.result.summary.impacted : null;
  const prev = S.result;
  S.engine.acceptLink(p);
  S.linkState.set(`${p.s}>${p.t}`, 'accepted');
  log('Link accepted', `${label(p.s)} ${EDGE_LABEL[p.type]} ${label(p.t)}`);
  if (S.result && S.source) {
    const res = S.engine.analyze({ text: S.source.text, title: S.source.title, regulator: S.result.regulator, id: S.source.id, effective: S.result.effective, clauses: S.source.clauses });
    if (S.source.renumber) res.clauses.forEach((c, i) => { c.n = S.source.renumber[i]; });
    applyResult(res, 0, true);
    S.lastAccept = { p, before, after: res.summary.impacted, stronger: strongerCount(prev, res) };
    toast(`Link added. Re-traced: ${res.summary.impacted} impacted (${res.summary.impacted - before >= 0 ? '+' : ''}${res.summary.impacted - before}), ${S.lastAccept.stronger} items strengthened.`);
  } else { S.graph.updateEdges(); toast('Link added to the graph.'); }
  renderLinks();
}

// ------------------------------------------------------------------ tickets
function fillOwnerFilter() {
  const owners = [...new Set(S.tickets.map((t) => t.owner))].sort();
  $('#tk-filter-owner').innerHTML = `<option value="">All owners</option>` + owners.map((o) => `<option>${esc(o)}</option>`).join('');
}
function setTicketStatus(t, st) {
  if (!t) return;
  t.status = st;
  log(`Ticket ${st.toLowerCase()}`, `${t.key} ${t.title}`);
  if (S.view === 'tickets') renderTickets();
}
function renderTickets() {
  const body = $('#tk-body');
  if (!S.tickets.length) { body.innerHTML = `<div class="empty"><p>No tickets yet – trace a circular to generate them.</p><button class="btn primary sm" id="tk-quick">Trace a demo circular</button></div>`; $('#tk-quick').addEventListener('click', quickDemo); $('#tk-kpis').innerHTML = ''; return; }
  const fp = $('#tk-filter-pr').value, fo = $('#tk-filter-owner').value;
  const list = S.tickets.filter((t) => (!fp || t.priority === fp) && (!fo || t.owner === fo));
  const c = (k, v) => S.tickets.filter((t) => t[k] === v).length;
  const teams = new Set(S.tickets.map((t) => t.owner)).size;
  const first = S.tickets.reduce((m, t) => (t.due < m ? t.due : m), S.tickets[0].due);
  $('#tk-kpis').innerHTML = `<div class="kpi r"><b>${c('priority', 'P1')}</b><span>P1 · critical path</span></div><div class="kpi a"><b>${c('priority', 'P2')}</b><span>P2</span></div><div class="kpi c"><b>${c('priority', 'P3')}</b><span>P3</span></div><div class="kpi"><b>${teams}</b><span>owning teams</span></div><div class="kpi g"><b>${c('status', 'Approved')}</b><span>approved by analyst</span></div><div class="kpi"><b>${fmtDate(first)}</b><span>first due date</span></div>`;
  body.innerHTML = `<div class="card" style="padding:0;overflow:auto;max-height:calc(100vh - 330px)"><table class="tbl"><thead><tr><th>Key</th><th style="width:34%">Action</th><th>Owner</th><th>Priority</th><th>Due</th><th>Cross-map</th><th style="width:18%">Evidence needed</th><th>Status</th><th></th></tr></thead><tbody>
    ${list.map((t) => `<tr><td class="mono">${t.key}</td><td>${esc(t.title)}<div class="ev">${esc(t.note)} · impact ${pct(t.score)}</div></td><td>${esc(t.owner)}</td><td><span class="pr ${t.priority}">${t.priority}</span></td><td class="mono">${fmtDate(t.due)}</td>
      <td><span class="st ${t.crossmap}">${t.crossmap}</span></td><td class="ev">${t.evidence.map(esc).join('<br>') || '—'}</td>
      <td><select data-k="${t.key}">${['Proposed', 'Approved', 'Rejected', 'Done'].map((s) => `<option ${s === t.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
      <td><button class="btn ghost sm" data-view="${t.nodeId}">3D</button></td></tr>`).join('')}
  </tbody></table></div>`;
  $$('#tk-body select').forEach((s) => s.addEventListener('change', () => setTicketStatus(S.tickets.find((t) => t.key === s.dataset.k), s.value)));
  $$('#tk-body [data-view]').forEach((b) => b.addEventListener('click', () => { show('graph'); selectNode(b.dataset.view); }));
}
function ticketsCSV() {
  const cols = ['key', 'title', 'owner', 'priority', 'due', 'crossmap', 'status', 'score', 'clause', 'evidence'];
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  return [cols.join(','), ...S.tickets.map((t) => cols.map((c) => q(c === 'due' ? t.due.toISOString().slice(0, 10) : c === 'evidence' ? t.evidence.join('; ') : c === 'score' ? t.score.toFixed(3) : t[c])).join(','))].join('\n');
}
function openReport() {
  const r = S.result;
  if (!r) { toast('Trace a circular first.'); return; }
  const w = window.open('', '_blank');
  if (!w) { toast('Allow pop-ups to open the report.'); return; }
  const sm = r.summary;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>RegTrace impact report</title><style>
    body{font:13px/1.5 Inter,Arial,sans-serif;color:#14233a;max-width:960px;margin:32px auto;padding:0 24px}h1{font-size:24px;margin:0}h2{font-size:16px;margin:24px 0 8px;border-bottom:2px solid #e3e8f0;padding-bottom:4px}
    table{width:100%;border-collapse:collapse;font-size:12px}td,th{border-bottom:1px solid #e3e8f0;padding:6px;text-align:left;vertical-align:top}th{background:#f3f6fa}
    .k{display:inline-block;margin-right:22px}.k b{font-size:20px;display:block}.s{font-weight:700;text-transform:uppercase;font-size:11px}.covered{color:#13824f}.partial{color:#a07400}.gap{color:#c4213e}.muted{color:#5b6b85}
    @media print{button{display:none}}</style></head><body>
    <button onclick="print()" style="float:right;padding:8px 14px">Print / Save as PDF</button>
    <p class="muted">RegTrace impact report · generated ${new Date().toLocaleString()} · ${esc(bankName())}</p>
    <h1>${esc(r.title)}</h1><p>${esc(r.regulator)} · effective ${fmtDate(r.effective)}</p>
    <div><span class="k"><b>${sm.clauses}</b>clauses</span><span class="k"><b>${sm.impacted}</b>impacted items</span><span class="k"><b>${S.tickets.length}</b>actions</span><span class="k"><b>${sm.crossmap.covered}/${sm.crossmap.partial}/${sm.crossmap.gap}</b>covered / partial / gap</span><span class="k"><b>${sm.teams.length}</b>teams</span></div>
    <h2>Clauses and MAS ⇄ RBI cross-map</h2><table><tr><th>§</th><th>Clause</th><th>Status</th><th>Assessment</th></tr>
    ${r.clauses.map((c) => `<tr><td>${c.n}</td><td>${esc(c.text)}</td><td class="s ${c.crossmap.status}">${c.crossmap.status}</td><td>${c.crossmap.reasons.map(esc).join('<br>')}</td></tr>`).join('')}</table>
    <h2>Action plan</h2><table><tr><th>Key</th><th>Action</th><th>Owner</th><th>Priority</th><th>Due</th><th>Status</th></tr>
    ${S.tickets.map((t) => `<tr><td>${t.key}</td><td>${esc(t.title)}</td><td>${esc(t.owner)}</td><td>${t.priority}</td><td>${fmtDate(t.due)}</td><td>${t.status}</td></tr>`).join('')}</table>
    <p class="muted" style="margin-top:24px">Impact scores = link confidence × dependency weights × per-hop decay. All recommendations require human approval. Demo data – not legal advice.</p></body></html>`);
  w.document.close();
  log('Report generated', `${r.title} – ${S.tickets.length} actions`);
}

// ------------------------------------------------------------------ benchmark
function runBench() {
  const t0 = performance.now();
  const b = runBenchmark(S.engine);
  const ms = performance.now() - t0;
  S.lastBench = b;
  const A = b.avg;
  if (!A) {
    $('#bench-kpis').innerHTML = '';
    $('#bench-chart').innerHTML = $('#bench-table').innerHTML = '';
    $('#bench-method').innerHTML = `<p class="muted">The benchmark's labelled answers refer to items of the synthetic bank, and this imported bank does not contain them. Generate a synthetic bank (any seed or size) in Data studio to run it.</p>`;
    return;
  }
  $('#bench-kpis').innerHTML = `<div class="kpi c"><b>${A.regtrace.f1.toFixed(2)}</b><span>RegTrace F1 (mean)</span></div><div class="kpi"><b>${A.vector.f1.toFixed(2)}</b><span>Vector retrieval F1</span></div><div class="kpi"><b>${A.keyword.f1.toFixed(2)}</b><span>Keyword search F1</span></div>
    <div class="kpi g"><b>${pct(A.regtrace.deep)}</b><span>of 2+ hop impacts found (vs ${pct(A.vector.deep)} vector)</span></div><div class="kpi a"><b>${pct(A.anchors.r)}</b><span>direct anchors recalled</span></div><div class="kpi"><b>${b.lp.lift50.toFixed(0)}×</b><span>link-prediction lift @50</span></div>`;
  const W = 560, H = 250, pad = 34, groups = [...b.rows.map((r) => ({ t: { 'rbi-xb-v1': 'RBI payments v1', 'rbi-xb-v2': 'RBI payments v2', 'mas-scam': 'MAS anti-scam', 'rbi-dpdp': 'RBI personal data', 'mas-tpr': 'MAS third-party' }[r.id] || r.title, r })), { t: 'Mean', r: { keyword: A.keyword, vector: A.vector, regtrace: A.regtrace } }];
  const gw = (W - pad) / groups.length, bw = gw / 4.2;
  const cols = { keyword: '#5b6b93', vector: '#b197fc', regtrace: '#38e1ff' };
  let bars = '';
  groups.forEach((g, i) => {
    ['keyword', 'vector', 'regtrace'].forEach((m, j) => {
      const v = g.r[m].f1, h = v * (H - 60), x = pad + i * gw + 6 + j * (bw + 2), y = H - 40 - h;
      bars += `<rect x="${x}" y="${y}" width="${bw}" height="${h}" rx="3" fill="${cols[m]}"/><text x="${x + bw / 2}" y="${y - 4}" text-anchor="middle" font-size="9" fill="#b4c0da">${v.toFixed(2)}</text>`;
    });
    bars += `<foreignObject x="${pad + i * gw}" y="${H - 36}" width="${gw}" height="36"><div xmlns="http://www.w3.org/1999/xhtml" style="font-size:9.5px;color:#8291b3;text-align:center;line-height:1.15">${esc(g.t)}</div></foreignObject>`;
  });
  const grid = [0, 0.25, 0.5, 0.75, 1].map((v) => { const y = H - 40 - v * (H - 60); return `<line x1="${pad}" x2="${W}" y1="${y}" y2="${y}" stroke="#1d2a44"/><text x="${pad - 6}" y="${y + 3}" font-size="9" text-anchor="end" fill="#8291b3">${v}</text>`; }).join('');
  $('#bench-chart').innerHTML = `<div class="legend-inline"><span><i style="background:${cols.keyword}"></i>Keyword search</span><span><i style="background:${cols.vector}"></i>Vector retrieval (top-8 / clause)</span><span><i style="background:${cols.regtrace}"></i>RegTrace</span></div><svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;stroke:none">${grid}${bars}</svg>`;
  $('#bench-method').innerHTML = `<ul class="bench-note">
    <li><b>Ground truth:</b> the team labelled which bank items each clause directly affects (“anchors”). The full impact set is traced from those anchors over the bank's <i>complete</i> graph, including the ${b.lp.hidden} dependencies RegTrace cannot see.</li>
    <li><b>RegTrace</b> finds its own anchors from the text (no labels) and propagates over the <i>documented</i> graph only.</li>
    <li><b>Keyword search</b> returns items sharing ≥2 of each clause's top-5 terms. <b>Vector retrieval</b> returns the 8 most similar items per clause (RAG-style), with no graph.</li>
    <li><b>Missing links:</b> ${pct(b.lp.p20)} of the top-20 suggestions are real held-out links vs a ${(b.lp.base * 100).toFixed(2)}% random hit rate.</li>
    <li><b>Caveat:</b> synthetic bank and demo circulars, labelled by the team – this shows the mechanism, not real-world accuracy. Next step: real circulars + a bank's CMDB in a MAS / RBI sandbox.</li>
    <li class="muted">Bank: ${esc(bankName())} – ${S.bank.list.length} items (seed ${S.bank.meta?.seed ?? '—'}, ${S.bank.meta?.scale ?? 'imported'}). Ran in ${ms.toFixed(0)} ms in your browser.${b.skipped.length ? ` Skipped: ${b.skipped.map(esc).join(', ')}.` : ''}</li></ul>`;
  const f = (m, best) => `<td class="num ${best ? 'best' : ''}">${m.p.toFixed(2)} / ${m.r.toFixed(2)} / <b>${m.f1.toFixed(2)}</b></td>`;
  $('#bench-table').innerHTML = `<table class="tbl"><thead><tr><th>Circular</th><th class="num">Gold items</th><th class="num">Keyword P / R / F1</th><th class="num">Vector P / R / F1</th><th class="num">RegTrace P / R / F1</th><th class="num">Anchors P / R</th><th class="num">2+ hop recall (RT)</th></tr></thead><tbody>
    ${b.rows.map((r) => { const best = Math.max(r.keyword.f1, r.vector.f1, r.regtrace.f1); return `<tr><td>${esc(r.title)}</td><td class="num">${r.gold}</td>${f(r.keyword, r.keyword.f1 === best)}${f(r.vector, r.vector.f1 === best)}${f(r.regtrace, r.regtrace.f1 === best)}<td class="num">${r.anchors.p.toFixed(2)} / ${r.anchors.r.toFixed(2)}</td><td class="num">${pct(r.regtrace.deep)}</td></tr>`; }).join('')}
    <tr><td><b>Mean</b></td><td></td>${f(A.keyword)}${f(A.vector)}${f(A.regtrace, true)}<td class="num">${A.anchors.p.toFixed(2)} / ${A.anchors.r.toFixed(2)}</td><td class="num">${pct(A.regtrace.deep)}</td></tr></tbody></table>`;
  log('Benchmark run', `RegTrace F1 ${A.regtrace.f1.toFixed(2)} vs vector ${A.vector.f1.toFixed(2)} vs keyword ${A.keyword.f1.toFixed(2)}`);
}

// ------------------------------------------------------------------ audit view
function renderAudit() {
  $('#audit-body').innerHTML = `<div class="card" style="padding:0">${[...S.audit].reverse().map((e) => `<div class="audit-row ${e.bad ? 'bad' : ''}"><span class="mono" style="font-size:11.5px">${e.at.replace('T', ' ').slice(0, 19)}</span><span>${esc(e.action)}<div class="muted" style="font-size:11px">${esc(e.actor)}</div></span><span>${esc(e.detail)}</span><span class="h">#${e.i} ${e.hash.slice(0, 20)}…<br>prev ${e.prev.slice(0, 12)}…</span></div>`).join('')}</div>`;
}

// ------------------------------------------------------------------ quick demo
async function quickDemo() {
  const c = getCircular('rbi-xb-v1');
  setSource({ text: c.text, title: c.title, regulator: c.regulator, id: c.id, name: c.ref });
  show('analyze');
  await runAnalysis();
  await sleep(500);
  show('graph');
}

// ------------------------------------------------------------------ wiring
function wire() {
  $$('[data-nav]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); show(b.dataset.nav); }));
  $('#btn-quick').addEventListener('click', quickDemo);
  $('#btn-run').addEventListener('click', () => runAnalysis());
  const drop = $('#drop'), file = $('#file');
  file.addEventListener('change', () => file.files[0] && useFile(file.files[0]));
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => e.dataTransfer.files[0] && useFile(e.dataTransfer.files[0]));
  $('#btn-paste').addEventListener('click', () => {
    const t = $('#paste').value;
    if (t.trim().length < 80) { toast('Paste at least a few sentences.'); return; }
    setSource({ text: t, title: 'Pasted circular', regulator: null, id: null, name: 'Pasted text' });
  });
  $$('#seg-color button').forEach((b) => b.addEventListener('click', () => { $$('#seg-color button').forEach((x) => x.classList.toggle('on', x === b)); S.graph.setOption('colorMode', b.dataset.v); }));
  $('#tg-focus').addEventListener('change', (e) => S.graph.setOption('focusOnly', e.target.checked));
  $('#tg-labels').addEventListener('change', (e) => S.graph.setOption('labels', e.target.checked));
  $('#tg-rotate').addEventListener('change', (e) => S.graph.setOption('autoRotate', e.target.checked));
  $('#rg-spacing').addEventListener('input', (e) => S.graph.setOption('spacing', +e.target.value));
  $('#rg-bloom').addEventListener('input', (e) => S.graph.setOption('bloom', +e.target.value / 10));
  $('#btn-replay').addEventListener('click', () => S.graph.replay());
  $('#btn-reset').addEventListener('click', () => { selectNode(null); S.graph.resetView(); });
  $('#g-search').addEventListener('change', (e) => { const id = S.searchMap.get(e.target.value); if (id) selectNode(id); e.target.value = ''; });
  $('#btn-diff').addEventListener('click', runDiff);
  $('#btn-links').addEventListener('click', runLinks);
  $('#tg-truth').addEventListener('change', () => { if (S.links.length) renderLinks(); if ($('#tg-truth').checked) log('Ground truth revealed', 'Held-out links shown for evaluation'); });
  $('#tk-filter-pr').addEventListener('change', renderTickets);
  $('#tk-filter-owner').addEventListener('change', renderTickets);
  $('#btn-approve-p1').addEventListener('click', () => { const p1 = S.tickets.filter((t) => t.priority === 'P1' && t.status === 'Proposed'); p1.forEach((t) => (t.status = 'Approved')); log('Bulk approval', `${p1.length} P1 tickets approved`); renderTickets(); });
  $('#btn-csv').addEventListener('click', () => { if (!S.tickets.length) return toast('No tickets yet.'); download('regtrace-tickets.csv', ticketsCSV(), 'text/csv'); log('Export', 'Tickets CSV'); });
  $('#btn-json').addEventListener('click', () => { if (!S.tickets.length) return toast('No tickets yet.'); download('regtrace-tickets.json', JSON.stringify(S.tickets, null, 2), 'application/json'); log('Export', 'Tickets JSON'); });
  $('#btn-report').addEventListener('click', openReport);
  $('#btn-bench').addEventListener('click', runBench);
  $('#btn-verify').addEventListener('click', verifyChain);
  $('#btn-audit-export').addEventListener('click', () => download('regtrace-audit.json', JSON.stringify(S.audit, null, 2), 'application/json'));
  $('#btn-tour').addEventListener('click', startTour);
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.view === 'graph') selectNode(null); });
}

// ------------------------------------------------------------------ data studio
const CFG_DEFAULT = { ...CFG };
const CFG_UI = [
  ['decay', 'Per-hop decay', 'How much impact fades at each dependency hop', 0.8, 0.99, 0.01],
  ['minScore', 'Impact threshold', 'Items scoring below this are not reported', 0.15, 0.5, 0.01],
  ['linkMin', 'Link threshold', 'Minimum match to link a clause to an item', 0.15, 0.4, 0.01],
  ['maxAnchors', 'Max direct links per clause', 'Upper bound on items a clause touches directly', 3, 12, 1],
  ['covered', '"Covered" similarity', 'How close an existing obligation must be to reuse it', 0.25, 0.6, 0.01],
];

function bankName() {
  const m = S.bank.meta || {};
  return m.source === 'imported' ? m.name : 'Meridian Straits Bank (synthetic)';
}

function graphSelect(id) { if (S.view !== 'graph' && id) show('graph'); selectNode(id); }

async function loadBank(bank, note) {
  const container = S.graph?.container || $('#stage-hero');
  S.graph?.dispose();
  S.bank = bank;
  S.engine = new Engine(bank);
  S.graph = new Graph3D(container, S.engine, { onSelect: graphSelect });
  S.result = null; S.tickets = []; S.links = []; S.linkState = new Map(); S.selected = null; S.lastBench = null; S.lastAccept = null;
  $('#chip-circ').innerHTML = '<i class="dot"></i>No circular traced';
  $('#nav-tickets-count').hidden = true; $('#nav-links-count').hidden = true;
  $('#clause-list').innerHTML = S.emptyClauses;
  for (const sel of ['#result-kpis', '#bench-kpis', '#bench-chart', '#bench-table', '#bench-method', '#diff-body', '#links-metrics', '#g-detail']) $(sel).innerHTML = '';
  $$('#pipeline .pstep').forEach((s) => { s.className = 'pstep'; s.querySelector('em').textContent = ''; });
  renderOverview(); renderLegend(); renderStudio(); renderLinks();
  if (S.view === 'graph') renderGraphPanel();
  await log('Bank loaded', note);
  if (S.source) { await runAnalysis({ fast: true }); toast(`Bank loaded – the current circular was re-traced: <b>${S.result.summary.impacted}</b> items impacted.`); }
  else toast(`Bank loaded: <b>${bank.list.length}</b> items, <b>${bank.edges.length}</b> links.`);
}

function renderStudio() {
  const m = S.bank.meta || {};
  $('#gen-scale').innerHTML = Object.entries(SCALES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
  if (m.source === 'synthetic') {
    $('#gen-seed').value = m.seed; $('#gen-scale').value = m.scale;
    $('#gen-hidden').value = Math.round(m.hidden * 100); $('#gen-hidden-v').textContent = `${Math.round(m.hidden * 100)}%`;
  }
  const hid = S.bank.edges.filter((e) => e.hidden).length;
  const gen = S.bank.list.filter((n) => n.generated).length;
  $('#gen-stats').innerHTML = `<div class="kpi c"><b>${S.bank.list.length}</b><span>items</span></div><div class="kpi"><b>${S.bank.edges.length}</b><span>links</span></div><div class="kpi a"><b>${hid}</b><span>undocumented</span></div><div class="kpi"><b>${gen}</b><span>generated services & APIs</span></div>`;
  $('#bank-problems').innerHTML = m.problems?.length ? `<p class="muted" style="font-size:12px">${m.problems.length} rows skipped: ${m.problems.slice(0, 4).map(esc).join('; ')}${m.problems.length > 4 ? '…' : ''}</p>` : '';
  S.ctlMap = new Map();
  $('#ob-ctl-list').innerHTML = S.bank.list.filter((n) => n.type === 'control').map((n) => { const l = label(n.id); S.ctlMap.set(l, n.id); return `<option value="${esc(l)}">`; }).join('');
  S.obCtl = S.obCtl?.filter((id) => S.bank.nodes.has(id)) || [];
  renderObChips();
  renderLibrary();
  renderCfg();
}

function renderLibrary() {
  const f = ($('#lib-filter').value || '').toLowerCase();
  const list = S.engine.obligations.filter((o) => !f || `${o.regulator} ${o.doc} ${o.desc}`.toLowerCase().includes(f));
  $('#lib-table').innerHTML = `<div style="max-height:360px;overflow:auto"><table class="tbl lib-tbl"><thead><tr><th>Regulator</th><th>Source</th><th style="width:46%">Obligation</th><th>Satisfied by</th><th></th></tr></thead><tbody>
    ${list.map((o) => `<tr><td><span class="reg ${o.regulator}">${o.regulator}</span></td><td>${esc(o.doc)}${o.userAdded ? '<div class="user-ob">ADDED IN THIS SESSION</div>' : ''}</td><td>${esc(o.desc)}</td>
      <td>${(S.engine.adjTrue.get(o.id) || []).filter((e) => e.type === 'satisfied_by').map((e) => `<span class="pill">${esc(S.bank.nodes.get(e.t)?.code || e.t)}</span>`).join(' ')}</td>
      <td>${o.userAdded ? `<button class="btn ghost sm" data-rmob="${o.id}">Remove</button>` : ''}</td></tr>`).join('')}</tbody></table></div>
    <p class="muted" style="font-size:12px;margin:8px 0 0">${S.engine.obligations.length} obligations · ${S.engine.obligations.filter((o) => o.regulator === 'MAS').length} MAS · ${S.engine.obligations.filter((o) => o.regulator === 'RBI').length} RBI</p>`;
  $$('[data-rmob]').forEach((b) => b.addEventListener('click', () => { S.engine.removeObligation(b.dataset.rmob); log('Obligation removed', b.dataset.rmob); renderLibrary(); retrace('Obligation removed'); }));
}

function renderObChips() {
  $('#ob-ctl-chips').innerHTML = (S.obCtl || []).map((id) => `<span class="chip-x">${esc(label(id))}<button data-rmctl="${id}">✕</button></span>`).join('');
  $$('[data-rmctl]').forEach((b) => b.addEventListener('click', () => { S.obCtl = S.obCtl.filter((x) => x !== b.dataset.rmctl); renderObChips(); }));
}

function renderCfg() {
  $('#cfg-sliders').innerHTML = CFG_UI.map(([k, l, d, min, max, step]) => `<div class="slider"><span>${l}<small>${d}</small></span><input type="range" data-cfg="${k}" min="${min}" max="${max}" step="${step}" value="${CFG[k]}" /><b id="cfg-v-${k}">${CFG[k]}</b></div>`).join('')
    + `<div><button class="btn ghost sm" id="cfg-reset">Reset to defaults</button></div>`;
  $$('[data-cfg]').forEach((inp) => inp.addEventListener('input', () => {
    const k = inp.dataset.cfg;
    CFG[k] = +inp.value;
    $(`#cfg-v-${k}`).textContent = inp.value;
    clearTimeout(S.cfgT);
    S.cfgT = setTimeout(() => retrace(`Setting changed: ${k} = ${inp.value}`), 250);
  }));
  $('#cfg-reset').addEventListener('click', () => { Object.assign(CFG, CFG_DEFAULT); renderCfg(); retrace('Settings reset to defaults'); });
}

// Re-run the current circular after a data or settings change and report the difference.
function retrace(why) {
  if (!S.result || !S.source) { $('#cfg-effect').textContent = 'Trace a circular to see the effect of each setting live.'; return; }
  const before = S.result.summary.impacted;
  const res = S.engine.analyze({ text: S.source.text, title: S.source.title, regulator: S.result.regulator, id: S.source.id, effective: S.result.effective, clauses: S.source.clauses });
  if (S.source.renumber) res.clauses.forEach((c, i) => { c.n = S.source.renumber[i]; });
  applyResult(res, 0, true);
  const d = res.summary.impacted - before;
  $('#cfg-effect').innerHTML = `${esc(why)} → re-traced: <b>${res.summary.impacted}</b> impacted items (${d >= 0 ? '+' : ''}${d}), ${res.summary.crossmap.covered} covered / ${res.summary.crossmap.partial} partial / ${res.summary.crossmap.gap} gap.`;
}

function wireStudio() {
  $('#gen-hidden').addEventListener('input', (e) => { $('#gen-hidden-v').textContent = `${e.target.value}%`; });
  $('#gen-dice').addEventListener('click', () => { $('#gen-seed').value = Math.floor(Math.random() * 99999); });
  $('#gen-go').addEventListener('click', () => {
    const opts = { seed: +$('#gen-seed').value || 1, scale: $('#gen-scale').value, hidden: +$('#gen-hidden').value / 100 };
    const t0 = performance.now();
    const bank = buildBank(opts);
    loadBank(bank, `Generated synthetic bank: seed ${opts.seed}, ${opts.scale}, ${Math.round(opts.hidden * 100)}% undocumented – ${bank.list.length} items in ${(performance.now() - t0).toFixed(0)} ms`);
  });
  const drop = $('#bank-drop'), file = $('#bank-file');
  const useBank = async (f) => {
    try {
      const bank = importBank(await f.text());
      bank.meta.name = bank.meta.name === 'Imported bank' ? f.name.replace(/\.json$/i, '') : bank.meta.name;
      loadBank(bank, `Imported ${f.name}: ${bank.list.length} items, ${bank.edges.length} links, ${bank.meta.problems.length} skipped rows`);
    } catch (e) { toast(`Could not import: ${esc(e.message)}`); }
  };
  file.addEventListener('change', () => file.files[0] && useBank(file.files[0]));
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => e.dataTransfer.files[0] && useBank(e.dataTransfer.files[0]));
  $('#bank-export').addEventListener('click', () => { download('regtrace-bank.json', JSON.stringify(exportBank(S.bank), null, 1), 'application/json'); log('Export', 'Bank map JSON'); });
  $('#bank-reset').addEventListener('click', () => loadBank(buildBank(), 'Default synthetic bank restored'));
  $('#lib-filter').addEventListener('input', renderLibrary);
  const addCtl = () => {
    const id = S.ctlMap.get($('#ob-ctl-in').value);
    if (id && !S.obCtl.includes(id)) { S.obCtl.push(id); renderObChips(); }
    $('#ob-ctl-in').value = '';
  };
  $('#ob-ctl-in').addEventListener('change', addCtl);
  $('#ob-ctl-in').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addCtl(); } });
  $('#ob-add').addEventListener('click', () => {
    const text = $('#ob-text').value.trim();
    if (text.length < 20) { toast('Write the obligation in a sentence first.'); return; }
    const reg = $('#ob-reg').value;
    const o = S.engine.addObligation({ regulator: reg, doc: $('#ob-doc').value.trim() || `${reg} (added by analyst)`, text, controls: S.obCtl });
    log('Obligation added', `${o.regulator} · ${o.doc}: ${text} → ${S.obCtl.map(label).join(', ') || 'no controls'}`);
    $('#ob-text').value = ''; S.obCtl = []; renderObChips(); renderLibrary();
    toast(`Added to the ${reg} library. New circulars are cross-mapped against it.`);
    retrace('Library updated');
  });
}

// ------------------------------------------------------------------ live clause lab
const TRY = [
  'Banks shall notify customers by SMS within 5 minutes when their registered email address is changed.',
  'Regulated entities must test disaster recovery for payment systems at least every 6 months and restore service within 2 hours.',
  'Card issuers shall tokenise all card-on-file data and shall not store card numbers in plain text.',
  'Video KYC recordings shall be retained for at least 5 years and protected against tampering.',
  'A personal data breach shall be reported to the regulator within 6 hours of detection.',
  'Institutions shall block outgoing transfers to accounts flagged as money mules by any participating bank.',
];

function clauseCardHTML(c, opts = {}) {
  const xm = c.crossmap;
  const ob = xm.best ? S.bank.nodes.get(xm.best.id) : null;
  return `<div class="clause" style="animation-delay:${(opts.i || 0) * 40}ms" data-n="${c.n}">
    <div class="clause-top"><span class="n">§${c.n}</span><span class="pill ${c.modality}">${c.modality}</span>
      ${c.topics.slice(0, 3).map((t) => `<span class="pill">${TOPIC_LABELS[t]}</span>`).join('')}
      ${c.params.map((p) => `<span class="pill param">${esc(fmtParam(p))}</span>`).join('')}
      <span style="margin-left:auto" class="st ${xm.status}">${xm.status}</span></div>
    ${opts.noText ? '' : `<p class="txt">${clauseTextHTML(c)}</p>`}
    <div class="anchors">${c.anchors.map((a) => {
      const n = S.bank.nodes.get(a.id);
      return `<div class="anchor" data-id="${a.id}" title="${esc(anchorReason(a))}"><span class="t" style="color:${colorOf(n)}">${TYPE_NAME[n.type]}</span><span>${esc(n.code ? n.code + ' · ' + n.name : n.name)}</span><span class="conf" title="confidence ${pct(a.conf)}"><i style="width:${pct(a.conf)}"></i></span></div>`;
    }).join('') || '<p class="muted" style="font-size:12px">No confident link – this clause needs manual review.</p>'}</div>
    <div class="why">${ob ? `<b>${xm.status === 'covered' ? 'Covered by' : 'Closest existing'}:</b> <span class="reg ${ob.regulator}">${ob.regulator}</span> ${esc(ob.doc)} – “${esc(ob.desc)}” (similarity ${xm.best.sim.toFixed(2)})<br>` : ''}${esc(xm.reasons[0] || '')}</div>
    ${opts.actions === false ? '' : `<div class="actions"><button class="btn ghost sm" data-trace="${c.n}">Trace in 3D</button><span class="muted" style="font-size:12px;align-self:center">${[...c.impact.keys()].filter((k) => S.bank.nodes.get(k)?.type !== 'team').length} items reached from this clause</span></div>`}
  </div>`;
}

function renderClauses(res) {
  $('#clause-list').innerHTML = res.clauses.map((c, i) => clauseCardHTML(c, { i })).join('');
  $$('#clause-list .anchor').forEach((el) => el.addEventListener('click', () => { show('graph'); selectNode(el.dataset.id); }));
  $$('#clause-list [data-trace]').forEach((el) => el.addEventListener('click', () => { show('graph'); selectNode(`cl_${el.dataset.trace}`); }));
}

function runComposer() {
  const t = $('#cmp-text').value.replace(/\s+/g, ' ').trim();
  const out = $('#cmp-out');
  if (t.length < 25) { out.innerHTML = '<p class="muted" style="font-size:12.5px;margin:8px 0 0">Type a full requirement (or click an example above) and watch the links, cross-map and impact update as you type.</p>'; return; }
  const t0 = performance.now();
  const res = S.engine.analyze({ text: t, title: 'Live clause', regulator: $('#cmp-reg').value, clauses: [t] });
  const ms = performance.now() - t0;
  const c = res.clauses[0];
  S.composerResult = res;
  out.innerHTML = `<div style="display:flex;justify-content:space-between;margin-top:10px"><span class="cmp-live">● live · ${ms.toFixed(1)} ms · ${res.summary.impacted} items reached · ${res.summary.teams.length} team${res.summary.teams.length === 1 ? '' : 's'}</span><button class="btn primary sm" id="cmp-trace">Trace in 3D</button></div>`
    + clauseCardHTML(c, { noText: true, actions: false });
  $$('#cmp-out .anchor').forEach((el) => el.addEventListener('click', () => { useComposer(); show('graph'); selectNode(el.dataset.id); }));
  $('#cmp-trace').addEventListener('click', () => { useComposer(); show('graph'); selectNode('cl_1'); });
}

function useComposer() {
  const t = $('#cmp-text').value.replace(/\s+/g, ' ').trim();
  S.source = { text: t, title: 'Live clause', regulator: $('#cmp-reg').value, id: null, name: 'Live clause lab', clauses: [t] };
  applyResult(S.composerResult, 0);
}

function wireComposer() {
  $('#cmp-try').innerHTML = TRY.map((t, i) => `<button class="try" data-try="${i}">${esc(t.split(' ').slice(0, 6).join(' '))}…</button>`).join('');
  $$('[data-try]').forEach((b) => b.addEventListener('click', () => { $('#cmp-text').value = TRY[+b.dataset.try]; runComposer(); }));
  let tm;
  $('#cmp-text').addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(runComposer, 120); });
  $('#cmp-reg').addEventListener('change', runComposer);
  runComposer();
  // editable document
  $('#btn-edit-doc').addEventListener('click', () => {
    const editing = !$('#doc-edit').hidden;
    if (!editing) {
      $('#doc-edit').value = S.source.text;
      $('#doc-edit').hidden = false; $('#doc-view').hidden = true;
      $('#btn-edit-doc').textContent = 'Save & re-run';
    } else {
      const text = $('#doc-edit').value;
      $('#doc-edit').hidden = true; $('#doc-view').hidden = false;
      $('#btn-edit-doc').textContent = 'Edit text';
      setSource({ ...S.source, text, id: null, clauses: undefined, renumber: undefined, name: `${S.source.name || S.source.title} (edited)` });
      log('Document edited', `${S.source.name}`);
      runAnalysis({ fast: true });
    }
  });
}

// ------------------------------------------------------------------ judge walkthrough
function deepestImpact() {
  if (!S.result) return null;
  return [...S.result.impact.entries()].filter(([id, r]) => ['api', 'datastore', 'evidence', 'control'].includes(S.bank.nodes.get(id)?.type) && r.hop >= 3)
    .sort((a, b) => b[1].score - a[1].score)[0]?.[0] || null;
}
const L = (x) => `<span class="live">${x}</span>`;
function exampleClause() {
  const r = S.result;
  if (!r) return null;
  return r.clauses.find((c) => c.crossmap.status === 'partial' && c.params.length) || r.clauses.find((c) => c.params.length) || r.clauses[0];
}
function typeInto(el, text, ms = 1800) {
  return new Promise((resolve) => {
    el.value = '';
    let i = 0;
    const step = Math.max(1, Math.ceil(text.length / (ms / 30)));
    const t = setInterval(() => {
      i = Math.min(text.length, i + step);
      el.value = text.slice(0, i);
      el.dispatchEvent(new Event('input'));
      if (i >= text.length) { clearInterval(t); setTimeout(resolve, 300); }
    }, 30);
  });
}

function startTour() {
  const counts = () => { const c = {}; for (const n of S.bank.list) c[n.type] = (c[n.type] || 0) + 1; return c; };
  const loadDemo = () => { const c = getCircular('rbi-xb-v1'); setSource({ text: c.text, title: c.title, regulator: c.regulator, id: c.id, name: c.ref }); };
  const steps = [
    {
      chapter: 'Introduction', title: 'RegTrace in one sentence',
      what: 'A working MVP that reads a new MAS or RBI circular and tells a bank exactly which policies, processes, systems, APIs, data stores and controls must change – and why.',
      why: 'A typical financial firm tracks about 217 regulatory updates a day (Thomson Reuters). Working out what each one breaks is done desk by desk – compliance, legal, risk, engineering, audit – and takes weeks. Banks in both Singapore and India do it twice, for two overlapping rulebooks.',
      how: `Everything in this walkthrough is computed live in your browser – no server and no pre-computed answers. Numbers shown in ${L('amber')} are calculated from the current data as you watch. You can pause with Exit at any time and try anything yourself.`,
    },
    {
      chapter: '1 · The bank', sel: '.hero', title: 'The bank as a dependency graph', before: () => show('overview'),
      what: () => { const c = counts(); return `${bankName()} – ${L(S.bank.list.length)} items connected by ${L(S.bank.edges.length)} typed links: ${L(c.policy)} policies, ${L(c.process)} processes, ${L(c.system)} systems, ${L(c.api)} APIs, ${L(c.datastore)} data stores, ${L(c.control)} controls, ${L(c.evidence)} evidence items and ${L(c.team)} owning teams, plus ${L(c.regulation)} MAS/RBI obligations.`; },
      why: 'A regulation never changes one document – it changes whatever depends on it. That knowledge lives in CMDBs, API catalogues, GRC tools and people’s heads. Putting it in one graph is what makes multi-hop impact analysis possible.',
      how: 'Nine stacked layers (regulations at the top, teams at the bottom). Each topic – payments, KYC, privacy, cyber… – owns a sector of the circle, so impact flows appear as vertical streams. Links are typed: policy governs process, process runs on system, system exposes API and stores data, controls monitor them, evidence proves controls.',
    },
    {
      chapter: '1 · The bank', sel: '#gen-card', title: 'Not a fixed demo: generate or import a bank', before: () => show('studio'), place: 'right',
      what: () => `The Data studio. This bank was generated from seed ${L(S.bank.meta?.seed ?? '—')} at size ${L(S.bank.meta?.scale ?? 'imported')}. Change the seed or size (up to ~1,500 items) and every view – impact, cross-map, tickets, benchmark – is recalculated. A bank's own map can be imported as JSON.`,
      why: 'Judges should be able to break it. The engine has no knowledge of specific node names: give it a different bank and it reasons over that one.',
      how: () => `A share of real dependencies (${L(Math.round((S.bank.edges.filter((e) => e.hidden).length / S.bank.edges.length) * 100) + '%')} here) is deliberately left out of the "documented" map that RegTrace sees – just like a real bank. Those hidden links are kept only for honest evaluation later.`,
    },
    {
      chapter: '1 · The bank', sel: '#lib-table', title: 'What the bank already complies with', before: () => show('studio'), place: 'top',
      what: () => `The obligation library: ${L(S.engine.obligations.filter((o) => o.regulator === 'MAS').length)} MAS and ${L(S.engine.obligations.filter((o) => o.regulator === 'RBI').length)} RBI requirements the bank already meets, each linked to the controls that satisfy it. Analysts can add their own on this page.`,
      why: 'This is what lets RegTrace say “you already do this for MAS – reuse it for RBI” instead of starting every circular from zero.',
      how: 'Entries are short paraphrases written for the demo, not legal text. Each new clause is compared with every entry using TF-IDF similarity plus shared regulatory concepts.',
    },
    {
      chapter: '2 · Analyse', sel: '#demo-list', title: 'A new circular arrives', before: () => { show('analyze'); loadDemo(); }, place: 'right',
      what: () => `We load a demo RBI circular on cross-border payment safeguards (synthetic – written for this MVP in RBI style). RegTrace detected the regulator as ${L(S.source?.regulator || detectRegulator(S.source.text))} and the effective date as ${L(fmtDate(findDate(S.source.text)))}.`,
      why: 'Real circulars arrive as PDFs. Upload any PDF or text file here, or paste text – it is parsed locally with pdf.js and never leaves the machine.',
      how: 'Clauses are split on numbering; for unnumbered text, sentences carrying “shall / must / required” are used. Dates near “effective / come into force” become the deadline anchor.',
    },
    {
      chapter: '2 · Analyse', sel: '#pipeline', title: 'Five stages, a few milliseconds', before: () => runAnalysis(), wait: 1600,
      what: () => `Parse → Extract → Link → Propagate → Cross-map. This run found ${L(S.result.summary.clauses)} clauses (${L(S.result.summary.mandatory)} mandatory) and reached ${L(S.result.summary.impacted)} items across ${L(S.result.summary.teams.length)} teams.`,
      why: 'What takes weeks of hand-offs becomes a reviewed list in seconds – so experts spend time judging impact instead of finding it.',
      how: 'Extraction reads modality (shall/must/should/may), topics, and parameters: deadlines (“within 1 hour”), minimums (“not less than 12 hours”), intervals (“at least annually”) and amounts in S$ or ₹.',
    },
    {
      chapter: '2 · Analyse', sel: () => `#clause-list .clause[data-n="${exampleClause()?.n}"]`, title: 'One clause, fully explained', place: 'left',
      what: () => { const c = exampleClause(); const top = c.anchors.slice(0, 3).map((a) => `${esc(label(a.id))} (${pct(a.conf)})`).join(', '); return `Clause ${L(c.n)} is ${L(c.modality)}${c.params.length ? `, with parameter ${L(esc(fmtParam(c.params[0])))}` : ''}. It links directly to ${top}. Cross-map status: ${L(c.crossmap.status)}.`; },
      why: 'Every link has a confidence and a reason (hover a row). Nothing is asserted without evidence a reviewer can check.',
      how: 'Linking combines TF-IDF text similarity, shared regulatory concepts (e.g. “cooling-off”, “kill switch”, “data principal”) and topic overlap. It also inherits controls from library obligations that say the same thing. Confidence is calibrated to 45–95%.',
    },
    {
      chapter: '2 · Analyse', sel: '#composer', title: 'Try your own clause – live', place: 'left', before: async () => { show('analyze'); $('#composer').scrollIntoView({ block: 'center' }); await typeInto($('#cmp-text'), 'Banks shall notify customers by SMS within 5 minutes when their registered email address is changed.'); },
      what: () => { const c = S.composerResult?.clauses[0]; return c ? `We just typed a requirement that is in none of the demo documents. RegTrace linked it to ${c.anchors.slice(0, 3).map((a) => L(esc(label(a.id)))).join(', ')}, extracted ${c.params.map((p) => L(esc(fmtParam(p)))).join(', ') || 'no parameters'} and marked it ${L(c.crossmap.status)} – recalculated on every keystroke.` : 'Type any requirement here.'; },
      why: 'This is the quickest proof that nothing is hardcoded. Judges can type any obligation – or click one of the examples – and see links, cross-map and reach update instantly.',
      how: 'The live lab runs the same engine as full documents: one clause, analysed in about a millisecond. “Trace in 3D” sends it to the graph.',
    },
    {
      chapter: '3 · Impact in 3D', sel: '#stage-graph', title: 'The blast radius, in 3D', place: 'center', wait: 700,
      before: () => { runAnalysis({ fast: true }); show('graph'); S.graph.resetView(); S.graph.replay(); },
      what: () => `The circular’s clauses float above the tower (cyan). The wave follows impact down through ${L(S.result.summary.impacted)} items – one hop at a time – with particles showing the direction of flow.`,
      why: 'Compliance, technology and audit leads see the same picture at once: what is hit, how deep, and who owns it.',
      how: 'Three.js with instanced meshes, bloom post-processing and CSS labels. Shape = layer type; brightness = impact score. Drag to orbit, scroll to zoom, click anything.',
    },
    {
      chapter: '3 · Impact in 3D', sel: '#g-panel', title: 'Why is this item impacted?', place: 'left', wait: 1000,
      before: () => { const id = deepestImpact(); if (id) selectNode(id); },
      what: () => { const id = S.selected; const ex = id && S.engine.explain(S.result, id); if (!ex) return 'Select any node to see its path.'; return `Selected: ${L(esc(label(id)))}, ${ex.path.length - 1} hops from clause ${ex.clause.n}. Path: ${ex.path.map((p) => esc(label(p.id).split(' ').slice(0, 4).join(' '))).join(' → ')}. Score ${L(pct(ex.score))}.`; },
      why: 'Auditors and regulators need explainability. Every result is a concrete chain of documented dependencies, drawn as the gold line in the graph – not a black-box score.',
      how: 'Best-path search (max-product Dijkstra). Score = link confidence × edge weight at each hop × 0.92 decay per hop. Edge weights reflect how strongly change passes through (e.g. process → control 0.86, system → system call 0.5).',
    },
    {
      chapter: '3 · Impact in 3D', sel: '.g-toolbar', title: 'Explore the graph', place: 'bottom', before: () => $$('#seg-color button')[1].click(),
      what: 'Impact-heat colouring is now on (blue = weaker, white = strongest). You can also colour by region (Singapore / India / global), focus only on impacted items, spread the layers, replay the wave, or search any item.',
      why: 'Region view matters for this corridor: India-leg payment data must stay in India, so a change touching an India data store is a different conversation.',
      how: 'The legend at the bottom-left toggles whole layers on and off.',
    },
    {
      chapter: '4 · MAS ⇄ RBI', sel: '#xm-body', title: 'Comply once, map to both', place: 'bottom', before: () => { $$('#seg-color button')[0].click(); show('crossmap'); },
      what: () => { const x = S.result.summary.crossmap; const ex = S.result.clauses.find((c) => c.crossmap.status !== 'covered'); return `${L(x.covered)} ${x.covered === 1 ? 'clause is' : 'clauses are'} already covered, ${L(x.partial)} partially covered, and ${L(x.gap)} ${x.gap === 1 ? 'is a real gap' : 'are real gaps'}.${ex ? ` Example – clause ${ex.n}: “${esc(ex.crossmap.reasons[0])}”` : ''}`; },
      why: 'For a bank in both countries this is the core saving: reuse a control and its audit evidence for the second regulator instead of building and testing it twice.',
      how: 'Each clause is matched to the closest MAS and RBI obligations. If thresholds differ, RegTrace compares them – a shorter deadline, a higher minimum or a lower cap is “stricter” – converting S$ and ₹ at an indicative rate.',
    },
    {
      chapter: '4 · MAS ⇄ RBI', sel: '#xm-matrix', title: 'Corridor coverage at a glance', place: 'top',
      what: () => { const m = S.engine.corridorMatrix(); const shared = Object.values(m).reduce((s, t) => s + t.shared.size, 0); return `Obligations per topic from each regulator, and ${L(shared)} controls that already satisfy both MAS and RBI requirements.`; },
      why: 'Shows where the two rulebooks overlap – the places where one control can serve both regulators.',
      how: 'Built from the obligation library and its control links; it updates when the library is edited.',
    },
    {
      chapter: '5 · Amendments', sel: '#diff-body', title: 'Only re-trace what changed', place: 'top', before: () => { show('diff'); runDiff(); },
      what: () => { const rows = S.engine.diff(getCircular('rbi-xb-v1').text, getCircular('rbi-xb-v2').text); const mod = rows.filter((r) => r.status === 'modified').length, add = rows.filter((r) => r.status === 'added').length; return `Comparing version 1 with the amended version 2: ${L(mod)} clauses modified, ${L(add)} added, the rest unchanged. Word-level changes are highlighted, and the impact delta lists items affected only by the amendment.`; },
      why: 'Most regulatory change is amendment. Teams should not redo the whole analysis when a single number changes.',
      how: 'Clauses are aligned by similarity, then diffed word by word. Changed parameters feed straight into the cross-map – e.g. a cooling-off raised from 12 to 24 hours turns a “covered” control into “stricter – strengthen”.',
    },
    {
      chapter: '6 · Missing links', sel: '#links-body', title: 'Fixing an incomplete map', place: 'top', before: () => { show('links'); $('#tg-truth').checked = true; runLinks(); },
      what: () => { const L2 = S.links; const hits = L2.filter((x) => x.heldOut).length; return `${L(L2.candidates.toLocaleString())} possible links were scored. With the hidden truth revealed, ${L(hits + ' of ' + L2.length)} top suggestions are real undocumented dependencies – against a random hit rate of ${L(((L2.hidden / L2.candidates) * 100).toFixed(2) + '%')}.`; },
      why: 'Impact analysis is only as good as the map. RegTrace points analysts to the dependencies most likely missing, so the graph improves with use.',
      how: 'A truncated Katz index (2- and 3-step paths, damped at hubs) plus text similarity and topic match. The GNN version on PyTorch Geometric is on the roadmap.',
    },
    {
      chapter: '6 · Missing links', sel: '#links-body', title: 'Accept a link – and watch the impact change', place: 'top',
      before: async () => {
        // pick a suggestion that would extend the current impact: source impacted, target not yet
        const fresh = S.engine.predictLinks(60).filter((x) => !S.linkState.has(`${x.s}>${x.t}`));
        const input = { text: S.source.text, title: S.source.title, regulator: S.result.regulator, effective: S.result.effective, clauses: S.source.clauses };
        let best = fresh[0], gain = -1;
        for (const x of fresh) {
          const r = S.engine.previewLink(x, input);
          const g = (r.summary.impacted - S.result.summary.impacted) * 10 + strongerCount(S.result, r) + (x.heldOut ? 0.5 : 0);
          if (g > gain) { gain = g; best = x; }
        }
        if (best) await acceptLink(best);
      },
      what: () => { const a = S.lastAccept; if (!a) return 'Accepting a suggestion adds it to the graph and re-traces the circular.'; return `We accepted ${L(esc(label(a.p.s)) + ' ' + EDGE_LABEL[a.p.type] + ' ' + esc(label(a.p.t)))} – chosen because, of the current suggestions, it changes this circular's impact the most. ${a.after !== a.before || a.stronger ? `Re-traced immediately: ${L(a.before)} → ${L(a.after)} impacted items, and ${L(a.stronger)} items now have a stronger or shorter path.` : 'Re-traced immediately: for this circular nothing changes – those items were already reached through other documented paths. The link still counts for every future circular.'}`; },
      why: 'Human-in-the-loop by design: the AI suggests, an analyst decides, and the decision is logged.',
      how: 'The accepted link joins the documented graph (shown in pink in 3D) and every analysis uses it from then on.',
    },
    {
      chapter: '7 · Act', sel: '#tk-body', title: 'From impact to an action plan', place: 'top', before: () => show('tickets'),
      what: () => { const c = (p) => S.tickets.filter((t) => t.priority === p).length; const first = S.tickets.reduce((m, t) => (t.due < m ? t.due : m), S.tickets[0].due); return `${L(S.tickets.length)} tickets: ${L(c('P1'))} P1, ${L(c('P2'))} P2, ${L(c('P3'))} P3, across ${L(new Set(S.tickets.map((t) => t.owner)).size)} owning teams. The first is due ${L(fmtDate(first))}.`; },
      why: 'Impact analysis only matters if it turns into owned, dated work – with the evidence audit will ask for already listed.',
      how: 'P1 = impact score ≥ 70% on a policy, process, control or critical system; P2 ≥ 50%; the rest P3. Deadlines are worked back from the effective date (P1: 120 days before, P2: 75, P3: 40). Covered clauses say “reuse existing evidence”.',
    },
    {
      chapter: '7 · Act', sel: '#view-tickets .head-actions', title: 'Approve, export, report', place: 'bottom',
      what: 'Each ticket can be approved, rejected or closed. Export to CSV or JSON for Jira/ServiceNow, or open a printable impact report for the board or the regulator.',
      why: 'AI proposes, people decide. Nothing changes in the bank without an accountable approver.',
      how: 'Every status change is written to the audit trail.',
    },
    {
      chapter: '8 · Proof', sel: '#bench-kpis', title: 'Does it really beat search?', place: 'bottom', before: () => { show('bench'); runBench(); },
      what: () => { const b = S.lastBench?.avg; if (!b) return 'The benchmark needs the synthetic bank (any seed or size).'; return `Mean F1 on five circulars: RegTrace ${L(b.regtrace.f1.toFixed(2))} vs vector retrieval ${L(b.vector.f1.toFixed(2))} vs keyword search ${L(b.keyword.f1.toFixed(2))}. For items two or more hops away: ${L(pct(b.regtrace.deep))} found vs ${L(pct(b.vector.deep))}.`; },
      why: 'Document search finds the right paragraph; it cannot follow the paragraph into the systems it affects. That is the gap RegTrace closes – and it widens as the bank grows.',
      how: 'Ground truth: the team labelled the items each clause directly affects; full impact is traced from them over the complete graph, including links RegTrace never sees. RegTrace gets no labels. Caveat: synthetic data and our own labels – this shows the mechanism, not real-world accuracy.',
    },
    {
      chapter: '8 · Proof', sel: '#cfg-sliders', title: 'Tune the engine', place: 'left', before: () => show('studio'),
      what: 'Decay, thresholds and the number of links per clause can be changed here, and the current circular is re-traced live with the difference shown.',
      why: 'Banks have different risk appetites – a conservative team can widen the net, a busy one can focus on the strongest impacts.',
      how: 'All settings feed the same propagation and cross-map code you have seen; nothing is special-cased.',
    },
    {
      chapter: '9 · Trust', sel: '#audit-body', title: 'Audit-ready by default', place: 'top', before: async () => { show('audit'); await verifyChain(); },
      what: () => `${L(S.audit.length)} events recorded in this session – including the analyses, link decisions and benchmark run during this walkthrough – in a SHA-256 hash chain. We just verified it: ${L(S.audit.some((e) => e.bad) ? 'broken' : 'intact')}.`,
      why: 'Regulators expect to see who decided what, when, and based on which analysis.',
      how: 'Each entry stores the hash of the previous one; changing any past entry breaks every later hash.',
    },
    {
      chapter: 'Close', title: 'What we built – and what is next',
      what: 'A working, explainable regulatory impact engine: parse → link → multi-hop propagation → MAS⇄RBI cross-map → diff → missing links → tickets → audit, on banks of up to ~1,500 items, all in the browser.',
      why: 'One shared picture for compliance, technology and audit – and one control that serves two regulators wherever the rulebooks overlap.',
      how: 'Next: LLM clause extraction with citations, Neo4j and a PyTorch Geometric link predictor, a FastAPI service running on-prem, a graph built automatically from CMDB / OpenAPI / GRC data, and a pilot in the MAS or RBI regulatory sandbox. Thank you – now try it yourself: type a clause, upload a PDF, or generate a new bank.',
    },
  ];
  // `sel` may be a function so it can target live content.
  for (const s of steps) if (typeof s.sel === 'function') { const f = s.sel; Object.defineProperty(s, 'sel', { get: f }); }
  log('Walkthrough started', `${steps.length} steps`);
  new Tour(steps).start();
}

// ------------------------------------------------------------------ boot
function boot() {
  const t0 = performance.now();
  S.emptyClauses = $('#clause-list').innerHTML;
  S.bank = buildBank();
  S.engine = new Engine(S.bank);
  S.graph = new Graph3D($('#stage-hero'), S.engine, { onSelect: graphSelect });
  renderOverview();
  renderDemoList();
  fillDiffSelectors();
  renderLegend();
  wire();
  wireStudio();
  wireComposer();
  renderStudio();
  renderLinks();
  log('Session started', `${bankName()} generated: ${S.bank.list.length} items, ${S.bank.edges.length} links in ${(performance.now() - t0).toFixed(0)} ms`);
  setTimeout(() => $('#boot').classList.add('gone'), 300);
  window.RegTrace = S; // handy for debugging in the console
  deepLink();
}

// Shareable deep links, e.g. ?demo=rbi-xb-v1&view=graph&select=ctl_py01&color=impact&seed=7&scale=large
async function deepLink() {
  const q = new URLSearchParams(location.search);
  if (q.get('seed') || q.get('scale')) await loadBank(buildBank({ seed: +q.get('seed') || 2026, scale: q.get('scale') || 'core' }), 'Bank from link');
  const demo = q.get('demo') && getCircular(q.get('demo'));
  if (demo) {
    setSource({ text: demo.text, title: demo.title, regulator: demo.regulator, id: demo.id, name: demo.ref });
    await runAnalysis({ fast: true });
  }
  if (q.get('color')) $(`#seg-color button[data-v="${q.get('color')}"]`)?.click();
  if (q.get('view')) show(q.get('view'));
  if (q.get('view') === 'diff') runDiff();
  if (q.get('view') === 'links') { $('#tg-truth').checked = q.get('truth') === '1'; runLinks(); }
  if (q.get('view') === 'bench') runBench();
  if (q.get('select')) selectNode(q.get('select') === 'deep' ? deepestImpact() : q.get('select'));
  if (q.get('tour') === '1') startTour();
}
try { boot(); } catch (e) {
  console.error(e);
  $('#boot').innerHTML = `<div class="boot-in"><p>Could not start: ${esc(e.message)}</p><p class="muted">WebGL and an internet connection (for Three.js) are required.</p></div>`;
}
