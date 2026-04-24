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
        <input type="number" id="vmin-input" class="range-num-input" value="${fmt(state.vmin)}" step="any">
        <input type="number" id="vmax-input" class="range-num-input" value="${fmt(state.vmax)}" step="any">
      </div>
      <div id="range-slider"></div>
      <button class="btn-small" id="btn-auto-range">Auto range from data</button>
    </div>

    <!-- VALUE FILTER -->
    <div class="sidebar-section">
      <div class="section-label">Value Filter</div>
      <div class="filter-checks">
        <label class="check-label">
          <input type="checkbox" id="filter-enabled" ${state.filterEnabled ? 'checked' : ''}>
          Clip range
        </label>
        <label class="check-label">
          <input type="checkbox" id="filter-nan" ${state.hideNaN ? 'checked' : ''}>
          Hide NaN
        </label>
      </div>
      <div id="filter-slider-wrap" class="${state.filterEnabled ? '' : 'filter-disabled'}">
        <div class="range-readout" style="margin-top:6px">
          <input type="number" id="fmin-input" class="range-num-input" value="${fmt(state.fmin)}" step="any">
          <input type="number" id="fmax-input" class="range-num-input" value="${fmt(state.fmax)}" step="any">
        </div>
        <div id="filter-slider"></div>
      </div>
    </div>

    <!-- LIMIT OF DETECTION -->
    <div class="sidebar-section">
      <div class="section-label">Limit of Detection</div>
      <label class="check-label" style="margin-bottom:6px">
        <input type="checkbox" id="lod-enabled" ${state.lodEnabled ? 'checked' : ''}>
        Color ±LOD points white
      </label>
      <div class="range-row">
        <span style="font-size:10px;color:#5a6a7a;white-space:nowrap">± </span>
        <input type="range" id="lod-slider" min="0" max="1" step="0.001" value="${state.lod}" style="flex:1">
        <input type="number" id="lod-input" class="range-num-input" value="${fmt(state.lod)}" step="any" style="width:60px">
      </div>
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

  // Dual-handle range sliders via jQuery UI (already loaded by Potree)
  initRangeSlider(state, callbacks);
  initFilterSlider(state, callbacks);

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

  // Color range number inputs
  document.getElementById('vmin-input').addEventListener('change', (e) => {
    const v = parseFloat(e.target.value);
    if (isNaN(v)) return;
    state.vmin = v;
    syncRangeSliderValues(state.vmin, state.vmax);
    callbacks.onRangeChange();
  });
  document.getElementById('vmax-input').addEventListener('change', (e) => {
    const v = parseFloat(e.target.value);
    if (isNaN(v)) return;
    state.vmax = v;
    syncRangeSliderValues(state.vmin, state.vmax);
    callbacks.onRangeChange();
  });

  // Filter enable checkbox
  document.getElementById('filter-enabled').addEventListener('change', (e) => {
    state.filterEnabled = e.target.checked;
    document.getElementById('filter-slider-wrap').classList.toggle('filter-disabled', !state.filterEnabled);
    callbacks.onFilterChange();
  });

  // NaN checkbox
  document.getElementById('filter-nan').addEventListener('change', (e) => {
    state.hideNaN = e.target.checked;
    callbacks.onNaNChange();
  });

  // LOD enable checkbox
  document.getElementById('lod-enabled').addEventListener('change', (e) => {
    state.lodEnabled = e.target.checked;
    callbacks.onLODChange();
  });

  // LOD slider
  document.getElementById('lod-slider').addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    state.lod = v;
    document.getElementById('lod-input').value = fmt(v);
    callbacks.onLODChange();
  });

  // LOD number input
  document.getElementById('lod-input').addEventListener('change', (e) => {
    const v = parseFloat(e.target.value);
    if (isNaN(v) || v < 0) return;
    state.lod = v;
    document.getElementById('lod-slider').value = Math.min(v, parseFloat(document.getElementById('lod-slider').max));
    callbacks.onLODChange();
  });

  // Filter range number inputs
  document.getElementById('fmin-input').addEventListener('change', (e) => {
    const v = parseFloat(e.target.value);
    if (isNaN(v)) return;
    state.fmin = v;
    syncFilterSliderValues(state.fmin, state.fmax);
    callbacks.onFilterChange();
  });
  document.getElementById('fmax-input').addEventListener('change', (e) => {
    const v = parseFloat(e.target.value);
    if (isNaN(v)) return;
    state.fmax = v;
    syncFilterSliderValues(state.fmin, state.fmax);
    callbacks.onFilterChange();
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

export function setFilterSlider(fmin, fmax) {
  const sliderEl = document.getElementById('filter-slider');
  if (!sliderEl || !window.$) return;
  const pad = Math.max(Math.abs(fmax - fmin) * 0.5, 0.5);
  const sliderMin = Math.floor((fmin - pad) * 1000) / 1000;
  const sliderMax = Math.ceil((fmax + pad) * 1000) / 1000;
  $(sliderEl).slider('option', 'min', sliderMin);
  $(sliderEl).slider('option', 'max', sliderMax);
  $(sliderEl).slider('values', [fmin, fmax]);
  document.getElementById('fmin-input').value = fmt(fmin);
  document.getElementById('fmax-input').value = fmt(fmax);
}

export function setLODSliderMax(vmin, vmax) {
  const sliderEl = document.getElementById('lod-slider');
  if (!sliderEl) return;
  // Max = largest distance from zero that the color range covers
  const maxAbs = Math.max(Math.abs(vmin), Math.abs(vmax));
  sliderEl.max = maxAbs.toFixed(4);
  sliderEl.step = (maxAbs / 500).toFixed(5);
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
  document.getElementById('vmin-input').value = fmt(vmin);
  document.getElementById('vmax-input').value = fmt(vmax);
}

function syncRangeSliderValues(vmin, vmax) {
  const sliderEl = document.getElementById('range-slider');
  if (!sliderEl || !window.$) return;
  $(sliderEl).slider('values', [vmin, vmax]);
}

function syncFilterSliderValues(fmin, fmax) {
  const sliderEl = document.getElementById('filter-slider');
  if (!sliderEl || !window.$) return;
  $(sliderEl).slider('values', [fmin, fmax]);
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
      document.getElementById('vmin-input').value = fmt(a);
      document.getElementById('vmax-input').value = fmt(b);
      callbacks.onRangeChange();
    },
  });
}

function initFilterSlider(state, callbacks) {
  const sliderEl = document.getElementById('filter-slider');
  if (!sliderEl || !window.$) return;

  const { fmin, fmax } = state;
  const pad = Math.max(Math.abs(fmax - fmin) * 0.5, 0.5);
  const sliderMin = Math.floor((fmin - pad) * 100) / 100;
  const sliderMax = Math.ceil((fmax + pad) * 100) / 100;

  $(sliderEl).slider({
    range: true,
    min: sliderMin,
    max: sliderMax,
    step: 0.001,
    values: [fmin, fmax],
    slide: (event, ui) => {
      const [a, b] = ui.values;
      state.fmin = a;
      state.fmax = b;
      document.getElementById('fmin-input').value = fmt(a);
      document.getElementById('fmax-input').value = fmt(b);
      callbacks.onFilterChange();
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
