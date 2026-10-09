# RegTrace – MVP

**Graph AI that traces every MAS and RBI rule change to the exact policies, systems and controls it touches.**
Singapore India Hackathon 2026 · FinTech & InsurTech · Team SkyNRG

RegTrace reads a new regulatory circular, links each obligation to a bank's own policies, processes, systems, APIs, data stores and controls, and propagates the impact through a 9-layer dependency graph. Every result comes with the path that explains it. The whole MVP runs in the browser: no server, no API keys, and no data leaves the machine.

## Run it

```bash
python -m http.server 8765
```
Then open <http://localhost:8765>. Any static server works (`npx serve`, GitHub Pages). It needs an internet connection to load Three.js and pdf.js from jsDelivr.

Headless engine and benchmark:
```bash
node tools/benchmark.mjs --verbose
```

### Deep links (handy for demos)
| URL | Opens |
|---|---|
| `?demo=rbi-xb-v1&view=graph` | Traces the RBI demo circular and opens the 3D graph |
| `?demo=rbi-xb-v1&view=graph&select=deep&color=impact` | Same, with the deepest impacted item selected and the heat colours |
| `?view=diff` | v1 → v2 amendment diff |
| `?view=links&truth=1` | Missing-link suggestions with the held-out truth revealed |
| `?view=bench` | Runs the benchmark |
| `?seed=77&scale=enterprise&demo=mas-scam&view=graph` | Generates a different bank (seed, size) and traces a circular on it |
| `?tour=1` | Starts the 22-step judge walkthrough |

Demo ids: `rbi-xb-v1`, `rbi-xb-v2`, `mas-scam`, `rbi-dpdp`, `mas-tpr`.

## Nothing is hardcoded
- **Data studio**:
  - **Generate** a different bank: choose the seed, the size (core ~500 · large ~1,000 · enterprise ~1,500 items, with generated microservices and APIs) and the share of undocumented links (0–30%).
  - **Import** your own bank map as JSON (`regtrace-bank/1`). *Export current bank* gives you a template.
  - **Extend** the MAS/RBI obligation library. New circulars are cross-mapped against your entries straight away.
  - **Tune** the engine (decay, thresholds, links per clause). The current circular is re-traced live, with the difference shown.
- **Live clause lab**: type any requirement and RegTrace re-analyses it on every keystroke.
- **Edit text**: change any circular and re-run it.
- The engine has no special cases for node names. Every number on screen is computed from the current data in the browser.

## Judge walkthrough
The **Judge walkthrough** button runs 22 steps in 9 chapters: the bank, analysis, 3D impact, MAS⇄RBI, amendments, missing links, actions, proof, and trust. Each step explains:
- **What you are seeing**
- **Why it matters**
- **How it works**

The numbers in the text are written from the live results, highlighted in amber. During the walkthrough the app performs real actions: it types a new clause, runs a diff, accepts the link that changes the impact most, runs the benchmark, and verifies the audit chain. Auto-play and voice narration (browser speech synthesis) are optional.

## What it does

| View | Feature |
|---|---|
| **Analyse circular** | Upload a PDF or text file (parsed locally with pdf.js), paste text, or pick a demo. A 5-stage pipeline (parse → extract → link → propagate → cross-map) shows each stage's timing. For every clause it shows the obligation type, topics, extracted thresholds and deadlines, and the bank items it directly affects with confidence scores and reasons. |
| **3D impact graph** | A Three.js "dependency tower" with 9 layers, rendered with instanced meshes and bloom. Impact animates as a wave with particle flows. Clicking a node shows *why it is impacted*: the full path from the clause with a score at each hop, drawn as a gold tube. Colour by type, impact heat or region; focus mode; layer spacing; search; layer filters. |
| **MAS ⇄ RBI cross-map** | Each clause is classified as **covered** (reuse existing controls and evidence), **partial** (e.g. a new 24 h cooling-off is stricter than the existing 12 h one) or **gap** (no existing obligation). Thresholds are compared automatically, and SGD vs INR amounts are compared at an indicative rate. Also includes a corridor coverage matrix by topic. |
| **Version diff** | Clause-level alignment with word diff, cross-map status changes, an impact delta, and a "trace only changed clauses" option. |
| **Missing links** | Suggests undocumented dependencies using a truncated Katz index with hub damping plus text similarity. An analyst accepts or rejects each one; accepting a link re-traces the circular. |
| **Action tickets** | Owner, priority, a due date worked back from the effective date, and the evidence needed. Status can be changed per ticket or bulk-approved. Exports to CSV and JSON, and generates a printable impact report. |
| **Benchmark** | Compares RegTrace with keyword search and vector retrieval (RAG-style) against expert-labelled ground truth. Works on any generated bank. |
| **Data studio** | Bank generator, JSON import/export, obligation library editor, live engine settings. |
| **Audit trail** | A SHA-256 hash-chained log of every analysis, decision and export, with a chain verifier. |

