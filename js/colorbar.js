// Vertical SVG color bar with gradient and labeled tick marks.
// Reads gradient stops from Potree.Gradients[cmap] (array of [position, THREE.Color]).

export function update(state) {
  const container = document.getElementById('colorbar-container');
  if (!container) return;

  const { cmap, vmin, vmax, field } = state;
  const gradientDef = (window.Potree && Potree.Gradients && Potree.Gradients[cmap])
    ? Potree.Gradients[cmap]
    : null;

  const W = 70, H = container.clientHeight || 400;
  const barX = 22, barW = 18;
  const barTop = 30, barBot = H - 30;
  const barH = barBot - barTop;

  // Build gradient stops from Potree gradient array.
  // Potree stores gradients as arrays of [t, THREE.Color] where t ∈ [0,1].
  // We reverse (t → 1-t) so that vmax is at the top of the SVG.
  let stopsSVG = '';
  if (gradientDef && gradientDef.length) {
    // Process in reverse so offsets are ascending (SVG spec requires it).
    // (1-t) maps t=1→0% (top/vmax) and t=0→100% (bottom/vmin).
    for (const [t, color] of [...gradientDef].reverse()) {
      const pct = Math.round((1 - t) * 100);
      const hex = '#' + color.getHexString();
      stopsSVG += `<stop offset="${pct}%" stop-color="${hex}"/>`;
    }
  } else {
    // Fallback: grey gradient
    stopsSVG = '<stop offset="0%" stop-color="#fff"/><stop offset="100%" stop-color="#333"/>';
  }

  // 5 evenly spaced tick labels
  const ticks = [0, 0.25, 0.5, 0.75, 1.0];
  let ticksSVG = '';
  for (const frac of ticks) {
    const y = barTop + (1 - frac) * barH;
    const val = vmin + frac * (vmax - vmin);
    const label = formatLabel(val);
    ticksSVG += `
      <line x1="${barX + barW}" y1="${y}" x2="${barX + barW + 4}" y2="${y}" stroke="#4a5a6a" stroke-width="1"/>
      <text x="${barX + barW + 6}" y="${y + 3.5}" font-size="9" fill="#8a9aaa" font-family="Arial,sans-serif">${label}</text>`;
  }

  // Field name label, rotated along left edge
  const fieldLabel = field || '';
  const fieldLabelSVG = fieldLabel
    ? `<text transform="rotate(-90, 10, ${H / 2})" x="${-(H / 2 - 10)}" y="16"
         font-size="9" fill="#5a6a7a" font-family="Arial,sans-serif"
         text-anchor="middle">${escapeXml(fieldLabel)}</text>`
    : '';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>
      <linearGradient id="cb-grad" x1="0" y1="0" x2="0" y2="1">
        ${stopsSVG}
      </linearGradient>
    </defs>
    <rect x="${barX}" y="${barTop}" width="${barW}" height="${barH}"
          fill="url(#cb-grad)" rx="2"/>
    <rect x="${barX}" y="${barTop}" width="${barW}" height="${barH}"
          fill="none" stroke="#2a3a4a" stroke-width="1" rx="2"/>
    ${ticksSVG}
    ${fieldLabelSVG}
  </svg>`;

  container.innerHTML = svg;
}

function formatLabel(v) {
  if (Math.abs(v) >= 1000) return v.toFixed(0);
  if (Math.abs(v) >= 10)   return v.toFixed(1);
  if (Math.abs(v) >= 1)    return v.toFixed(2);
  return v.toFixed(3);
}

function escapeXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
