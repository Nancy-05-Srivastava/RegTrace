// Text pipeline: phrase canonicalisation, tokenising, light stemming, TF-IDF vectors,
// clause splitting, obligation modality, parameter extraction and word-level diff.
// Everything runs in the browser (and in Node for the benchmark) with no dependencies.

const STOP = new Set(`a an the and or of to in on for by with from at as is are be been being this that these those it its
which who whom whose such any all each every other than then into onto upon under over within without not no nor
shall must should may will would can could also including include includes where when while before after so
their there them they he she his her our we us you your i per via etc same both either neither whether
regulated entity entities institution institutions financial bank banks reserve monetary authority singapore india
mas rbi demo circular clause paragraph section requirement requirements provided ensure ensures shall following`.split(/\s+/));

// Multi-word phrases that mean one concept. Applied before tokenising.
const PHRASES = [
  [/kill[\s-]?switch(es)?/g, ' killswitch '],
  [/cooling[\s-]?(off|period)( period)?/g, ' coolingoff '],
  [/data principals?|data subjects?/g, ' datasubject '],
  [/personal data/g, ' personaldata '],
  [/payment system data|payment data/g, ' paymentdata '],
  [/money mules?|mule accounts?/g, ' mule '],
  [/new device|device binding|bound to (a|the) customer'?s? (account|device)|bind(ing)? .{0,20}device/g, ' devicebind '],
  [/real[\s-]?time/g, ' realtime '],
  [/key fact statement/g, ' kfs '],
  [/beneficial own(er|ers|ership)/g, ' beneficialowner '],
  [/video[\s-]?(based )?(kyc|customer identification)|v-cip/g, ' videokyc '],
  [/penetration test(ing|s)?/g, ' pentest '],
  [/disaster recovery/g, ' disasterrecovery '],
  [/exit (plan|plans|strategy|strategies)/g, ' exitplan '],
  [/(beneficiary|payee) name|name (check|confirmation|verification)|verify the (beneficiary|payee) name/g, ' nameconfirm '],
  [/sanctions? lists?/g, ' sanctions '],
  [/cross[\s-]border/g, ' crossborder '],
  [/two[\s-]factor|multi[\s-]factor|2fa|mfa/g, ' authentication '],
  [/third[\s-]party|sub[\s-]?contractors?|service providers?/g, ' thirdparty '],
  [/data protection board/g, ' regulator '],
  [/upi[\s–-]+paynow/g, ' upi paynow '],
];

const CANON = {
  otp: 'authentication', biometric: 'authentication', factors: 'authentication', factor: 'authentication', authenticate: 'authentication', authenticated: 'authentication',
  beneficiary: 'payee', beneficiaries: 'payee', payees: 'payee', recipient: 'payee', recipients: 'payee',
  remittance: 'crossborder', remittances: 'crossborder', overseas: 'crossborder', abroad: 'crossborder', outward: 'crossborder', international: 'crossborder',
  cdd: 'kyc', mules: 'mule', str: 'suspicious', strs: 'suspicious',
  erase: 'erasure', erased: 'erasure', deletion: 'erasure', delete: 'erasure', deleted: 'erasure',
  vendor: 'thirdparty', vendors: 'thirdparty', outsourcing: 'thirdparty', outsourced: 'thirdparty', supplier: 'thirdparty',
  notify: 'notification', notified: 'notification', notifications: 'notification', alert: 'notification', alerts: 'notification',
  intimated: 'notification', intimate: 'notification', sms: 'notification', acknowledged: 'notification',
  recover: 'recovery', recoverable: 'recovery', restore: 'recovery', recovered: 'recovery',
  backups: 'backup', scams: 'scam', fraudulent: 'fraud', frauds: 'fraud', sanction: 'sanctions',
  encrypt: 'encryption', encrypted: 'encryption', cryptographic: 'encryption',
  login: 'authentication', logon: 'authentication',
  limits: 'limit', daily: 'limit',
};

export function stem(w) {
  if (w.length <= 4) return w;
  const rules = [['isation', 'ise'], ['ization', 'ize'], ['ational', 'ate'], ['ations', 'ate'], ['ation', 'ate'], ['ments', ''], ['ment', ''],
    ['ings', ''], ['ing', ''], ['ness', ''], ['ities', ''], ['ity', ''], ['ies', 'y'], ['ied', 'y'], ['edly', ''], ['ed', ''], ['es', ''],
    ['ers', ''], ['er', ''], ['ly', ''], ['s', '']];
  for (const [suf, rep] of rules) {
    if (w.endsWith(suf) && w.length - suf.length >= 4) return w.slice(0, -suf.length) + rep;
  }
  return w;
}

export function normalise(text) {
  let t = ' ' + String(text).toLowerCase().replace(/[’']/g, "'") + ' ';
  for (const [re, rep] of PHRASES) t = t.replace(re, rep);
  return t;
}

export function tokenize(text) {
  const out = [];
  for (let raw of normalise(text).split(/[^a-z0-9$₹]+/)) {
    if (!raw || raw.length < 3 || /^\d+$/.test(raw)) continue;
    raw = CANON[raw] || raw;
    if (STOP.has(raw)) continue;
    out.push(stem(raw));
  }
  return out;
}

// ---------------------------------------------------------------- topics
export const TOPIC_LABELS = {
  auth: 'Authentication', payments: 'Cross-border payments', kyc: 'KYC / CDD', aml: 'AML / CFT', fraud: 'Fraud & scams',
  privacy: 'Data privacy', cyber: 'Cyber security', outsourcing: 'Third-party & cloud', resilience: 'Resilience',
  reporting: 'Reporting', cards: 'Cards', lending: 'Digital lending',
};
const TOPIC_WORDS = {
  auth: 'authentication session password credential devicebind sim step-up privileged access identity token',
  payments: 'crossborder payment transfer upi paynow payee settlement limit coolingoff nameconfirm paymentdata remit fx',
  kyc: 'kyc onboarding verification beneficialowner videokyc diligence liveness geo-tagging account opening',
  aml: 'suspicious sanctions screening monitoring laundering records pep typology',
  fraud: 'fraud scam mule killswitch surveillance freeze',
  privacy: 'personaldata consent privacy datasubject erasure retention breach purpose',
  cyber: 'cyber incident patch vulnerability pentest encryption security soc keys',
  outsourcing: 'thirdparty cloud exitplan contract outsourcing register',
  resilience: 'disasterrecovery recovery backup outage availability resilience downtime immutable',
  reporting: 'report return board reporting returns',
  cards: 'card cards token tokenisation merchant',
  lending: 'loan lending borrower kfs disbursal collection',
};
export const TOPICS = Object.keys(TOPIC_LABELS);
const TOPIC_STEMS = Object.fromEntries(Object.entries(TOPIC_WORDS).map(([k, v]) => [k, new Set(tokenize(v))]));

export function topicsOf(tokens, min = 1) {
  const score = {};
  for (const t of tokens) for (const k of TOPICS) if (TOPIC_STEMS[k].has(t)) score[k] = (score[k] || 0) + 1;
  return Object.entries(score).filter(([, v]) => v >= min).sort((a, b) => b[1] - a[1]).map(([k]) => k);
}

// Concepts that are strong, specific signals when two texts share them.
export const CONCEPTS = new Set(tokenize('killswitch coolingoff datasubject personaldata paymentdata mule devicebind kfs beneficialowner videokyc pentest disasterrecovery exitplan nameconfirm sanctions consent breach backup erasure suspicious payee'));

// ---------------------------------------------------------------- TF-IDF
export class TfIdf {
  constructor(docs) {
    this.df = new Map();
    this.n = docs.length;
    for (const toks of docs) for (const t of new Set(toks)) this.df.set(t, (this.df.get(t) || 0) + 1);
  }
  idf(t) { return Math.log((this.n + 1) / ((this.df.get(t) || 0) + 1)) + 1; }
  vector(tokens) {
    const tf = new Map();
    for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
    let norm = 0;
    const v = new Map();
    for (const [t, c] of tf) { const w = (1 + Math.log(c)) * this.idf(t); v.set(t, w); norm += w * w; }
    norm = Math.sqrt(norm) || 1;
    for (const [t, w] of v) v.set(t, w / norm);
    return v;
  }
  topTerms(tokens, k = 6) {
    const seen = [...new Set(tokens)];
    return seen.sort((a, b) => this.idf(b) - this.idf(a)).slice(0, k);
  }
}
export function cosine(a, b) {
  if (a.size > b.size) [a, b] = [b, a];
  let s = 0;
  for (const [t, w] of a) { const o = b.get(t); if (o) s += w * o; }
  return s;
}

// ---------------------------------------------------------------- clauses
const NUM_START = /^\s*(?:\d+(?:\.\d+)*[.)]|\(\w{1,4}\)|[a-z][.)]|[ivx]+[.)]|•|-)\s+/i;

