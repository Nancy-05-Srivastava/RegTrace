// RegTrace engine: clause extraction → linking → multi-hop impact propagation → MAS↔RBI cross-map,
// version diff, link prediction and action tickets. Pure functions over the bank graph (no DOM).
import {
  tokenize, TfIdf, cosine, splitClauses, modality, modalityWord, extractParams, stricter, topicsOf,
  findDate, detectRegulator, wordDiff, CONCEPTS, fmtParam,
} from './text.js';
import { EDGE_W, EDGE_LABEL } from './bank.js';

export const CFG = {
  decay: 0.92,        // per-hop decay
  minScore: 0.3,      // below this an item is not reported as impacted
  maxHops: 6,
  linkMin: 0.24,      // min link score for a clause → node anchor
  maxAnchors: 7,
  confScale: 0.85,   // link score that maps to ~95% confidence
  oblMin: 0.3,        // min similarity to inherit an existing obligation's controls
  covered: 0.36,      // cross-map: similarity for "covered"
  related: 0.2,       // cross-map: similarity for "partial"
};
const LINKABLE = new Set(['policy', 'process', 'system', 'control', 'datastore']);

export class Engine {
  constructor(bank) {
    this.bank = bank;
    this.nodes = bank.nodes;
    this.accepted = [];
    const docs = bank.list.map((n) => (n._tok = tokenize(`${n.name} ${n.name} ${n.desc} ${n.code || ''}`)));
    this.tfidf = new TfIdf(docs);
    for (const n of bank.list) { n._vec = this.tfidf.vector(n._tok); n._concepts = new Set(n._tok.filter((t) => CONCEPTS.has(t))); }
    this.obligations = bank.list.filter((n) => n.type === 'regulation');
    for (const o of this.obligations) o._params = extractParams(o.desc);
    this.rebuild();
  }

  addObligation({ regulator, doc, text, controls = [], policy = null }) {
    const id = `user_ob_${Date.now().toString(36)}`;
    const n = { id, type: 'regulation', kind: 'obligation', regulator, doc, name: `${regulator} · ${doc}`, desc: text, crit: 3, region: regulator === 'MAS' ? 'SG' : 'IN', userAdded: true };
    n._tok = tokenize(`${n.name} ${n.name} ${n.desc}`);
    n._vec = this.tfidf.vector(n._tok);
    n._concepts = new Set(n._tok.filter((t) => CONCEPTS.has(t)));
    n._params = extractParams(text);
    n.topics = topicsOf(tokenize(text));
    n.topic = n.topics[0] || 'reporting';
    this.bank.nodes.set(id, n);
    this.bank.list.push(n);
    for (const c of controls) if (this.nodes.has(c)) this.bank.edges.push({ s: id, t: c, type: 'satisfied_by', w: EDGE_W.satisfied_by, hidden: false });
    if (policy && this.nodes.has(policy)) this.bank.edges.push({ s: id, t: policy, type: 'implemented_in', w: EDGE_W.implemented_in, hidden: false });
    this.obligations.push(n);
    this.rebuild();
    return n;
  }

  removeObligation(id) {
    const n = this.nodes.get(id);
    if (!n?.userAdded) return false;
    this.bank.nodes.delete(id);
    this.bank.list.splice(this.bank.list.indexOf(n), 1);
    this.bank.edges = this.bank.edges.filter((e) => e.s !== id);
    this.obligations = this.obligations.filter((o) => o.id !== id);
    this.rebuild();
    return true;
  }

  rebuild() {
    const mk = (pred) => {
      const adj = new Map();
      for (const e of this.bank.edges) if (pred(e)) {
        if (!adj.has(e.s)) adj.set(e.s, []);
        adj.get(e.s).push(e);
      }
      for (const e of this.accepted) {
        if (!adj.has(e.s)) adj.set(e.s, []);
        adj.get(e.s).push(e);
      }
      return adj;
    };
    this.adjObserved = mk((e) => !e.hidden);
    const trueAdj = new Map();
    for (const e of this.bank.edges) { if (!trueAdj.has(e.s)) trueAdj.set(e.s, []); trueAdj.get(e.s).push(e); }
    this.adjTrue = trueAdj;
    this.observedEdges = [...this.bank.edges.filter((e) => !e.hidden), ...this.accepted];
  }

