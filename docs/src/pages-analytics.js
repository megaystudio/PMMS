/* ===================== ANALYTICS — Blueprint section 20 ===================== */

const ANALYTICS_TABS = {
  pm: "PM Analysis",
  breakdown: "Breakdown Analysis",
  reliability: "Reliability",
  cost: "Cost"
};

function analyticsHtml() {
  return `
  <div class="tabs" id="analytics-tabs">
    ${Object.entries(ANALYTICS_TABS).map(([k, v], i) => `<button class="tab ${i === 0 ? "active" : ""}" data-atab="${k}">${v}</button>`).join("")}
  </div>
  <div id="analytics-body"></div>`;
}

function analyticsAfter() {
  const body = document.getElementById("analytics-body");
  function show(tab) {
    document.querySelectorAll("#analytics-tabs .tab").forEach(b => b.classList.toggle("active", b.dataset.atab === tab));
    if (tab === "pm") renderPmAnalysis(body);
    else if (tab === "breakdown") renderBreakdownAnalysis(body);
    else if (tab === "reliability") renderReliabilityAnalysis(body);
    else renderCostAnalysis(body);
  }
  document.querySelectorAll("#analytics-tabs .tab").forEach(b => b.addEventListener("click", () => show(b.dataset.atab)));
  show("pm");
}

/* ---------- PM ANALYSIS ---------- */
function renderPmAnalysis(body) {
  body.innerHTML = `
  <div class="page-head"><strong>PM Analysis</strong>
    <select id="pm-months" class="inline-select">
      <option value="3">Last 3 months</option>
      <option value="6" selected>Last 6 months</option>
      <option value="12">Last 12 months</option>
    </select>
  </div>
  <div class="card" id="pm-chart-1"></div>
  <div class="grid two-col" style="margin-top:16px">
    <div class="card"><strong>Compliance Trend</strong><div id="pm-chart-2" style="margin-top:12px"></div></div>
    <div class="card">
      <strong>Overdue &amp; Reschedule (per month)</strong>
      <div id="pm-table" style="margin-top:12px"></div>
    </div>
  </div>`;

  function draw() {
    const months = Number(document.getElementById("pm-months").value);
    const trend = pmAnalysisTrend(months);
    const labels = trend.map(t => t.label);
    document.getElementById("pm-chart-1").innerHTML = `
      <strong style="font-size:13px;color:#3a4650">Planned vs Completed</strong>
      <div style="margin-top:10px">${lineChartSVG(labels, [
        { name: "Planned", color: "#8b96a1", values: trend.map(t => t.planned) },
        { name: "Completed", color: "#2e9e5b", values: trend.map(t => t.completed) }
      ])}</div>`;
    document.getElementById("pm-chart-2").innerHTML = lineChartSVG(labels, [
      { name: "Compliance %", color: "#1d4fa0", values: trend.map(t => t.compliance) }
    ], { valueFmt: v => v + "%" });
    document.getElementById("pm-table").innerHTML = table(
      ["Month", "Overdue", "Rescheduled"],
      trend.map(t => [t.label, t.overdue, t.rescheduled])
    );
  }
  document.getElementById("pm-months").addEventListener("change", draw);
  draw();
}

/* ---------- BREAKDOWN ANALYSIS (4 Pareto dimensions) ---------- */
function renderBreakdownAnalysis(body) {
  body.innerHTML = `
  <div class="page-head"><strong>Breakdown Analysis</strong>
    <select id="bd-period" class="inline-select">
      <option value="30">Last 30 days</option>
      <option value="90" selected>Last 90 days</option>
      <option value="180">Last 180 days</option>
    </select>
  </div>
  <div class="grid two-col">
    <div class="card"><strong>Breakdown Pareto</strong><span class="kpi-note"> — by failure description</span><div id="pareto-failure" style="margin-top:12px"></div></div>
    <div class="card"><strong>Failure Mode Pareto</strong><div id="pareto-mode" style="margin-top:12px"></div></div>
  </div>
  <div class="grid two-col" style="margin-top:16px">
    <div class="card"><strong>Equipment Pareto</strong><span class="kpi-note"> — by downtime hours</span><div id="pareto-equipment" style="margin-top:12px"></div></div>
    <div class="card"><strong>Area Pareto</strong><div id="pareto-area" style="margin-top:12px"></div></div>
  </div>
  <div class="card" style="margin-top:16px">
    <strong>Recurring Failures</strong><span class="kpi-note"> — same equipment + failure mode occurring 2+ times</span>
    <div id="recurring-failures" style="margin-top:12px"></div>
  </div>`;

  function draw() {
    const period = Number(document.getElementById("bd-period").value);
    const dims = [
      ["failure", "pareto-failure", v => v],
      ["mode", "pareto-mode", v => v],
      ["equipment", "pareto-equipment", v => v.toFixed(1) + "h"],
      ["area", "pareto-area", v => v]
    ];
    dims.forEach(([dim, elId, fmt]) => {
      const data = paretoBy(dim, period);
      document.getElementById(elId).innerHTML = data.length ? paretoChartSVG(data, { valueFmt: fmt }) : `<div class="empty">No breakdown recorded in this period.</div>`;
    });

    const recurring = recurringFailures(period, 2);
    document.getElementById("recurring-failures").innerHTML = recurring.length ? table(
      ["Equipment", "Failure Mode", "Occurrences", "Total Downtime", "Last Occurred", ""],
      recurring.map(r => [
        assetLabel(r.asset_id), r.failure_mode, r.count, r.totalDowntime + "h", fmtDate(r.lastDate),
        can("RCA", "Create") && canUseRca() ? `<button class="link-btn" data-start-rca-recurring='${JSON.stringify({ asset_id: r.asset_id, failure_mode: r.failure_mode })}'>Start RCA</button>` : "—"
      ])
    ) : `<div class="empty">No recurring failure pattern detected in this period.</div>`;
    document.querySelectorAll("[data-start-rca-recurring]").forEach(b => b.addEventListener("click", () => {
      const info = JSON.parse(b.dataset.startRcaRecurring);
      openRcaCreateModal({ source_type: "Recurring", asset_id: info.asset_id, title: `Recurring: ${info.failure_mode}` });
    }));
  }
  document.getElementById("bd-period").addEventListener("change", draw);
  draw();
}

