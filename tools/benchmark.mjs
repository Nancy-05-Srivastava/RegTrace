// Run the RegTrace engine + benchmark headless:  node tools/benchmark.mjs [--verbose]
import { buildBank } from '../js/bank.js';
import { Engine } from '../js/engine.js';
import { runBenchmark } from '../js/benchmark.js';
import { CIRCULARS } from '../js/corpus.js';
import { fmtParam } from '../js/text.js';

const verbose = process.argv.includes('--verbose');
const t0 = performance.now();
const bank = buildBank();
const engine = new Engine(bank);
const counts = {};
for (const n of bank.list) counts[n.type] = (counts[n.type] || 0) + 1;
console.log(`SyntheticBank-360: ${bank.list.length} nodes, ${bank.edges.length} edges (${bank.edges.filter((e) => e.hidden).length} held out)`);
console.log('  by type:', counts);
console.log(`  build + index: ${(performance.now() - t0).toFixed(0)} ms\n`);

if (verbose) {
  for (const c of CIRCULARS) {
    const t = performance.now();
    const r = engine.analyze({ text: c.text, regulator: c.regulator, title: c.title });
    console.log(`== ${c.short}  (${(performance.now() - t).toFixed(0)} ms)  clauses=${r.clauses.length} impacted=${r.summary.impacted} xmap=${JSON.stringify(r.summary.crossmap)}`);
    r.clauses.forEach((cl, i) => {
      const gold = new Set(c.clauses[i]?.anchors || []);
      const hit = cl.anchors.filter((a) => gold.has(a.id)).length;
      console.log(`  ${cl.n}. [${cl.modality}] ${cl.crossmap.status.padEnd(7)} anchors ${hit}/${gold.size} :: ${cl.anchors.map((a) => `${a.id}(${a.score.toFixed(2)})`).join(' ')}`);
      if (cl.params.length) console.log(`       params: ${cl.params.map(fmtParam).join(', ')}`);
      console.log(`       best obl: ${cl.obligations.slice(0, 2).map((o) => `${o.id}=${o.sim.toFixed(2)}`).join(' ')} | ${cl.crossmap.reasons[0]}`);
    });
  }
  console.log();
}

const t1 = performance.now();
const b = runBenchmark(engine);
const f = (x) => x.toFixed(2);
console.log('circular'.padEnd(52), 'gold', ' | keyword P/R/F1   | vectorRAG P/R/F1 | RegTrace P/R/F1  | anchors P/R');
for (const r of b.rows) {
  console.log(r.title.padEnd(52), String(r.gold).padStart(4), ' |', [r.keyword, r.vector, r.regtrace].map((m) => `${f(m.p)}/${f(m.r)}/${f(m.f1)}`).join(' | '), '|', `${f(r.anchors.p)}/${f(r.anchors.r)}`);
}
console.log('MEAN'.padEnd(57), '|', ['keyword', 'vector', 'regtrace'].map((m) => `${f(b.avg[m].p)}/${f(b.avg[m].r)}/${f(b.avg[m].f1)}`).join(' | '), '|', `${f(b.avg.anchors.p)}/${f(b.avg.anchors.r)}`);
console.log('deep-recall (≥2 hops):', ['keyword', 'vector', 'regtrace'].map((m) => `${m}=${f(b.avg[m].deep)}`).join('  '));
console.log(`link prediction: P@10=${f(b.lp.p10)} P@20=${f(b.lp.p20)} P@50=${f(b.lp.p50)} · random=${(b.lp.base*100).toFixed(2)}% · lift@50=${b.lp.lift50.toFixed(0)}x (held-out ${b.lp.hidden} of ${b.lp.candidates} candidates)`);
console.log(`benchmark time: ${(performance.now() - t1).toFixed(0)} ms`);
