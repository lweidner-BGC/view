// Builds and manages the sidebar DOM.
// All callbacks accept updated state and apply changes externally.

// Default known scalar fields. Anything discovered in loaded clouds is merged in.
// ── Edit this list to add common field names you expect in your data ──
const DEFAULT_FIELDS = [
  { value: 'rgba',           label: 'RGB Color' },
  { value: 'M3C2 distance',  label: 'M3C2 distance' },
  { value: 'elevation',      label: 'Elevation' },
  { value: 'intensity',      label: 'Intensity' },
];

const COLORMAPS = [
  { value: 'SPECTRAL',     label: 'Spectral' },
  { value: 'VIRIDIS',      label: 'Viridis' },
  { value: 'PLASMA',       label: 'Plasma' },
  { value: 'INFERNO',      label: 'Inferno' },
  { value: 'TURBO',        label: 'Turbo' },
  { value: 'RAINBOW',      label: 'Rainbow' },
  { value: 'GRAYSCALE',    label: 'Grayscale' },
  { value: 'YELLOW_GREEN', label: 'Yellow-Green' },
  { value: 'CONTOUR',      label: 'Contour' },
];

export function buildSidebar(state, callbacks) {
  const sidebar = document.getElementById('app-sidebar');
  sidebar.innerHTML = `
    <!-- CLOUDS -->
    <div class="sidebar-section">
      <div class="section-label">Clouds</div>
      <div class="cloud-toggle-row">
        <button class="cloud-toggle-btn active" id="btn-cloud-1" title="Show Cloud 1 only">Cloud 1</button>
        <button class="cloud-toggle-btn" id="btn-cloud-2" title="Show Cloud 2 only" disabled>Cloud 2</button>
        <button class="cloud-toggle-btn" id="btn-cloud-both" title="Show both clouds">Both</button>
      </div>
      <div class="cloud-url loading" id="cloud-url-1">No cloud loaded</div>
      <div class="cloud-url" id="cloud-url-2" style="margin-top:3px"></div>
    </div>

    <!-- SCALAR FIELD -->
    <div class="sidebar-section">
      <div class="section-label">Scalar Field</div>
      <select id="field-select"></select>
    </div>

    <!-- COLORMAP -->
    <div class="sidebar-section">
      <div class="section-label">Colormap</div>
      <select id="cmap-select"></select>
    </div>

    <!-- COLOR RANGE -->
    <div class="sidebar-section">
      <div class="section-label">Color Range</div>
      <div class="range-readout">
        <span id="vmin-label">${state.vmin}</span>
        <span id="vmax-label">${state.vmax}</span>
      </div>
      <div id="range-slider"></div>
      <button class="btn-small" id="btn-auto-range">Auto range from data</button>
    </div>

    <!-- POINT SIZE -->
    <div class="sidebar-section">
      <div class="section-label">Point Size</div>
      <div class="range-row">
        <input type="range" id="ptsize-slider" min="0.5" max="8" step="0.5" value="${state.ptsize}" style="flex:1">
        <span id="ptsize-label" style="width:28px;text-align:right;font-size:11px;color:#6a9a8a">${state.ptsize}</span>
      </div>
    </div>

    <!-- POINT BUDGET -->
    <div class="sidebar-section">
      <div class="section-label">Point Budget (LOD)</div>
      <input type="range" id="budget-slider" min="500000" max="15000000" step="500000" style="width:100%">
      <div class="budget-display" id="budget-display">5.0M points</div>
    </div>
  `;

  // Populate dropdowns
  populateSelect('field-select', DEFAULT_FIELDS, state.field);
  populateSelect('cmap-select', COLORMAPS, state.cmap);

  // Dual-handle range slider via jQuery UI (already loaded by Potree)
  initRangeSlider(state, callbacks);

  // Budget slider
  document.getElementById('budget-slider').value = 5000000;

  // ── Event handlers ──

  // Cloud toggles
  for (const [id, active] of [['btn-cloud-1','1'], ['btn-cloud-2','2'], ['btn-cloud-both','both']]) {
    document.getElementById(id).addEventListener('click', () => {
      state.active = active;
      updateToggleButtons(state.active);
      callbacks.onVisibilityChange();
    });
  }

  // Field select
  document.getElementById('field-select').addEventListener('change', (e) => {
    state.field = e.target.value;
    callbacks.onFieldChange();
  });

  // Colormap select
  document.getElementById('cmap-select').addEventListener('change', (e) => {
    state.cmap = e.target.value;
    callbacks.onCmapChange();
  });

  // Auto range
  document.getElementById('btn-auto-range').addEventListener('click', () => {
    callbacks.onAutoRange();
  });

  // Point size
  document.getElementById('ptsize-slider').addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    state.ptsize = v;
    document.getElementById('ptsize-label').textContent = v;
    callbacks.onPointSize();
  });

  // Point budget
  document.getElementById('budget-slider').addEventListener('input', (e) => {
    const n = parseInt(e.target.value);
    document.getElementById('budget-display').textContent = `${(n / 1e6).toFixed(1)}M points`;
    if (state.viewer) state.viewer.setPointBudget(n);
  });
}