  // ------------------------------------------------------------ analysis
  analyze({ text, title = 'Untitled circular', regulator = null, id = null, effective = null, clauses: preset = null }) {
    const reg = regulator || detectRegulator(text) || 'RBI';
    const eff = effective || findDate(text) || null;
    const clauses = (preset || splitClauses(text)).map((t, i) => this.clause(t, i, reg));
    const merged = new Map();
    clauses.forEach((c, ci) => {
      // Reach is structural (anchor = 1.0, decays along weighted edges); the reported score is then
      // weighted by the confidence of the anchor link the path started from.
      c.impact = this.propagate(c.anchors.map((a) => ({ id: a.id, score: 1 })), this.adjObserved);
      const conf = new Map(c.anchors.map((a) => [a.id, a.conf]));
      for (const r of c.impact.values()) { r.struct = r.score; r.score = r.struct * (conf.get(r.root) ?? 1); }
      for (const [nid, r] of c.impact) {
        const cur = merged.get(nid);
        if (!cur || r.score > cur.score) merged.set(nid, { ...r, clause: ci, clauses: cur ? [...cur.clauses, ci] : [ci] });
        else cur.clauses.push(ci);
      }
    });
    const result = { id, title, regulator: reg, effective: eff, text, clauses, impact: merged, at: Date.now() };
    result.summary = this.summarise(result);
    return result;
  }

  clause(text, i, reg) {
    const tokens = tokenize(text);
    const vec = this.tfidf.vector(tokens);
    const concepts = new Set(tokens.filter((t) => CONCEPTS.has(t)));
    const topics = topicsOf(tokens);
    const c = {
      n: i + 1, text, tokens, vec, concepts, topics, modality: modality(text), modalWord: modalityWord(text),
      params: extractParams(text), date: findDate(text, /(by|before|from|on)\s*$/i),
    };
    c.obligations = this.matchObligations(c);
    c.anchors = this.link(c);
    c.crossmap = this.crossMap(c, reg);
    return c;
  }

  conceptBonus(a, b) {
    let k = 0;
    for (const t of a) if (b.has(t)) k++;
    return Math.min(0.3, 0.13 * k);
  }

  matchObligations(c) {
    return this.obligations.map((o) => {
      const sim = cosine(c.vec, o._vec) + this.conceptBonus(c.concepts, o._concepts);
      return { id: o.id, sim: Math.min(1, sim), regulator: o.regulator };
    }).sort((a, b) => b.sim - a.sim).slice(0, 5);
  }

  link(c) {
    const cand = new Map();
    const bump = (id, score, reason) => {
      const cur = cand.get(id);
      if (!cur) cand.set(id, { id, score, reasons: [reason] });
      else { cur.score = Math.max(cur.score, score) + 0.04; cur.reasons.push(reason); }
    };
    for (const n of this.bank.list) {
      if (!LINKABLE.has(n.type)) continue;
      const cos = cosine(c.vec, n._vec);
      if (cos < 0.06) continue;
      const tOverlap = c.topics.length ? c.topics.filter((t) => n.topics.includes(t)).length / c.topics.length : 0;
      const cb = this.conceptBonus(c.concepts, n._concepts);
      const s = 0.66 * cos + 0.16 * tOverlap + cb + (n.type === 'control' ? 0.02 : 0);
      if (s >= CFG.linkMin * 0.8) bump(n.id, s, { kind: 'text', cos, topic: tOverlap, concepts: cb > 0 });
    }
    // Inherit controls and policy from existing obligations that say the same thing.
    for (const ob of c.obligations.slice(0, 2)) {
      if (ob.sim < CFG.oblMin) continue;
      for (const e of this.adjObserved.get(ob.id) || []) {
        bump(e.t, 0.62 * ob.sim + 0.12, { kind: 'obligation', via: ob.id, sim: ob.sim });
      }
    }
    let list = [...cand.values()].filter((a) => a.score >= CFG.linkMin).sort((a, b) => b.score - a.score).slice(0, CFG.maxAnchors);
    if (!list.length) {
      // Nothing confident: fall back to the closest policy so the clause still gets an owner to review it.
      const best = this.bank.list.filter((n) => n.type === 'policy').map((n) => ({ id: n.id, score: cosine(c.vec, n._vec) + 0.16 * (c.topics.length ? c.topics.filter((t) => n.topics.includes(t)).length / c.topics.length : 0), reasons: [{ kind: 'fallback' }] }))
        .sort((a, b) => b.score - a.score)[0];
      if (best) { best.score = Math.max(best.score, 0.2); best.low = true; list = [best]; }
    }
    // Calibrated confidence: spreads link scores (≈0.2–0.9) over 0.45–0.95 instead of saturating.
    for (const a of list) a.conf = +(0.3 + 0.65 * Math.min(1, a.score / CFG.confScale)).toFixed(3);
    return list;
  }

