/* Small, dependency-free SVG chart helpers. No chart library is used on
   purpose — PMMS stays a single static bundle with no CDN dependency
   (Blueprint's offline-first principle applies to tooling too). */

const CHART_COLORS = ["#f2c300", "#1d4fa0", "#2e9e5b", "#b33a35", "#8b96a1"];

function svgWrap(width, height, inner) {
  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" xmlns="http://www.w3.org/2000/svg" font-family="inherit">${inner}</svg>`;
}

/* Simple vertical bar chart. data: [{label, value}] */
function barChartSVG(data, { height = 220, color = "#f2c300", valueFmt = v => v } = {}) {
  const width = Math.max(360, data.length * 70);
  const padL = 40, padB = 34, padT = 16;
  const max = Math.max(1, ...data.map(d => d.value));
  const chartH = height - padB - padT;
  const barW = (width - padL - 10) / data.length * 0.6;
  const step = (width - padL - 10) / data.length;

  const bars = data.map((d, i) => {
    const h = (d.value / max) * chartH;
    const x = padL + i * step + (step - barW) / 2;
    const y = padT + (chartH - h);
    return `
      <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${color}"/>
      <text x="${(x + barW / 2).toFixed(1)}" y="${(y - 6).toFixed(1)}" font-size="11" fill="#3a4650" text-anchor="middle">${valueFmt(d.value)}</text>
      <text x="${(x + barW / 2).toFixed(1)}" y="${height - padB + 16}" font-size="10" fill="#8b96a1" text-anchor="middle">${escapeLabel(d.label)}</text>
    `;
  }).join("");

  const gridline = `<line x1="${padL}" y1="${padT + chartH}" x2="${width - 10}" y2="${padT + chartH}" stroke="#e3e7eb"/>`;
  return svgWrap(width, height, gridline + bars);
}

/* Multi-series line chart. labels: [str], series: [{name,color,values:[num|null]}] */
function lineChartSVG(labels, series, { height = 220, valueFmt = v => v } = {}) {
  const width = Math.max(420, labels.length * 90);
  const padL = 44, padB = 30, padT = 16, padR = 16;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;
  const allVals = series.flatMap(s => s.values).filter(v => v !== null && v !== undefined);
  const max = Math.max(1, ...allVals);
  const min = Math.min(0, ...allVals);
  const range = max - min || 1;
  const stepX = labels.length > 1 ? chartW / (labels.length - 1) : 0;

  const yOf = v => padT + chartH - ((v - min) / range) * chartH;
  const xOf = i => padL + i * stepX;

  const gridlines = [0, 0.5, 1].map(f => {
    const y = padT + chartH * f;
    const val = max - range * f;
    return `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${width - padR}" y2="${y.toFixed(1)}" stroke="#eef1f3"/>
            <text x="4" y="${(y + 4).toFixed(1)}" font-size="10" fill="#8b96a1">${valueFmt(Math.round(val))}</text>`;
  }).join("");

  const xLabels = labels.map((l, i) => `<text x="${xOf(i).toFixed(1)}" y="${height - 8}" font-size="10" fill="#8b96a1" text-anchor="middle">${escapeLabel(l)}</text>`).join("");

  const lines = series.map(s => {
    let path = "";
    let started = false;
    s.values.forEach((v, i) => {
      if (v === null || v === undefined) { started = false; return; }
      const x = xOf(i), y = yOf(v);
      path += (started ? " L " : " M ") + x.toFixed(1) + " " + y.toFixed(1);
      started = true;
    });
    const dots = s.values.map((v, i) => (v === null || v === undefined) ? "" :
      `<circle cx="${xOf(i).toFixed(1)}" cy="${yOf(v).toFixed(1)}" r="3" fill="${s.color}"/>`).join("");
    return `<path d="${path}" fill="none" stroke="${s.color}" stroke-width="2"/>${dots}`;
  }).join("");

  const legend = series.map((s, i) => `
    <span style="display:inline-flex;align-items:center;gap:6px;margin-right:16px;font-size:11px;color:#3a4650">
      <span style="width:10px;height:10px;border-radius:50%;background:${s.color};display:inline-block"></span>${s.name}
    </span>`).join("");

  return `<div style="margin-bottom:6px">${legend}</div>` + svgWrap(width, height, gridlines + lines + xLabels);
}

/* Pareto combo: bars (count/value, left axis) + cumulative % line (right axis, 0-100) */
function paretoChartSVG(data, { height = 240, valueFmt = v => v } = {}) {
  if (!data.length) return `<div class="empty">No data available.</div>`;
  const width = Math.max(420, data.length * 80);
  const padL = 44, padR = 40, padB = 60, padT = 16;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;
  const max = Math.max(1, ...data.map(d => d.value));
  const barW = chartW / data.length * 0.55;
  const step = chartW / data.length;

  const yOfVal = v => padT + chartH - (v / max) * chartH;
  const yOfPct = p => padT + chartH - (p / 100) * chartH;
  const xOf = i => padL + i * step + (step - barW) / 2;
  const xCenter = i => padL + i * step + step / 2;

  const bars = data.map((d, i) => {
    const h = (d.value / max) * chartH;
    const x = xOf(i), y = padT + (chartH - h);
    return `
      <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="#1d4fa0"/>
      <text x="${(x + barW / 2).toFixed(1)}" y="${(y - 6).toFixed(1)}" font-size="10" fill="#3a4650" text-anchor="middle">${valueFmt(d.value)}</text>
      <text x="${xCenter(i).toFixed(1)}" y="${height - padB + 14}" font-size="10" fill="#8b96a1" text-anchor="middle" transform="rotate(20 ${xCenter(i).toFixed(1)} ${height - padB + 14})">${escapeLabel(d.label, 16)}</text>
    `;
  }).join("");

  let path = "";
  data.forEach((d, i) => {
    const x = xCenter(i), y = yOfPct(d.cumPct);
    path += (i === 0 ? "M " : "L ") + x.toFixed(1) + " " + y.toFixed(1);
  });
  const dots = data.map((d, i) => `<circle cx="${xCenter(i).toFixed(1)}" cy="${yOfPct(d.cumPct).toFixed(1)}" r="3" fill="#b33a35"/>`).join("");
  const eightyLine = `<line x1="${padL}" y1="${yOfPct(80).toFixed(1)}" x2="${width - padR}" y2="${yOfPct(80).toFixed(1)}" stroke="#b33a35" stroke-dasharray="4 3" opacity="0.5"/>
    <text x="${width - padR}" y="${(yOfPct(80) - 4).toFixed(1)}" font-size="9" fill="#b33a35" text-anchor="end">80%</text>`;

  const gridline = `<line x1="${padL}" y1="${padT + chartH}" x2="${width - padR}" y2="${padT + chartH}" stroke="#e3e7eb"/>`;

  return svgWrap(width, height, gridline + bars + eightyLine + `<path d="${path}" fill="none" stroke="#b33a35" stroke-width="2"/>` + dots);
}

function escapeLabel(s, max = 14) {
  const str = String(s);
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}