export function splitClauses(text) {
  const lines = String(text).replace(/\r/g, '').split('\n');
  const clauses = [];
  let cur = null;
  let numbered = 0;
  for (const line of lines) {
    if (NUM_START.test(line)) {
      numbered++;
      if (cur) clauses.push(cur);
      cur = line.replace(NUM_START, '').trim();
    } else if (cur !== null && line.trim()) {
      cur += ' ' + line.trim();
    } else if (cur !== null && !line.trim()) {
      clauses.push(cur); cur = null;
    }
  }
  if (cur) clauses.push(cur);
  let out = clauses;
  if (numbered < 2) {
    // Unnumbered text: fall back to sentences that carry an obligation.
    out = String(text).replace(/\s+/g, ' ').split(/(?<=[.;])\s+(?=[A-Z(])/)
      .filter((s) => /\b(shall|must|should|required|is to|are to|will be required)\b/i.test(s));
  }
  return out.map((s) => s.replace(/\s+/g, ' ').trim()).filter((s) => s.length >= 40 && /[a-z]/i.test(s));
}

export function modality(text) {
  const t = text.toLowerCase();
  if (/\b(shall not|must not|prohibited|not be permitted|shall not be)\b/.test(t)) return 'prohibition';
  if (/\b(shall|must|is required to|are required to|mandatory|will be required)\b/.test(t)) return 'mandatory';
  if (/\b(should|expected to|encouraged)\b/.test(t)) return 'recommended';
  if (/\bmay\b/.test(t)) return 'permissive';
  return 'informational';
}
export function modalityWord(text) {
  const m = text.match(/\b(shall not|must not|shall|must|is required to|are required to|should|may)\b/i);
  return m ? m[0] : null;
}

// ---------------------------------------------------------------- parameters
const UNIT_H = { minute: 1 / 60, hour: 1, day: 24, 'business day': 24, 'working day': 24, 'calendar day': 24, week: 168, month: 730, year: 8760 };
const FREQ_H = { annually: 8760, yearly: 8760, 'semi-annually': 4380, 'half-yearly': 4380, quarterly: 2190, monthly: 730, weekly: 168 };
export const INR_PER_SGD = 64; // indicative rate, used only to compare thresholds across regulators

function kindFrom(before) {
  const b = before.toLowerCase();
  if (/(at least|not less than|minimum of|no less than)\s*(once\s*)?every\s*$/.test(b) || /every\s*$/.test(b)) return 'interval';
  if (/(within|no later than|not later than|not exceeding)\s*$/.test(b)) return 'deadline';
  if (/(at least|not less than|minimum of|no less than)\s*$/.test(b)) return 'minimum';
  if (/(above|exceeding|more than|over|up to|limit of|maximum of|beyond)\s*$/.test(b)) return 'cap';
  if (/for the first\s*$/.test(b)) return 'period';
  return 'value';
}

export function extractParams(text) {
  const out = [];
  const t = text.replace(/,(?=\d{2,3}\b)/g, '');
  const reTime = /(\d+(?:\.\d+)?)\s*(minutes?|hours?|business days?|working days?|calendar days?|days?|weeks?|months?|years?)\b/gi;
  let m;
  while ((m = reTime.exec(t))) {
    const unit = m[2].toLowerCase().replace(/s$/, '');
    const hours = parseFloat(m[1]) * (UNIT_H[unit] ?? 1);
    out.push({ dim: 'time', kind: kindFrom(t.slice(Math.max(0, m.index - 28), m.index)), value: hours, raw: m[0] });
  }
  const reFreq = /\b(at least\s+)?(annually|yearly|semi-annually|half-yearly|quarterly|monthly|weekly)\b/gi;
  while ((m = reFreq.exec(t))) out.push({ dim: 'time', kind: 'interval', value: FREQ_H[m[2].toLowerCase()], raw: m[0] });
  const reMoney = /(S\$|SGD\s?|₹|INR\s?|Rs\.?\s?)\s?(\d+(?:\.\d+)?)\s*(lakh|crore|million|k)?/gi;
  while ((m = reMoney.exec(t))) {
    let v = parseFloat(m[2]);
    const mult = { lakh: 1e5, crore: 1e7, million: 1e6, k: 1e3 }[(m[3] || '').toLowerCase()] || 1;
    v *= mult;
    const sgd = /S\$|SGD/i.test(m[1]);
    out.push({ dim: 'money', kind: kindFrom(t.slice(Math.max(0, m.index - 28), m.index)), value: sgd ? v * INR_PER_SGD : v, raw: m[0].trim(), ccy: sgd ? 'SGD' : 'INR' });
  }
  return out;
}

// Is `a` stricter than `b`? (same dim and kind). Returns 1 stricter, 0 equal, -1 looser, null not comparable.
export function stricter(a, b) {
  if (a.dim !== b.dim) return null;
  // A bare value ("a 12-hour cooling-off") takes the qualifier of the value it is compared with.
  const kind = a.kind === 'value' ? b.kind : b.kind === 'value' ? a.kind : a.kind === b.kind ? a.kind : null;
  if (!kind || kind === 'value') return null;
  if (Math.abs(a.value - b.value) < 1e-9) return 0;
  const smallerIsStricter = ['deadline', 'interval', 'cap'].includes(kind);
  if (!smallerIsStricter && kind !== 'minimum') return null;
  return (a.value < b.value) === smallerIsStricter ? 1 : -1;
}

export function fmtHours(h) {
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 48) return `${+h.toFixed(1)} h`;
  if (h < 24 * 60) return `${+(h / 24).toFixed(1)} days`;
  if (h < 8760 * 1.5) return `${+(h / 730).toFixed(1)} months`;
  return `${+(h / 8760).toFixed(1)} years`;
}
export function fmtParam(p) {
  const v = p.dim === 'time' ? fmtHours(p.value) : p.dim === 'money' ? (p.ccy === 'SGD' ? `S$${Math.round(p.value / INR_PER_SGD).toLocaleString('en-SG')}` : `₹${Math.round(p.value).toLocaleString('en-IN')}`) : p.value;
  return `${p.kind} ${v}`;
}