  // Best-path (max-product) propagation, Dijkstra-style.
  propagate(seeds, adj, opts = {}) {
    const decay = opts.decay ?? CFG.decay, min = opts.min ?? CFG.minScore;
    const best = new Map();
    const heap = [];
    const push = (x) => { heap.push(x); heap.sort((a, b) => b.score - a.score); };
    for (const s of seeds) {
      if (!this.nodes.has(s.id)) continue;
      const cur = best.get(s.id);
      if (!cur || s.score > cur.score) { best.set(s.id, { score: s.score, hop: 0, parent: null, edge: null, root: s.id }); push({ id: s.id, score: s.score }); }
    }
    while (heap.length) {
      const { id, score } = heap.shift();
      const me = best.get(id);
      if (score < me.score - 1e-12) continue;
      if (me.hop >= CFG.maxHops) continue;
      if (this.nodes.get(id).type === 'team') continue;
      for (const e of adj.get(id) || []) {
        if (e.type === 'satisfied_by' || e.type === 'implemented_in') continue;
        const ns = score * e.w * (e.type === 'owned_by' ? 1 : decay);
        if (ns < min) continue;
        const cur = best.get(e.t);
        if (!cur || ns > cur.score + 1e-12) {
          best.set(e.t, { score: ns, hop: me.hop + 1, parent: id, edge: e.type, root: me.root });
          push({ id: e.t, score: ns });
        }
      }
    }
    return best;
  }

  pathTo(clause, nodeId) {
    const out = [];
    let cur = nodeId, guard = 0;
    while (cur && guard++ < 20) {
      const r = clause.impact.get(cur);
      if (!r) break;
      out.unshift({ id: cur, score: r.score, edge: r.edge });
      cur = r.parent;
    }
    return out;
  }

  explain(result, nodeId) {
    const r = result.impact.get(nodeId);
    if (!r) return null;
    const clause = result.clauses[r.clause];
    const path = this.pathTo(clause, nodeId);
    const anchor = clause.anchors.find((a) => a.id === path[0]?.id);
    return { clause, path, anchor, score: r.score, clauses: [...new Set(r.clauses)].map((i) => result.clauses[i].n) };
  }

  summarise(result) {
    const byType = {};
    for (const [id] of result.impact) { const t = this.nodes.get(id).type; byType[t] = (byType[t] || 0) + 1; }
    const xm = { covered: 0, partial: 0, gap: 0 };
    for (const c of result.clauses) xm[c.crossmap.status]++;
    const scores = [...result.impact.values()].map((r) => r.score);
    return {
      clauses: result.clauses.length,
      mandatory: result.clauses.filter((c) => c.modality === 'mandatory' || c.modality === 'prohibition').length,
      impacted: [...result.impact.keys()].filter((id) => this.nodes.get(id).type !== 'team').length,
      byType, crossmap: xm,
      high: scores.filter((s) => s >= 0.6).length,
      teams: [...result.impact.keys()].filter((id) => this.nodes.get(id).type === 'team'),
    };
  }

  // ------------------------------------------------------------ MAS ↔ RBI cross-map
  crossMap(c, reg) {
    const other = reg === 'MAS' ? 'RBI' : 'MAS';
    const best = c.obligations[0];
    const bestOther = c.obligations.find((o) => o.regulator === other) || null;
    const bestSame = c.obligations.find((o) => o.regulator === reg) || null;
    const res = { status: 'gap', best: null, other: bestOther, same: bestSame, reasons: [], reuse: [] };
    if (!best || best.sim < CFG.related) {
      res.reasons.push('No existing MAS or RBI obligation in the library covers this requirement – a new control is likely needed.');
      return res;
    }
    const ob = this.nodes.get(best.id);
    res.best = best;
    res.reuse = (this.adjObserved.get(best.id) || []).filter((e) => e.type === 'satisfied_by').map((e) => e.t);
    // Compare thresholds/timelines.
    const tighter = [], looser = [];
    for (const p of c.params) for (const q of ob._params) {
      const s = stricter(p, q);
      if (s === 1) tighter.push([p, q]);
      if (s === -1) looser.push([p, q]);
    }
    if (best.sim >= CFG.covered && !tighter.length) {
      res.status = 'covered';
      res.reasons.push(`Already met through ${ob.regulator} obligation (${ob.doc}); reuse ${res.reuse.length} existing control${res.reuse.length === 1 ? '' : 's'} and add ${reg} as a mapped source.`);
      for (const [p, q] of looser) res.reasons.push(`Existing ${ob.regulator} standard is already stricter: ${fmtParam(q)} vs new ${fmtParam(p)}.`);
    } else {
      res.status = 'partial';
      if (tighter.length) for (const [p, q] of tighter) res.reasons.push(`Stricter than existing ${ob.regulator} requirement: new ${fmtParam(p)} vs current ${fmtParam(q)} – strengthen the control.`);
      else res.reasons.push(`Related ${ob.regulator} obligation exists (${ob.doc}) but scope differs – extend existing controls.`);
    }
    if (bestOther && bestOther.sim >= CFG.related && bestOther.id !== best.id) {
      const o2 = this.nodes.get(bestOther.id);
      res.reasons.push(`Corridor match: ${o2.regulator} – ${o2.doc}.`);
    }
    return res;
  }