/* ---------- RELIABILITY TREND ---------- */
function renderReliabilityAnalysis(body) {
  body.innerHTML = `
  <div class="page-head"><strong>Reliability Trend</strong>
    <select id="rel-months" class="inline-select">
      <option value="3">Last 3 months</option>
      <option value="6" selected>Last 6 months</option>
      <option value="12">Last 12 months</option>
    </select>
  </div>
  <div class="notice">MTBF and MTTR use each asset's configured Operating Hours/Day (set on the Asset record), weighted by its current status — Running counts in full, Standby at half, Down at zero — since V1 has no continuous run-hour sensor or asset status history. Consistent with the same calculation used on the Dashboard KPI.</div>
  <div class="card" style="margin-top:12px"><strong>MTBF &amp; MTTR</strong><div id="rel-chart-1" style="margin-top:12px"></div></div>
  <div class="card" style="margin-top:16px"><strong>Availability</strong><div id="rel-chart-2" style="margin-top:12px"></div></div>`;

  function draw() {
    const months = Number(document.getElementById("rel-months").value);
    const trend = reliabilityTrend(months);
    const labels = trend.map(t => t.label);
    document.getElementById("rel-chart-1").innerHTML = lineChartSVG(labels, [
      { name: "MTBF (h)", color: "#1d4fa0", values: trend.map(t => t.mtbf) },
      { name: "MTTR (h)", color: "#b33a35", values: trend.map(t => t.mttr) }
    ]);
    document.getElementById("rel-chart-2").innerHTML = lineChartSVG(labels, [
      { name: "Availability %", color: "#2e9e5b", values: trend.map(t => t.availability) }
    ], { valueFmt: v => v + "%" });
  }
  document.getElementById("rel-months").addEventListener("change", draw);
  draw();
}

/* ---------- COST ---------- */
function renderCostAnalysis(body) {
  body.innerHTML = `
  <div class="page-head"><strong>Cost Analysis</strong>
    <select id="cost-months" class="inline-select">
      <option value="3">Last 3 months</option>
      <option value="6" selected>Last 6 months</option>
      <option value="12">Last 12 months</option>
    </select>
  </div>
  <div class="card"><strong>Cost by Month</strong><div id="cost-chart-1" style="margin-top:12px"></div></div>
  <div class="grid two-col" style="margin-top:16px">
    <div class="card"><strong>Cost by Equipment</strong><div id="cost-chart-2" style="margin-top:12px"></div></div>
    <div class="card"><strong>Cost by Type</strong><div id="cost-chart-3" style="margin-top:12px"></div></div>
  </div>
  <div class="card" style="margin-top:16px"><strong>Cost by Production Line</strong><div id="cost-chart-4" style="margin-top:12px"></div></div>`;

  function draw() {
    const months = Number(document.getElementById("cost-months").value);
    const monthly = costByMonth(months);
    document.getElementById("cost-chart-1").innerHTML = barChartSVG(
      monthly.map(m => ({ label: m.label, value: m.total })),
      { valueFmt: v => (v / 1000).toFixed(0) + "k" }
    );

    const byEquip = costByEquipment(months * 30).slice(0, 8);
    document.getElementById("cost-chart-2").innerHTML = byEquip.length
      ? barChartSVG(byEquip.map(r => ({ label: assetLabel(r.asset_id).split("—")[0].trim(), value: r.total })), { valueFmt: v => (v / 1000).toFixed(0) + "k" })
      : `<div class="empty">No cost recorded.</div>`;

    const byType = costByType(months * 30);
    document.getElementById("cost-chart-3").innerHTML = byType.length
      ? barChartSVG(byType.map(r => ({ label: r.type, value: r.total })), { valueFmt: v => (v / 1000).toFixed(0) + "k", color: "#1d4fa0" })
      : `<div class="empty">No cost recorded.</div>`;

    const byLine = costByLine(months * 30);
    document.getElementById("cost-chart-4").innerHTML = byLine.length
      ? barChartSVG(byLine.map(r => ({ label: r.line, value: r.total })), { valueFmt: v => (v / 1000).toFixed(0) + "k", color: "#2e9e5b" })
      : `<div class="empty">No cost recorded.</div>`;
  }
  document.getElementById("cost-months").addEventListener("change", draw);
  draw();
}
