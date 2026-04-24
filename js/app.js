import * as Colorbar from './colorbar.js';
import * as UI       from './ui.js';

// ── App state ──────────────────────────────────────────────────────────────
const state = {
  src:    null,  // primary cloud metadata.json URL
  src2:   null,  // secondary cloud metadata.json URL (optional)
  field:  'M3C2 distance',  // active scalar attribute — edit default here
  cmap:   'SPECTRAL',
  vmin:   -0.5,
  vmax:   0.5,
  active: '1',   // '1', '2', or 'both'
  ptsize: 1.5,   // point size (material.size)
  cam:    null,  // base64-encoded {pos:[x,y,z], yaw, pitch, radius}

  // Runtime refs (not serialized to URL)
  clouds: { 1: null, 2: null },
  viewer: null,
  attributes: [],
};

// ── Entry point ────────────────────────────────────────────────────────────
export async function initApp() {
  parseURL(state);
  await initViewer();

  UI.buildSidebar(state, {
    onFieldChange:      applyVisualState,
    onCmapChange:       applyVisualState,
    onRangeChange:      applyVisualState,
    onVisibilityChange: applyVisibility,
    onAutoRange:        autoRange,
    onPointSize:        applyPointSize,
  });
  UI.updateToggleButtons(state.active);

  if (state.src)  await loadCloud(1, state.src);
  if (state.src2) await loadCloud(2, state.src2);

  restoreCamera();
  applyVisualState();
  applyVisibility();

  document.getElementById('btn-share').addEventListener('click', shareURL);
  startStatusLoop();

  // Resize colorbar when window resizes
  window.addEventListener('resize', () => Colorbar.update(state));
}

// ── Viewer init ────────────────────────────────────────────────────────────
async function initViewer() {
  const viewer = new Potree.Viewer(document.getElementById('potree_render_area'));
  viewer.setEDLEnabled(true);
  viewer.setEDLRadius(1.4);
  viewer.setEDLStrength(0.4);
  viewer.setFOV(60);
  viewer.setPointBudget(5_000_000);
  viewer.setBackground('black');
  viewer.loadSettingsFromURL = () => {}; // prevent Potree from hijacking URL params
  state.viewer = viewer;
}

// ── Cloud loading ──────────────────────────────────────────────────────────
async function loadCloud(slot, url) {
  UI.setCloudStatus(slot, url, 'loading');

  let result;
  try {
    result = await Potree.loadPointCloud(url, `Cloud ${slot}`);
  } catch (err) {
    console.error(`Failed to load cloud ${slot}:`, err);
    UI.setCloudStatus(slot, url, 'error');
    return;
  }

  const pc = result.pointcloud;
  state.clouds[slot] = pc;

  pc.material.pointSizeType = Potree.PointSizeType.ADAPTIVE;
  pc.material.size = 1.5;

  state.viewer.scene.addPointCloud(pc);

  // Discover custom attributes
  const attrs = (pc.pcoGeometry?.pointAttributes?.attributes || [])
    .map(a => a.name)
    .filter(n => n && !['position','rgb','rgba','intensity','classification'].includes(n.toLowerCase()));
  for (const a of attrs) {
    if (!state.attributes.includes(a)) state.attributes.push(a);
  }
  UI.updateAttributeList(state.attributes);
  UI.setCloudStatus(slot, url, 'loaded');

  // Fit to screen only on first cloud load, if no camera was in URL
  if (slot === 1 && !state.cam) {
    state.viewer.fitToScreen(0.6);
  }

  applyField(pc);
}

// ── Visual state ───────────────────────────────────────────────────────────
function applyVisualState() {
  for (const slot of [1, 2]) {
    const pc = state.clouds[slot];
    if (pc) applyField(pc);
  }
  Colorbar.update(state);
}

function applyField(pc) {
  const mat = pc.material;
  mat.activeAttributeName = state.field;

  const gradient = (Potree.Gradients && Potree.Gradients[state.cmap])
    ? Potree.Gradients[state.cmap]
    : Potree.Gradients.SPECTRAL;
  mat.gradient = gradient;

  // Potree's renderer reads material.getRange(name) each frame and computes
  // uExtraOffset/uExtraScale from it — setting those uniforms directly has no
  // effect because the renderer overwrites them. Use setRange() instead.
  if (state.field === 'intensity') {
    mat.intensityRange = [state.vmin, state.vmax];
  } else if (state.field === 'elevation' || state.field === 'height') {
    mat.elevationRange = [state.vmin, state.vmax];
  } else {
    mat.setRange(state.field, [state.vmin, state.vmax]);
  }
}