  corridorMatrix() {
    const topics = {};
    for (const o of this.obligations) {
      const t = o.topic;
      topics[t] = topics[t] || { MAS: 0, RBI: 0, shared: new Set(), controls: { MAS: new Set(), RBI: new Set() } };
      topics[t][o.regulator]++;
      for (const e of this.adjTrue.get(o.id) || []) if (e.type === 'satisfied_by') topics[t].controls[o.regulator].add(e.t);
    }
    for (const t of Object.values(topics)) for (const c of t.controls.MAS) if (t.controls.RBI.has(c)) t.shared.add(c);
    return topics;
  }

  // ------------------------------------------------------------ diff
  diff(oldText, newText) {
    const A = splitClauses(oldText), B = splitClauses(newText);
    const va = A.map((t) => this.tfidf.vector(tokenize(t))), vb = B.map((t) => this.tfidf.vector(tokenize(t)));
    const usedA = new Set();
    const rows = B.map((t, j) => {
      let bi = -1, bs = 0;
      A.forEach((_, i) => { if (usedA.has(i)) return; const s = cosine(vb[j], va[i]); if (s > bs) { bs = s; bi = i; } });
      if (bi >= 0 && bs >= 0.55) {
        usedA.add(bi);
        const same = A[bi].trim() === t.trim();
        return { status: same ? 'unchanged' : 'modified', oldN: bi + 1, newN: j + 1, old: A[bi], new: t, sim: bs, ops: same ? null : wordDiff(A[bi], t) };
      }
      return { status: 'added', newN: j + 1, new: t };
    });
    A.forEach((t, i) => { if (!usedA.has(i)) rows.push({ status: 'removed', oldN: i + 1, old: t }); });
    return rows;
  }

  // ------------------------------------------------------------ link prediction
  predictLinks(k = 20) {
    const und = new Map();
    const addU = (a, b) => { if (!und.has(a)) und.set(a, new Set()); und.get(a).add(b); };
    const skip = (id) => ['team', 'evidence', 'regulation'].includes(this.nodes.get(id)?.type);
    for (const e of this.observedEdges) { if (skip(e.s) || skip(e.t)) continue; addU(e.s, e.t); addU(e.t, e.s); }
    const deg = (z) => und.get(z)?.size || 1;
    const exists = new Set(this.observedEdges.map((e) => `${e.s}>${e.t}`));
    const hidden = new Set(this.bank.edges.filter((e) => e.hidden).map((e) => `${e.s}>${e.t}`));
    const by = (t) => this.bank.list.filter((n) => n.type === t);
    const pairs = [['process', 'system', 'runs_on'], ['system', 'datastore', 'stores'], ['system', 'control', 'monitored_by'], ['system', 'system', 'calls']];
    const out = [];
    let candidates = 0;
    for (const [st, tt, et] of pairs) {
      const targets = by(tt);
      for (const s of by(st)) {
        const ns = und.get(s.id) || new Set();
        // nodes within 3 hops get structural features; the rest are scored on text alone
        const reach = new Set(ns);
        for (const a of ns) for (const b of und.get(a) || []) reach.add(b);
        for (const t of targets) {
          if (s.id === t.id || exists.has(`${s.id}>${t.id}`) || exists.has(`${t.id}>${s.id}`)) continue;
          if (st === tt && s.id > t.id) continue; // undirected pair, score once
          candidates++;
          const cos = cosine(s._vec, t._vec);
          const topic = s.topic === t.topic && s.topic !== 'shared' ? 1 : 0;
          let p2 = 0, p3 = 0, common = 0;
          const nt = und.get(t.id);
          if (nt && (reach.has(t.id) || [...nt].some((x) => reach.has(x)))) {
            for (const z of ns) if (nt.has(z)) { common++; p2 += 1 / Math.log(2 + deg(z)); }
            for (const a of ns) for (const b of und.get(a) || []) if (b !== s.id && nt.has(b)) p3 += 1 / (Math.log(2 + deg(a)) * Math.log(2 + deg(b)));
          }
          const score = 0.5 * p2 + 0.3 * p3 + 1.5 * cos + 0.2 * topic;
          if (score < 0.35) continue;
          const rev = st === tt && hidden.has(`${t.id}>${s.id}`);
          out.push({ s: rev ? t.id : s.id, t: rev ? s.id : t.id, type: et, score, p2, p3, common, cos, topic, heldOut: rev || hidden.has(`${s.id}>${t.id}`) });
        }
      }
    }
    out.sort((a, b) => b.score - a.score);
    const top = out.slice(0, k);
    top.candidates = candidates;
    top.hidden = hidden.size;
    return top;
  }

