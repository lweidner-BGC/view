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
      <div class="range-row">
        <label>Max</label>
        <input type="range" id="vmax-slider" min="-100" max="100" step="0.01">
        <input type="number" id="vmax-num" step="0.1">
      </div>
      <div class="range-row">
        <label>Min</label>
        <input type="range" id="vmin-slider" min="-100" max="100" step="0.01">
        <input type="number" id="vmin-num" step="0.1">
      </div>
      <button class="btn-small" id="btn-auto-range">Auto range from data</button>
    </div>

    <!-- POINT BUDGET -->
    <div class="sidebar-section">
      <div class="section-label">Point Budget</div>
      <input type="range" id="budget-slider" min="500000" max="15000000" step="500000" style="width:100%">
      <div class="budget-display" id="budget-display">5.0M points</div>
    </div>
  `;

  // Populate dropdowns
  populateSelect('field-select', DEFAULT_FIELDS, state.field);
  populateSelect('cmap-select', COLORMAPS, state.cmap);

  // Set initial range values
  setRangeInputs(state.vmin, state.vmax);

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

  // vmin/vmax sliders and number inputs (sync both directions)
  wireRangeControl('vmin', (v) => { state.vmin = v; callbacks.onRangeChange(); });
  wireRangeControl('vmax', (v) => { state.vmax = v; callbacks.onRangeChange(); });

  // Auto range
  document.getElementById('btn-auto-range').addEventListener('click', () => {
    callbacks.onAutoRange();
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
  const range = Math.max(Math.abs(vmin), Math.abs(vmax), 1) * 1.5;

  for (const id of ['vmin-slider','vmax-slider']) {
    const el = document.getElementById(id);
    if (el) { el.min = -range; el.max = range; }
  }

  const vminSlider = document.getElementById('vmin-slider');
  const vmaxSlider = document.getElementById('vmax-slider');
  const vminNum    = document.getElementById('vmin-num');
  const vmaxNum    = document.getElementById('vmax-num');

  if (vminSlider) vminSlider.value = vmin;
  if (vmaxSlider) vmaxSlider.value = vmax;
  if (vminNum)    vminNum.value    = vmin;
  if (vmaxNum)    vmaxNum.value    = vmax;
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

function wireRangeControl(key, onChange) {
  const slider = document.getElementById(`${key}-slider`);
  const num    = document.getElementById(`${key}-num`);
  if (!slider || !num) return;

  slider.addEventListener('input', () => {
    const v = parseFloat(slider.value);
    num.value = v;
    onChange(v);
  });
  num.addEventListener('change', () => {
    const v = parseFloat(num.value);
    slider.value = v;
    onChange(v);
  });
}