## Results (synthetic data – shows the mechanism, not real-world accuracy)

Five demo circulars, with anchors labelled by the team. Ground truth is traced over the bank's **full** graph, including the 27 dependencies that RegTrace never sees.

| Method | Precision | Recall | F1 | Recall of impacts ≥2 hops away |
|---|---|---|---|---|
| Keyword search | 0.80 | 0.08 | 0.14 | 6% |
| Vector retrieval (top-8 per clause) | 0.76 | 0.35 | 0.47 | 27% |
| **RegTrace** | **0.81** | **0.93** | **0.85** | **92%** |

- Direct-anchor linking without labels: precision 0.66, recall 0.86.
- On larger generated banks the gap grows. F1 for RegTrace vs vector retrieval: 0.83 vs 0.33 on large (seed 11), and 0.78 vs 0.24 on enterprise.
- Missing-link suggestions: P@10 = 0.30 against a 0.27% random hit rate, a 52× lift at 50.
- Each circular is analysed end to end in roughly 3–10 ms in the browser.

## How it works

1. **Parse**: numbered clauses are split out; obligations are taken from unnumbered sentences.
2. **Extract**: modality (shall / must / should / may), topics, parameters (deadline, minimum, interval, cap, amount) and dates.
3. **Link**: TF-IDF with phrase canonicalisation (e.g. "cooling-off", "kill switch", "data principal") plus concept and topic bonuses. Controls are also inherited from library obligations that say the same thing. Confidence is calibrated to the 45–95% range.
4. **Propagate**: best-path (max-product) traversal over typed, weighted edges (policy *governs* process *runs on* system *exposes* API, *stores* data, *is controlled by* control, *is evidenced by* evidence, *is owned by* team). Reach is structural (edge weights × 0.92 per hop, threshold 0.3). The reported score is that value × the confidence of the originating link.
5. **Cross-map**: similarity to MAS and RBI obligations, plus a stricter/looser comparison of the parameters.

## Files
```
index.html        app shell (9 views)
css/style.css     console theme
js/text.js        NLP: canonicalisation, stemming, TF-IDF, clauses, modality, parameters, diff
js/bank.js        SyntheticBank-360: 500 nodes / 967 links + 54-obligation MAS/RBI library
js/corpus.js      5 synthetic demo circulars with expert anchors
js/engine.js      linking, propagation, cross-map, diff, link prediction, tickets
js/benchmark.js   ground truth + baselines + metrics
js/graph3d.js     Three.js 3D tower, bloom, waves, particles, path tubes, picking
js/app.js         UI controller, audit chain, exports, deep links
js/tour.js        guided tour
tools/benchmark.mjs  headless run
```

## Honesty notes
- The bank, circulars and labels are **synthetic**. The demo circulars are styled after MAS and RBI circulars but were **not issued by any regulator**. Library obligations are short paraphrases, not legal text.
- Impact scores rank items for human review; they are not legal conclusions. Every ticket needs analyst approval.

## Roadmap (from the idea deck)
Neo4j store · PyTorch Geometric link prediction · LLM clause extraction with citations · FastAPI backend (Docker, on-prem) · graph built automatically from the CMDB, OpenAPI specs, data catalogue and GRC controls · pilot in the MAS / RBI sandboxes.