  // What would the impact count be if this link were accepted? (used to explain suggestions)
  previewLink(p, input) {
    this.accepted.push({ s: p.s, t: p.t, type: p.type, w: EDGE_W[p.type], hidden: false, accepted: true });
    this.rebuild();
    const r = this.analyze(input);
    this.accepted.pop();
    this.rebuild();
    return r;
  }

  acceptLink(p) {
    if (this.accepted.some((e) => e.s === p.s && e.t === p.t)) return;
    this.accepted.push({ s: p.s, t: p.t, type: p.type, w: EDGE_W[p.type], hidden: false, accepted: true });
    this.rebuild();
  }

  // ------------------------------------------------------------ tickets
  tickets(result, startN = 1) {
    const eff = result.effective ? new Date(result.effective) : new Date(Date.now() + 180 * 864e5);
    const TYPES = { policy: 1, process: 2, system: 3, api: 4, datastore: 5, control: 6 };
    const items = [...result.impact.entries()].filter(([id, r]) => TYPES[this.nodes.get(id).type] && r.score >= 0.36);
    items.sort((a, b) => b[1].score - a[1].score);
    let n = startN;
    return items.map(([id, r]) => {
      const node = this.nodes.get(id);
      const clause = result.clauses[r.clause];
      const core = ['policy', 'control', 'process'].includes(node.type) || node.crit === 3;
      const pr = r.score >= 0.7 && core ? 'P1' : r.score >= 0.5 ? 'P2' : 'P3';
      const lead = { P1: 120, P2: 75, P3: 40 }[pr];
      const due = new Date(eff.getTime() - lead * 864e5);
      const verb = {
        policy: `Revise "${node.name}"`, process: `Update process "${node.name}"`, system: `Change ${node.name}`,
        api: `Modify endpoint ${node.name}`, datastore: `Review data handling in ${node.name}`, control: `Redesign & re-test ${node.code} ${node.name}`,
      }[node.type];
      const evid = node.type === 'control'
        ? (this.adjTrue.get(id) || []).filter((e) => e.type === 'evidenced_by').map((e) => this.nodes.get(e.t).name)
        : [...result.impact.keys()].filter((x) => this.nodes.get(x).type === 'evidence' && result.impact.get(x).parent && this.isDownstream(result, x, id)).slice(0, 2).map((x) => this.nodes.get(x).name);
      return {
        key: `RT-${String(n++).padStart(3, '0')}`, nodeId: id, type: node.type, title: `${verb} for ${result.regulator} clause ${clause.n}`,
        owner: this.nodes.get(node.owner)?.name || '—', ownerId: node.owner, priority: pr, score: r.score, due,
        clause: clause.n, crossmap: clause.crossmap.status, evidence: evid, status: 'Proposed',
        note: clause.crossmap.status === 'covered' ? 'Reuse existing control evidence; add new regulatory reference.' : clause.crossmap.status === 'partial' ? 'Strengthen existing implementation.' : 'New implementation required.',
      };
    });
  }

  isDownstream(result, x, id) {
    let cur = x, guard = 0;
    while (cur && guard++ < 12) { const r = result.impact.get(cur); if (!r) return false; if (r.parent === id) return true; cur = r.parent; }
    return false;
  }

  edgeLabel(t) { return EDGE_LABEL[t] || t; }
}
