// Spotlight walkthrough. Each step: { chapter, sel, title, what, why, how, before, wait, place }.
// `what` / `why` / `how` may be functions so the text is written from the live results, not canned.
// Optional auto-play advances on a reading timer (or when narration finishes).
export class Tour {
  constructor(steps) { this.steps = steps; this.i = 0; }

  start() {
    this.root = document.getElementById('tour');
    this.hole = this.root.querySelector('.tour-hole');
    this.card = this.root.querySelector('.tour-card');
    this.root.hidden = false;
    this.auto = document.getElementById('tour-auto');
    this.voice = document.getElementById('tour-voice');
    this.voice.disabled = !('speechSynthesis' in window);
    document.getElementById('tour-next').onclick = () => this.go(this.i + 1);
    document.getElementById('tour-prev').onclick = () => this.go(this.i - 1);
    document.getElementById('tour-skip').onclick = () => this.end();
    this.auto.onchange = () => this.schedule();
    this.voice.onchange = () => { if (this.voice.checked) this.speak(); else speechSynthesis.cancel(); };
    this.onKey = (e) => {
      if (e.key === 'Escape') this.end();
      if (e.key === 'ArrowRight') this.go(this.i + 1);
      if (e.key === 'ArrowLeft') this.go(this.i - 1);
    };
    window.addEventListener('keydown', this.onKey);
    this.onResize = () => this.place();
    window.addEventListener('resize', this.onResize);
    this.go(0);
  }

  text(v) { return typeof v === 'function' ? v() : v; }

  async go(i) {
    if (i < 0 || this.busy) return;
    if (i >= this.steps.length) return this.end();
    this.busy = true;
    clearTimeout(this.timer);
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    this.i = i;
    const s = this.steps[i];
    this.card.style.opacity = '0.4';
    try { await s.before?.(); } catch (e) { console.error(e); }
    if (this.root.hidden) { this.busy = false; return; }
    await new Promise((r) => setTimeout(r, s.wait ?? 350));
    const parts = [['What you are seeing', s.what], ['Why it matters', s.why], ['How it works', s.how]];
    this.current = { title: s.title, parts: parts.map(([k, v]) => [k, this.text(v)]).filter(([, v]) => v) };
    document.getElementById('tour-step').textContent = `Step ${i + 1} of ${this.steps.length}`;
    document.getElementById('tour-chapter').textContent = s.chapter || '';
    document.getElementById('tour-title').textContent = s.title;
    document.getElementById('tour-body').innerHTML = this.current.parts.map(([k, v]) => `<b class="k">${k}</b><p>${v}</p>`).join('');
    document.getElementById('tour-bar').style.width = `${((i + 1) / this.steps.length) * 100}%`;
    document.getElementById('tour-next').textContent = i === this.steps.length - 1 ? 'Finish' : 'Next';
    document.getElementById('tour-prev').disabled = i === 0;
    this.card.style.opacity = '1';
    this.place();
    this.busy = false;
    if (this.voice.checked) this.speak(); else this.schedule();
  }

  plain() {
    const div = document.createElement('div');
    div.innerHTML = this.current.parts.map(([, v]) => v).join(' ');
    return `${this.current.title}. ${div.textContent}`;
  }

  speak() {
    if (!('speechSynthesis' in window) || !this.current) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(this.plain());
    u.rate = 1.03;
    const v = speechSynthesis.getVoices().find((x) => /en[-_](GB|IN|SG|US)/i.test(x.lang) && /natural|google|microsoft/i.test(x.name));
    if (v) u.voice = v;
    u.onend = () => { if (this.auto.checked && !this.root.hidden) this.timer = setTimeout(() => this.go(this.i + 1), 600); };
    speechSynthesis.speak(u);
  }

  schedule() {
    clearTimeout(this.timer);
    if (!this.auto.checked || this.voice.checked || !this.current) return;
    const words = this.plain().split(/\s+/).length;
    this.timer = setTimeout(() => this.go(this.i + 1), Math.max(5000, words * 330));
  }

  place() {
    const s = this.steps[this.i];
    const el = s.sel && document.querySelector(s.sel);
    const vw = window.innerWidth, vh = window.innerHeight, cw = Math.min(440, vw - 20), ch = this.card.offsetHeight || 260, m = 14;
    this.card.style.width = `${cw}px`;
    if (!el) {
      Object.assign(this.hole.style, { left: `${vw / 2}px`, top: `${vh / 2}px`, width: '0px', height: '0px' });
      Object.assign(this.card.style, { left: `${(vw - cw) / 2}px`, top: `${Math.max(10, (vh - ch) / 2)}px` });
      return;
    }
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const r = el.getBoundingClientRect();
    const pad = 6;
    const box = { left: Math.max(4, r.left - pad), top: Math.max(4, r.top - pad), width: Math.min(vw - 8, r.width + pad * 2), height: Math.min(vh - 8, r.height + pad * 2) };
    Object.assign(this.hole.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
    let x, y;
    const place = s.place || 'bottom';
    if (place === 'right') { x = box.left + box.width + m; y = box.top; }
    else if (place === 'left') { x = box.left - cw - m; y = box.top; }
    else if (place === 'top') { x = box.left; y = box.top - ch - m; }
    else if (place === 'center') { x = box.left + box.width / 2 - cw / 2; y = box.top + box.height - ch - 30; }
    else { x = box.left; y = box.top + box.height + m; }
    if (y + ch > vh - 10) y = Math.max(10, vh - ch - 10);
    if (y < 10) y = 10;
    x = Math.min(Math.max(10, x), vw - cw - 10);
    Object.assign(this.card.style, { left: `${x}px`, top: `${y}px` });
  }

  end() {
    clearTimeout(this.timer);
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    this.root.hidden = true;
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('resize', this.onResize);
  }
}
