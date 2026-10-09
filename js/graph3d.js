// 3D "dependency tower": the bank's Financial Regulatory Dependency Graph as stacked layers
// (regulations on top, owning teams at the bottom). Nodes of the same topic share an angular sector,
// so impact flows read as vertical streams. Impact propagation animates as a wave with particles.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { LAYERS, LAYER_LABEL } from './bank.js';
import { TOPICS, TOPIC_LABELS } from './text.js';
import { RNG } from './rng.js';

export const TYPE_COLOR = {
  clause: '#7df9ff', policy: '#b197fc', process: '#4dabf7', system: '#3bc9db', api: '#63e6be',
  datastore: '#ffd43b', control: '#f783ac', evidence: '#adb5bd', team: '#e9ecef',
};
export const REG_COLOR = { MAS: '#ff4d6d', RBI: '#ff9f43' };
const REGION_COLOR = { SG: '#ef3340', IN: '#ff9933', Global: '#6b7fa8' };
const HEAT = [[0.3, '#1e6bff'], [0.5, '#00d5ff'], [0.75, '#9ffcf0'], [1, '#ffffff']].map(([s, c]) => [s, new THREE.Color(c)]);
const BAND = {
  regulation: [34, 66], policy: [22, 50], process: [30, 62], system: [24, 64], api: [36, 70],
  datastore: [26, 60], control: [30, 66], evidence: [38, 72], team: [42, 42], clause: [18, 44],
};
const GEO = {
  regulation: () => new THREE.OctahedronGeometry(1.55),
  clause: () => new THREE.IcosahedronGeometry(2.5, 0),
  policy: () => new THREE.DodecahedronGeometry(1.75),
  process: () => new THREE.SphereGeometry(1.35, 20, 14),
  system: () => new THREE.BoxGeometry(2.1, 2.1, 2.1),
  api: () => new THREE.TetrahedronGeometry(1.25),
  datastore: () => new THREE.CylinderGeometry(1.2, 1.2, 1.9, 18),
  control: () => new THREE.IcosahedronGeometry(1.45, 0),
  evidence: () => new THREE.BoxGeometry(1.1, 1.45, 0.3),
  team: () => new THREE.TorusGeometry(1.7, 0.5, 10, 28),
};

export function heat(score) {
  const s = Math.max(0.3, Math.min(1, score));
  for (let i = 1; i < HEAT.length; i++) if (s <= HEAT[i][0]) {
    const [a, ca] = HEAT[i - 1], [b, cb] = HEAT[i];
    return ca.clone().lerp(cb, (s - a) / (b - a));
  }
  return HEAT[HEAT.length - 1][1].clone();
}