function applyPointSize() {
  for (const slot of [1, 2]) {
    const pc = state.clouds[slot];
    if (pc) pc.material.size = state.ptsize;
  }
}

function applyVisibility() {
  const c1 = state.clouds[1];
  const c2 = state.clouds[2];
  if (c1) c1.visible = state.active === '1' || state.active === 'both';
  if (c2) c2.visible = state.active === '2' || state.active === 'both';
}

// Auto-detect range from data attribute metadata
function autoRange() {
  const pc = state.clouds[1] || state.clouds[2];
  if (!pc) return;

  const attrs = pc.pcoGeometry?.pointAttributes?.attributes || [];
  const attr = attrs.find(a => a.name === state.field);
  if (attr?.range) {
    state.vmin = attr.range[0];
    state.vmax = attr.range[1];
  } else if (attr?.initialRange) {
    state.vmin = attr.initialRange[0];
    state.vmax = attr.initialRange[1];
  } else {
    console.warn('No range metadata found for field:', state.field);
    return;
  }
  UI.setRangeInputs(state.vmin, state.vmax);
  applyVisualState();
}

// ── Camera ─────────────────────────────────────────────────────────────────
// Serialize using Potree's own view properties (position + yaw/pitch/radius)
// so we don't need THREE.Vector3 in app code.
function buildCamParam() {
  const v = state.viewer.scene.view;
  return btoa(JSON.stringify({
    pos:    [+v.position.x.toFixed(3), +v.position.y.toFixed(3), +v.position.z.toFixed(3)],
    yaw:    +v.yaw.toFixed(6),
    pitch:  +v.pitch.toFixed(6),
    radius: +v.radius.toFixed(3),
  }));
}

function restoreCamera() {
  if (!state.cam) return;
  try {
    const { pos, yaw, pitch, radius } = JSON.parse(atob(state.cam));
    const v = state.viewer.scene.view;
    v.position.set(pos[0], pos[1], pos[2]);
    if (yaw    !== undefined) v.yaw    = yaw;
    if (pitch  !== undefined) v.pitch  = pitch;
    if (radius !== undefined) v.radius = radius;
  } catch (e) {
    console.warn('Could not restore camera:', e);
  }
}

// ── URL serialization ──────────────────────────────────────────────────────
function parseURL(s) {
  const p = new URLSearchParams(location.search);
  s.src    = p.get('src')    || null;
  s.src2   = p.get('src2')   || null;
  s.field  = p.get('field')  || s.field;
  s.cmap   = p.get('cmap')   || s.cmap;
  s.vmin   = parseFloat(p.get('vmin') ?? s.vmin);
  s.vmax   = parseFloat(p.get('vmax') ?? s.vmax);
  s.active  = p.get('active')  || s.active;
  s.ptsize  = parseFloat(p.get('ptsize') ?? s.ptsize);
  s.cam     = p.get('cam')     || null;
}

function buildURL() {
  const p = new URLSearchParams();
  if (state.src)   p.set('src',    state.src);
  if (state.src2)  p.set('src2',   state.src2);
  p.set('field',  state.field);
  p.set('cmap',   state.cmap);
  p.set('vmin',   state.vmin.toString());
  p.set('vmax',   state.vmax.toString());
  p.set('active',  state.active);
  p.set('ptsize',  state.ptsize.toString());
  p.set('cam',     buildCamParam());
  return `${location.origin}${location.pathname}?${p.toString()}`;
}

function shareURL() {
  const url = buildURL();
  navigator.clipboard.writeText(url).then(() => {
    const toast = document.getElementById('share-toast');
    toast.classList.add('visible');
    setTimeout(() => toast.classList.remove('visible'), 2000);
  }).catch(() => {
    prompt('Copy this URL:', url);
  });
}

// ── Status bar ─────────────────────────────────────────────────────────────
function startStatusLoop() {
  const elPoints = document.getElementById('status-points');
  const elFPS    = document.getElementById('status-fps');
  let lastTime = performance.now(), frames = 0;

  function tick(now) {
    frames++;
    const elapsed = now - lastTime;
    if (elapsed >= 1000) {
      const fps = Math.round(frames * 1000 / elapsed);
      const pts = (state.viewer.scene.pointclouds || [])
        .reduce((acc, pc) => acc + (pc.numVisiblePoints || 0), 0);
      elPoints.innerHTML = `Points: <span class="val">${(pts / 1e6).toFixed(2)}M</span>`;
      elFPS.innerHTML    = `FPS: <span class="val">${fps}</span>`;
      frames = 0;
      lastTime = now;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