export function updateAttributeList(attributes) {
  const sel = document.getElementById('field-select');
  if (!sel) return;

  // Merge discovered attributes into existing options
  const existing = new Set([...sel.options].map(o => o.value));
  for (const name of attributes) {
    if (!existing.has(name)) {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      sel.appendChild(opt);
    }
  }
}

export function setCloudStatus(slot, url, status) {
  const el = document.getElementById(`cloud-url-${slot}`);
  if (!el) return;
  el.className = `cloud-url ${status}`;
  if (url) {
    try {
      const u = new URL(url);
      el.textContent = `↑ ${u.hostname}${u.pathname.split('/').slice(-2).join('/')}`;
    } catch {
      el.textContent = url.slice(-40);
    }
  } else {
    el.textContent = 'No cloud loaded';
  }

  if (slot === 2 && status === 'loaded') {
    const btn2 = document.getElementById('btn-cloud-2');
    if (btn2) btn2.disabled = false;
  }
}

export function setRangeInputs(vmin, vmax) {
  // Reinitialise the dual-handle slider with new bounds and values.
  const sliderEl = document.getElementById('range-slider');
  if (!sliderEl || !window.$) return;
  const pad = Math.max(Math.abs(vmax - vmin) * 0.5, 0.5);
  const sliderMin = Math.floor((vmin - pad) * 100) / 100;
  const sliderMax = Math.ceil((vmax + pad) * 100) / 100;
  $(sliderEl).slider('option', 'min', sliderMin);
  $(sliderEl).slider('option', 'max', sliderMax);
  $(sliderEl).slider('values', [vmin, vmax]);
  document.getElementById('vmin-label').textContent = fmt(vmin);
  document.getElementById('vmax-label').textContent = fmt(vmax);
}

function initRangeSlider(state, callbacks) {
  const sliderEl = document.getElementById('range-slider');
  if (!sliderEl || !window.$) return;

  const { vmin, vmax } = state;
  const pad = Math.max(Math.abs(vmax - vmin) * 0.5, 0.5);
  const sliderMin = Math.floor((vmin - pad) * 100) / 100;
  const sliderMax = Math.ceil((vmax + pad) * 100) / 100;

  $(sliderEl).slider({
    range: true,
    min: sliderMin,
    max: sliderMax,
    step: 0.001,
    values: [vmin, vmax],
    slide: (event, ui) => {
      const [a, b] = ui.values;
      state.vmin = a;
      state.vmax = b;
      document.getElementById('vmin-label').textContent = fmt(a);
      document.getElementById('vmax-label').textContent = fmt(b);
      callbacks.onRangeChange();
    },
  });
}

export function updateToggleButtons(active) {
  document.getElementById('btn-cloud-1').classList.toggle('active', active === '1');
  document.getElementById('btn-cloud-2').classList.toggle('active', active === '2');
  document.getElementById('btn-cloud-both').classList.toggle('active', active === 'both');
}

// ── Helpers ──

function populateSelect(id, items, selectedValue) {
  const sel = document.getElementById(id);
  sel.innerHTML = '';
  for (const { value, label } of items) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    if (value === selectedValue) opt.selected = true;
    sel.appendChild(opt);
  }
}

function fmt(v) {
  if (Math.abs(v) >= 100) return v.toFixed(1);
  if (Math.abs(v) >= 10)  return v.toFixed(2);
  return v.toFixed(3);
}