export class Graph3D {
  constructor(container, engine, { onSelect, onHover } = {}) {
    this.engine = engine;
    this.bank = engine.bank;
    this.onSelect = onSelect; this.onHover = onHover;
    this.spacing = 15;
    this.colorMode = 'type';
    this.focusOnly = false;
    this.showLabels = true;
    this.hiddenTypes = new Set();
    this.result = null;
    this.activation = new Map();
    this.clock = new THREE.Clock();
    this.waveT = 0;

    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(2, window.devicePixelRatio));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    this.css = new CSS2DRenderer();
    this.css.domElement.className = 'css2d';
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#050913');
    this.scene.fog = new THREE.FogExp2('#050913', 0.0032);
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.5, 3000);
    this.camera.position.set(150, 95, 170);
    this.home = null;
    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.45;
    this.controls.target.set(0, 0, 0);
    this.controls.maxDistance = 900; this.controls.minDistance = 20;

    this.scene.add(new THREE.HemisphereLight('#bcd4ff', '#0b1020', 1.1));
    const dl = new THREE.DirectionalLight('#ffffff', 1.6); dl.position.set(80, 160, 120); this.scene.add(dl);
    const dl2 = new THREE.DirectionalLight('#7aa2ff', 0.6); dl2.position.set(-120, -40, -80); this.scene.add(dl2);

    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.75, 0.42, 0.9);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.root = new THREE.Group(); this.scene.add(this.root);
    this.addStars();
    this.layout();
    this.buildLayers();
    this.buildNodes();
    this.buildEdges();
    this.buildParticles();
    this.buildMarkers();

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    const dom = r.domElement;
    dom.addEventListener('pointermove', (e) => this.pointer(e, false));
    dom.addEventListener('pointerdown', (e) => { this.downAt = [e.clientX, e.clientY]; this.controls.autoRotate = false; });
    dom.addEventListener('pointerup', (e) => {
      if (this.downAt && Math.hypot(e.clientX - this.downAt[0], e.clientY - this.downAt[1]) < 5) this.pointer(e, true);
    });
    this.mount(container);
    const k = this.R / 78;
    this.home = new THREE.Vector3(150 * k, 95 * k, 170 * k);
    this.camera.position.copy(this.home);
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    this.scene.traverse((o) => { o.geometry?.dispose?.(); if (o.material) [].concat(o.material).forEach((m) => { m.map?.dispose?.(); m.dispose?.(); }); });
    this.composer.dispose?.();
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
    this.renderer.domElement.remove();
    this.css.domElement.remove();
  }

  mount(container) {
    this.container = container;
    container.appendChild(this.renderer.domElement);
    container.appendChild(this.css.domElement);
    this.resize();
  }

  resize() {
    const w = this.container.clientWidth || 800, h = this.container.clientHeight || 600;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
    this.css.setSize(w, h);
  }

  // ------------------------------------------------------------------ layout
  layerY(type) {
    const i = type === 'clause' ? -1.15 : LAYERS.indexOf(type);
    return ((LAYERS.length - 1) / 2 - i) * this.spacing;
  }

  layout() {
    const rng = new RNG(7);
    this.pos = new Map(); // id → {x, z, layer}
    const sector = (2 * Math.PI) / TOPICS.length;
    const byLayer = {};
    for (const n of this.bank.list) (byLayer[n.type] = byLayer[n.type] || []).push(n);
    this.R = 78;
    for (const [type, list] of Object.entries(byLayer)) {
      const f = Math.min(2.2, Math.max(1, Math.sqrt(list.length / 70)));
      const [r0, r1] = BAND[type].map((r) => r * f);
      this.R = Math.max(this.R, r1 + 8);
      if (type === 'team') {
        list.forEach((n, i) => { const a = (i / list.length) * Math.PI * 2; this.pos.set(n.id, { x: Math.cos(a) * r0, z: Math.sin(a) * r0, type }); });
        continue;
      }
      const groups = {};
      for (const n of list) (groups[n.topic] = groups[n.topic] || []).push(n);
      for (const [topic, g] of Object.entries(groups)) {
        g.forEach((n, i) => {
          let a, rad;
          if (topic === 'shared') { a = rng.range(0, Math.PI * 2); rad = rng.range(4, 17); }
          else {
            const k = TOPICS.indexOf(topic);
            const frac = g.length === 1 ? 0.5 : i / (g.length - 1);
            a = (k + 0.5) * sector + (frac - 0.5) * sector * 0.78 + rng.range(-0.05, 0.05);
            rad = r0 + ((i * 0.618) % 1) * (r1 - r0);
          }
          this.pos.set(n.id, { x: Math.cos(a) * rad, z: Math.sin(a) * rad, type });
        });
      }
      // Relax overlaps inside the layer.
      const pts = list.map((n) => this.pos.get(n.id));
      for (let it = 0; it < 40; it++) {
        for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[j].x - pts[i].x, dz = pts[j].z - pts[i].z, d = Math.hypot(dx, dz) || 0.01, min = 4.6;
          if (d < min) { const f = (min - d) / 2 / d; pts[i].x -= dx * f; pts[i].z -= dz * f; pts[j].x += dx * f; pts[j].z += dz * f; }
        }
      }
    }
  }

  P(id) {
    const p = this.pos.get(id);
    return new THREE.Vector3(p.x, this.layerY(p.type), p.z);
  }

  // ------------------------------------------------------------------ scene pieces
  addStars() {
    const g = new THREE.BufferGeometry();
    const rng = new RNG(3), n = 1800, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = rng.next() * 2 - 1, th = rng.next() * Math.PI * 2, r = 700 + rng.next() * 500, s = Math.sqrt(1 - u * u);
      a.set([r * s * Math.cos(th), r * u, r * s * Math.sin(th)], i * 3);
    }
    g.setAttribute('position', new THREE.BufferAttribute(a, 3));
    this.scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: '#5b6b93', size: 1.4, sizeAttenuation: false, fog: false })));
  }

  buildLayers() {
    this.layerGroup = new THREE.Group(); this.root.add(this.layerGroup);
    this.layerObjs = [];
    const types = ['clause', ...LAYERS];
    for (const type of types) {
      const g = new THREE.Group();
      const R = type === 'clause' ? 50 : this.R;
      const disc = new THREE.Mesh(new THREE.CircleGeometry(R, 96), new THREE.MeshBasicMaterial({ color: type === 'clause' ? '#0f2740' : '#0e1a33', transparent: true, opacity: type === 'clause' ? 0.18 : 0.13, side: THREE.DoubleSide, depthWrite: false }));
      disc.rotation.x = -Math.PI / 2;
      g.add(disc);
      const ringPts = [];
      for (let i = 0; i <= 128; i++) { const a = (i / 128) * Math.PI * 2; ringPts.push(new THREE.Vector3(Math.cos(a) * R, 0, Math.sin(a) * R)); }
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ringPts), new THREE.LineBasicMaterial({ color: type === 'clause' ? '#2ad4ff' : '#26406e', transparent: true, opacity: type === 'clause' ? 0.45 : 0.5 })));
      const el = document.createElement('div');
      el.className = 'layer-label' + (type === 'clause' ? ' is-clause' : '');
      el.textContent = type === 'clause' ? 'Incoming circular' : LAYER_LABEL[type];
      const lab = new CSS2DObject(el);
      lab.position.set(R + 4, 0, 0);
      g.add(lab);
      g.userData = { type, label: lab };
      g.visible = type !== 'clause';
      lab.visible = g.visible;
      this.layerGroup.add(g);
      this.layerObjs.push(g);
    }
    // topic labels around the top layer
    this.topicLabels = new THREE.Group(); this.root.add(this.topicLabels);
    const sector = (2 * Math.PI) / TOPICS.length;
    TOPICS.forEach((t, k) => {
      const el = document.createElement('div');
      el.className = 'topic-label';
      el.textContent = TOPIC_LABELS[t];
      const o = new CSS2DObject(el);
      const a = (k + 0.5) * sector;
      o.userData.a = a;
      this.topicLabels.add(o);
    });
    this.placeLayers();
  }

  placeLayers() {
    for (const g of this.layerObjs) g.position.y = this.layerY(g.userData.type);
    for (const o of this.topicLabels.children) o.position.set(Math.cos(o.userData.a) * (this.R + 10), this.layerY('regulation') + 3, Math.sin(o.userData.a) * 88);
  }

  buildNodes() {
    this.meshes = new Map();
    this.idx = new Map(); // id → {mesh, i}
    const byType = {};
    for (const n of this.bank.list) (byType[n.type] = byType[n.type] || []).push(n);
    for (const [type, list] of Object.entries(byType)) this.makeMesh(type, list.map((n) => n.id), 0);
    this.dummy = new THREE.Object3D();
    this.baseColor = new Map();
    for (const n of this.bank.list) this.baseColor.set(n.id, new THREE.Color(n.type === 'regulation' ? REG_COLOR[n.regulator] : TYPE_COLOR[n.type]));
    this.updateNodes(true);
  }

  makeMesh(type, ids, extra) {
    const geo = GEO[type]();
    const mat = new THREE.MeshStandardMaterial({ metalness: 0.25, roughness: 0.42, flatShading: ['policy', 'control', 'regulation', 'clause', 'api'].includes(type) });
    const mesh = new THREE.InstancedMesh(geo, mat, ids.length + extra);
    mesh.count = ids.length;
    mesh.userData = { type, ids };
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    ids.forEach((id, i) => this.idx.set(id, { mesh, i }));
    this.root.add(mesh);
    this.meshes.set(type, mesh);
    return mesh;
  }

  nodeType(id) { return this.pos.get(id)?.type; }

  targetLook(id) {
    // returns {color, scale} for current mode
    const type = this.nodeType(id);
    const base = this.baseColor.get(id) || new THREE.Color(TYPE_COLOR.clause);
    const hidden = this.hiddenTypes.has(type === 'clause' ? 'regulation' : type);
    if (hidden) return { color: base, scale: 0 };
    const res = this.result;
    const isClause = type === 'clause';
    let col = base.clone(), scale = 1;
    if (this.colorMode === 'region') {
      const n = this.bank.nodes.get(id);
      col = new THREE.Color(REGION_COLOR[n?.region] || REGION_COLOR.Global);
    }
    if (res) {
      const r = res.impact.get(id);
      const act = this.activation.get(id);
      if (isClause) { col = new THREE.Color(TYPE_COLOR.clause).multiplyScalar(1.7); scale = 1; }
      else if (r) {
        const t = act === undefined ? 1 : Math.max(0, Math.min(1, (this.waveT - act) / 0.45));
        const glow = type === 'team' || type === 'evidence' ? 0.55 : 1;
        const hot = this.colorMode === 'impact' ? heat(r.score).multiplyScalar((0.9 + r.score * 0.9) * glow) : col.clone().multiplyScalar((0.85 + r.score * 1.0) * glow);
        const dim = col.clone().multiplyScalar(0.16);
        col = dim.lerp(hot, t);
        scale = 1 + t * (0.1 + r.score * 0.5) * (type === 'team' ? 0.4 : 1) + (t > 0 && t < 1 ? Math.sin(t * Math.PI) * 0.4 : 0);
      } else {
        col = col.multiplyScalar(this.focusOnly ? 0.05 : 0.14);
        scale = this.focusOnly ? 0.55 : 0.85;
      }
    } else if (this.colorMode === 'impact') {
      col = new THREE.Color('#41557d');
    }
    if (this.selected === id) { scale *= 1.5; col.multiplyScalar(1.25); }
    if (this.hovered === id) scale *= 1.3;
    return { color: col, scale };
  }

  updateNodes() {
    for (const [, mesh] of this.meshes) {
      const ids = mesh.userData.ids;
      for (let i = 0; i < mesh.count; i++) {
        const id = ids[i];
        const { color, scale } = this.targetLook(id);
        const p = this.P(id);
        this.dummy.position.copy(p);
        this.dummy.scale.setScalar(scale);
        this.dummy.rotation.set(0, (p.x + p.z) * 0.05, 0);
        if (mesh.userData.type === 'team') this.dummy.rotation.set(Math.PI / 2, 0, 0);
        this.dummy.updateMatrix();
        mesh.setMatrixAt(i, this.dummy.matrix);
        mesh.setColorAt(i, color);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  // ------------------------------------------------------------------ edges
  buildEdges() {
    const max = this.bank.edges.length + 600;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(max * 6), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(max * 6), 3));
    this.edgeLines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.edgeLines.frustumCulled = false;
    this.root.add(this.edgeLines);
    this.updateEdges();
  }

  edgeList() {
    const list = this.engine.observedEdges.filter((e) => this.pos.has(e.s) && this.pos.has(e.t));
    if (this.result) for (const c of this.result.clauses) for (const a of c.anchors) list.push({ s: `cl_${c.n}`, t: a.id, type: 'anchor', score: a.conf });
    return list;
  }

  updateEdges() {
    const list = this.edgeList();
    const pos = this.edgeLines.geometry.attributes.position.array, col = this.edgeLines.geometry.attributes.color.array;
    let k = 0;
    const res = this.result;
    const c1 = new THREE.Color(), c2 = new THREE.Color();
    this.flowEdges = [];
    for (const e of list) {
      const ts = this.nodeType(e.s), tt = this.nodeType(e.t);
      if (this.hiddenTypes.has(ts) || this.hiddenTypes.has(tt)) continue;
      if (ts === 'clause' && this.hiddenTypes.has('regulation')) continue;
      let a = 0.11, color = '#3a5a9a';
      if (e.type === 'satisfied_by' || e.type === 'implemented_in') { a = 0.05; color = '#7a5a9a'; }
      if (e.type === 'owned_by') { a = 0.035; color = '#8899bb'; }
      if (e.accepted) { a = 0.6; color = '#ff6bd6'; }
      let on = false;
      if (res) {
        const rt = res.impact.get(e.t);
        if (e.type === 'anchor') {
          const act = this.activation.get(e.t);
          on = act === undefined || this.waveT >= act;
          a = on ? 0.55 * (e.score || 1) : 0.04; color = '#7df9ff';
        } else if (rt && rt.parent === e.s) {
          const act = this.activation.get(e.t);
          on = act === undefined || this.waveT >= act;
          a = on ? (0.2 + rt.score * 0.5) * (e.type === 'owned_by' ? 0.35 : 1) : 0.04; color = this.colorMode === 'impact' ? `#${heat(rt.score).getHexString()}` : '#38e1ff';
          if (on && e.type !== 'owned_by') this.flowEdges.push([e.s, e.t, rt.score]);
        } else {
          a *= this.focusOnly ? 0 : 0.35;
        }
      } else if (this.focusOnly) a *= 0.6;
      c1.set(color).multiplyScalar(a); c2.copy(c1);
      const p1 = this.P(e.s), p2 = this.P(e.t);
      pos.set([p1.x, p1.y, p1.z, p2.x, p2.y, p2.z], k * 6);
      col.set([c1.r, c1.g, c1.b, c2.r, c2.g, c2.b], k * 6);
      k++;
      if (k * 6 >= pos.length) break;
    }
    this.edgeLines.geometry.setDrawRange(0, k * 2);
    this.edgeLines.geometry.attributes.position.needsUpdate = true;
    this.edgeLines.geometry.attributes.color.needsUpdate = true;
  }

  // ------------------------------------------------------------------ particles
  buildParticles() {
    const N = 2400;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const ctx = c.getContext('2d');
    const grd = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.3, 'rgba(160,240,255,0.8)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, 64, 64);
    this.particles = new THREE.Points(g, new THREE.PointsMaterial({ size: 2.2, map: new THREE.CanvasTexture(c), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.particles.frustumCulled = false;
    this.particleN = N;
    this.root.add(this.particles);
  }

  updateParticles(t) {
    const g = this.particles.geometry;
    const pos = g.attributes.position.array, col = g.attributes.color.array;
    const fe = this.flowEdges || [];
    let k = 0;
    const per = fe.length > 500 ? 1 : 2;
    const c = new THREE.Color();
    for (let i = 0; i < fe.length && k < this.particleN; i++) {
      const [s, e, score] = fe[i];
      const a = this.P(s), b = this.P(e);
      for (let j = 0; j < per && k < this.particleN; j++) {
        const f = (t * (0.35 + score * 0.4) + j / per + i * 0.137) % 1;
        pos[k * 3] = a.x + (b.x - a.x) * f; pos[k * 3 + 1] = a.y + (b.y - a.y) * f; pos[k * 3 + 2] = a.z + (b.z - a.z) * f;
        c.copy(heat(score)).multiplyScalar(0.7 + score * 0.6);
        col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
        k++;
      }
    }
    g.setDrawRange(0, k);
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
  }

  // ------------------------------------------------------------------ markers, path, labels
  buildMarkers() {
    this.ring = new THREE.Mesh(new THREE.RingGeometry(3.2, 3.6, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffffff').multiplyScalar(1.4), transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    this.ring.visible = false;
    this.scene.add(this.ring);
    const el = document.createElement('div'); el.className = 'hover-label'; el.style.display = 'none';
    this.hoverLabel = new CSS2DObject(el); this.scene.add(this.hoverLabel);
    this.topLabels = new THREE.Group(); this.scene.add(this.topLabels);
    this.pathGroup = new THREE.Group(); this.scene.add(this.pathGroup);
  }

  setPath(ids) {
    for (const c of [...this.pathGroup.children]) { c.geometry?.dispose(); c.material?.dispose(); this.pathGroup.remove(c); }
    if (!ids || ids.length < 2) return;
    const pts = ids.filter((id) => this.pos.has(id)).map((id) => this.P(id));
    if (pts.length < 2) return;
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.2);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, pts.length * 24, 0.38, 10, false), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe066').multiplyScalar(1.5), transparent: true, opacity: 0.95 }));
    this.pathGroup.add(tube);
    for (const p of pts) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff3bf').multiplyScalar(1.6) }));
      s.position.copy(p); this.pathGroup.add(s);
    }
  }

  setTopLabels() {
    for (const c of [...this.topLabels.children]) { c.element?.remove(); this.topLabels.remove(c); }
    if (!this.result || !this.showLabels) return;
    const items = [...this.result.impact.entries()].filter(([id]) => !['team', 'evidence', 'api'].includes(this.nodeType(id)))
      .sort((a, b) => b[1].score - a[1].score).slice(0, 9);
    const clauses = this.result.clauses.map((c) => [`cl_${c.n}`, `Clause ${c.n}`]);
    for (const [id, text] of [...items.map(([id]) => [id, this.bank.nodes.get(id).code || this.bank.nodes.get(id).name]), ...clauses]) {
      const el = document.createElement('div');
      el.className = 'node-label' + (id.startsWith('cl_') ? ' is-clause' : '');
      el.textContent = text;
      el.dataset.id = id;
      el.addEventListener('click', () => this.onSelect?.(id));
      const o = new CSS2DObject(el);
      o.position.copy(this.P(id)).add(new THREE.Vector3(0, 3.2, 0));
      o.userData.id = id;
      this.topLabels.add(o);
    }
  }

  // ------------------------------------------------------------------ public API
  setResult(result) {
    this.clearClauses();
    this.result = result;
    if (!result) { this.layerObjs[0].visible = false; this.layerObjs[0].userData.label.visible = false; this.activation.clear(); this.updateEdges(); this.updateNodes(); this.setTopLabels(); return; }
    // clause nodes on the "incoming circular" layer
    const ids = result.clauses.map((c) => `cl_${c.n}`);
    const sector = (2 * Math.PI) / TOPICS.length;
    const groups = {};
    result.clauses.forEach((c) => (groups[c.topics[0] || 'reporting'] = groups[c.topics[0] || 'reporting'] || []).push(c));
    for (const [topic, g] of Object.entries(groups)) {
      const k = Math.max(0, TOPICS.indexOf(topic));
      g.forEach((c, j) => {
        const a = (k + 0.5) * sector + (j - (g.length - 1) / 2) * 0.34;
        const rad = 24 + (j % 2) * 12;
        this.pos.set(`cl_${c.n}`, { x: Math.cos(a) * rad, z: Math.sin(a) * rad, type: 'clause' });
      });
    }
    this.makeMesh('clause', ids, 0);
    this.layerObjs[0].visible = true;
    this.layerObjs[0].userData.label.visible = true;
    // wave timing
    this.activation.clear();
    for (const [id, r] of result.impact) this.activation.set(id, 0.35 + r.hop * 0.55 + (r.clause || 0) * 0.04);
    this.waveT = 0;
    this.waving = true;
    this.updateEdges();
    this.updateNodes();
    this.setTopLabels();
  }

  clearClauses() {
    const m = this.meshes.get('clause');
    if (m) { this.root.remove(m); m.geometry.dispose(); m.material.dispose(); this.meshes.delete('clause'); }
    for (const id of [...this.pos.keys()]) if (id.startsWith('cl_')) { this.pos.delete(id); this.idx.delete(id); }
  }

  replay() { if (this.result) { this.waveT = 0; this.waving = true; } }

  setOption(k, v) {
    if (k === 'spacing') { this.spacing = v; this.placeLayers(); this.setTopLabels(); }
    if (k === 'colorMode') this.colorMode = v;
    if (k === 'focusOnly') this.focusOnly = v;
    if (k === 'autoRotate') this.controls.autoRotate = v;
    if (k === 'labels') { this.showLabels = v; this.setTopLabels(); }
    if (k === 'bloom') this.bloom.strength = v;
    if (k === 'hideType') { v[1] ? this.hiddenTypes.add(v[0]) : this.hiddenTypes.delete(v[0]); }
    this.updateEdges(); this.updateNodes();
    if (this.selected) this.placeRing(this.selected);
  }

  select(id, fly = true) {
    this.selected = id;
    this.updateNodes();
    if (!id || !this.pos.has(id)) { this.ring.visible = false; return; }
    this.placeRing(id);
    if (fly) this.flyTo(this.P(id));
  }

  placeRing(id) {
    if (!this.pos.has(id)) return;
    this.ring.position.copy(this.P(id));
    this.ring.visible = true;
  }

  flyTo(target, dist = 55) {
    const from = this.camera.position.clone(), fromT = this.controls.target.clone();
    const dir = from.clone().sub(fromT).normalize();
    const to = target.clone().add(dir.multiplyScalar(dist)).add(new THREE.Vector3(0, 12, 0));
    this.tween = { t: 0, from, to, fromT, toT: target.clone() };
    this.controls.autoRotate = false;
  }

  resetView() {
    this.tween = { t: 0, from: this.camera.position.clone(), to: this.home.clone(), fromT: this.controls.target.clone(), toT: new THREE.Vector3(0, 0, 0) };
  }

  pointer(e, click) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const hits = this.raycaster.intersectObjects([...this.meshes.values()], false);
    let id = null;
    for (const h of hits) {
      const ids = h.object.userData.ids;
      if (h.instanceId !== undefined && ids[h.instanceId]) {
        const cand = ids[h.instanceId];
        if (this.targetLook(cand).scale > 0) { id = cand; break; }
      }
    }
    if (click) { this.onSelect?.(id); return; }
    if (id !== this.hovered) {
      this.hovered = id;
      this.renderer.domElement.style.cursor = id ? 'pointer' : 'grab';
      const el = this.hoverLabel.element;
      if (id) {
        const n = this.bank.nodes.get(id);
        const r = this.result?.impact.get(id);
        const name = n ? (n.code ? `${n.code} · ${n.name}` : n.name) : `Clause ${id.slice(3)}`;
        el.innerHTML = `<b>${name}</b><span>${n ? n.type : 'clause'}${r ? ` · impact ${(r.score * 100).toFixed(0)}%` : ''}</span>`;
        el.style.display = '';
        this.hoverLabel.position.copy(this.P(id)).add(new THREE.Vector3(0, 3.5, 0));
      } else el.style.display = 'none';
      this.updateNodes();
      this.onHover?.(id);
    }
  }

  loop() {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    if (this.tween) {
      const tw = this.tween;
      tw.t = Math.min(1, tw.t + dt / 1.1);
      const k = tw.t < 0.5 ? 4 * tw.t ** 3 : 1 - (-2 * tw.t + 2) ** 3 / 2;
      this.camera.position.lerpVectors(tw.from, tw.to, k);
      this.controls.target.lerpVectors(tw.fromT, tw.toT, k);
      if (tw.t >= 1) this.tween = null;
    }
    if (this.waving) {
      this.waveT += dt;
      this.updateNodes();
      if (Math.floor(this.waveT * 12) !== this._lastEdgeTick) { this._lastEdgeTick = Math.floor(this.waveT * 12); this.updateEdges(); }
      if (this.waveT > 6.5) { this.waving = false; this.updateNodes(); this.updateEdges(); }
    }
    if (this.result) this.updateParticles(t);
    else this.particles.geometry.setDrawRange(0, 0);
    if (this.ring.visible) { this.ring.lookAt(this.camera.position); this.ring.scale.setScalar(1 + Math.sin(t * 4) * 0.12); }
    const cm = this.meshes.get('clause');
    if (cm) cm.rotation.y = 0;
    this.controls.update();
    this.composer.render();
    this.css.render(this.scene, this.camera);
  }
}
