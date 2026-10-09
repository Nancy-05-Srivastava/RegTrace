// Benchmark: RegTrace vs keyword search vs vector retrieval (RAG-style top-k), against expert-labelled
// ground truth on the synthetic bank. Ground truth = impact propagated from the expert anchors over the
// FULL graph (including the ~8% of dependencies missing from the bank's documented map).
import { tokenize, splitClauses, cosine } from './text.js';
import { CIRCULARS } from './corpus.js';

const EVAL_TYPES = new Set(['policy', 'process', 'system', 'api', 'datastore', 'control', 'evidence']);

function prf(pred, gold) {
  let tp = 0;
  for (const x of pred) if (gold.has(x)) tp++;
  const p = pred.size ? tp / pred.size : 0, r = gold.size ? tp / gold.size : 0;
  return { p, r, f1: p + r ? (2 * p * r) / (p + r) : 0, tp, pred: pred.size, gold: gold.size };
}

export function groundTruth(engine, circ) {
  const gold = new Set();
  for (const c of circ.clauses) {
    const imp = engine.propagate(c.anchors.filter((id) => engine.nodes.has(id)).map((id) => ({ id, score: 1 })), engine.adjTrue);
    for (const id of imp.keys()) if (EVAL_TYPES.has(engine.nodes.get(id).type)) gold.add(id);
  }
  return gold;
}

export function keywordSearch(engine, text) {
  const out = new Set();
  const cands = engine.bank.list.filter((n) => EVAL_TYPES.has(n.type));
  for (const cl of splitClauses(text)) {
    const kws = engine.tfidf.topTerms(tokenize(cl), 5);
    const need = kws.length >= 3 ? 2 : 1;
    for (const n of cands) {
      const toks = new Set(n._tok);
      let hit = 0;
      for (const k of kws) if (toks.has(k)) hit++;
      if (hit >= need) out.add(n.id);
    }
  }
  return out;
}

export function vectorRag(engine, text, k = 8) {
  const out = new Set();
  const cands = engine.bank.list.filter((n) => EVAL_TYPES.has(n.type));
  for (const cl of splitClauses(text)) {
    const v = engine.tfidf.vector(tokenize(cl));
    cands.map((n) => [n.id, cosine(v, n._vec)]).sort((a, b) => b[1] - a[1]).slice(0, k).forEach(([id]) => out.add(id));
  }
  return out;
}

export function runBenchmark(engine) {
  const rows = [];
  const skipped = [];
  for (const circ of CIRCULARS) {
    const known = circ.clauses.flatMap((c) => c.anchors).filter((id) => engine.nodes.has(id)).length;
    const all = circ.clauses.flatMap((c) => c.anchors).length;
    if (known < all * 0.8) { skipped.push(circ.short); continue; }
    const gold = groundTruth(engine, circ);
    const res = engine.analyze({ text: circ.text, title: circ.title, regulator: circ.regulator, id: circ.id });
    const rt = new Set([...res.impact.keys()].filter((id) => EVAL_TYPES.has(engine.nodes.get(id).type)));
    const kw = keywordSearch(engine, circ.text);
    const vr = vectorRag(engine, circ.text);
    // Anchor accuracy: did the linker find the directly affected items?
    const goldA = new Set(circ.clauses.flatMap((c) => c.anchors));
    const predA = new Set(res.clauses.flatMap((c) => c.anchors.map((a) => a.id)));
    // Deep items: ≥2 hops from any anchor in the true graph (what document search cannot reach).
    const deep = new Set();
    for (const c of circ.clauses) {
      const imp = engine.propagate(c.anchors.map((id) => ({ id, score: 1 })), engine.adjTrue);
      for (const [id, r] of imp) if (r.hop >= 2 && EVAL_TYPES.has(engine.nodes.get(id).type)) deep.add(id);
    }
    const deepRecall = (s) => (deep.size ? [...deep].filter((x) => s.has(x)).length / deep.size : 0);
    rows.push({
      id: circ.id, title: circ.short, gold: gold.size,
      keyword: { ...prf(kw, gold), deep: deepRecall(kw) },
      vector: { ...prf(vr, gold), deep: deepRecall(vr) },
      regtrace: { ...prf(rt, gold), deep: deepRecall(rt) },
      anchors: prf(predA, goldA),
    });
  }
  if (!rows.length) return { rows, avg: null, lp: null, skipped };
  const mean = (m, k) => rows.reduce((s, r) => s + r[m][k], 0) / rows.length;
  const avg = {};
  for (const m of ['keyword', 'vector', 'regtrace', 'anchors']) avg[m] = { p: mean(m, 'p'), r: mean(m, 'r'), f1: mean(m, 'f1'), deep: m === 'anchors' ? null : mean(m, 'deep') };
  // Link prediction precision against the held-out dependencies.
  const preds = engine.predictLinks(50);
  const at = (k) => preds.slice(0, k).filter((x) => x.heldOut).length / k;
  const base = preds.hidden / preds.candidates;
  const lp = { p10: at(10), p20: at(20), p50: at(50), base, lift50: at(50) / base, hidden: preds.hidden, candidates: preds.candidates };
  return { rows, avg, lp, skipped };
}