// ---------------------------------------------------------------- dates & regulator
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
export function findDate(text, cue = /(effective|come into (force|effect)|with effect|applicable|comply)[^.]{0,40}?/i) {
  const re = /(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/gi;
  let m, best = null;
  while ((m = re.exec(text))) {
    const d = new Date(Date.UTC(+m[3], MONTHS.indexOf(m[2].toLowerCase()), +m[1]));
    const before = text.slice(Math.max(0, m.index - 60), m.index);
    if (cue.test(before)) return d;
    if (!best) best = d;
  }
  return best;
}
export function detectRegulator(text) {
  const t = text.slice(0, 1500);
  const rbi = (t.match(/\b(RBI|Reserve Bank|rupee|₹|India)\b/gi) || []).length;
  const mas = (t.match(/\b(MAS|Monetary Authority|Singapore|S\$)\b/gi) || []).length;
  if (rbi === mas) return null;
  return rbi > mas ? 'RBI' : 'MAS';
}

// ---------------------------------------------------------------- diff
export function wordDiff(a, b) {
  const A = a.split(/\s+/), B = b.split(/\s+/);
  const n = A.length, m = B.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { ops.push(['=', A[i]]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) ops.push(['-', A[i++]]);
    else ops.push(['+', B[j++]]);
  }
  while (i < n) ops.push(['-', A[i++]]);
  while (j < m) ops.push(['+', B[j++]]);
  return ops;
}
