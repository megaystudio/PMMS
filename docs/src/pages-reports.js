/* ===================== REPORTS — Blueprint section 22 ===================== */

const REPORT_TYPES = {
  pm: "PM Report",
  compliance: "PM Compliance Report",
  breakdown: "Breakdown Report",
  cost: "Maintenance Cost Report",
  workload: "Technician Workload",
  history: "Equipment Maintenance History"
};

function reportsHtml() {
  const s = DB.settings;
  return `
  <div class="page-head">
    <strong>Reports</strong>
    <div style="display:flex;gap:10px">
      <select id="report-type" class="inline-select">${Object.entries(REPORT_TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select>
      <select id="report-period" class="inline-select">
        <option value="7">Last 7 days</option>
        <option value="30" selected>Last 30 days</option>
        <option value="90">Last 90 days</option>
      </select>
      <select id="report-asset" class="inline-select hidden">${all("assets").map(a => `<option value="${a.id}">${esc(a.code)} — ${esc(a.name)}</option>`).join("")}</select>
      ${can("Reports","Export") && canExport() ? '<button class="button" id="export-csv">⬇ CSV</button>' : ""}
      ${can("Reports","Export") && canExport() ? '<button class="button" id="print-report">🖨 Print</button>' : ""}
      ${can("Reports","Export") && !canExport() ? `<span class="kpi-note" style="align-self:center">Export is a PREMIUM/VIP feature — ${licenseUpgradeLinkHtml("fitur export laporan", "💬 Upgrade via WhatsApp")}</span>` : ""}
    </div>
  </div>
  <div class="card report-letterhead">
    ${s.company_logo ? `<img src="${s.company_logo}" alt="Company logo">` : ""}
    <div>
      <strong>${esc(s.company_name)}</strong>
      <div class="kpi-note" id="report-letterhead-sub">${REPORT_TYPES.pm} · Generated ${new Date().toLocaleString()}</div>
    </div>
  </div>
  <div class="card" id="report-body"></div>`;
}

function reportsAfter() {
  const typeSel = document.getElementById("report-type");
  const periodSel = document.getElementById("report-period");
  const assetSel = document.getElementById("report-asset");

  function refresh() {
    const type = typeSel.value;
    assetSel.classList.toggle("hidden", type !== "history");
    periodSel.classList.toggle("hidden", type === "history");
    document.getElementById("report-letterhead-sub").textContent = `${REPORT_TYPES[type]} · Generated ${new Date().toLocaleString()}`;
    document.getElementById("report-body").innerHTML = buildReport(type, Number(periodSel.value), Number(assetSel.value));
  }

  typeSel.addEventListener("change", refresh);
  periodSel.addEventListener("change", refresh);
  assetSel.addEventListener("change", refresh);

  document.getElementById("export-csv")?.addEventListener("click", () => {
    const { csv, filename } = reportCSV(typeSel.value, Number(periodSel.value), Number(assetSel.value));
    if (!csv) { toast("Nothing to export for this report.", "error"); return; }
    downloadCSV(filename, csv);
  });
  document.getElementById("print-report")?.addEventListener("click", () => window.print());

  refresh();
}

function buildReport(type, periodDays, assetId) {
  const cutoff = addDays(today(), -periodDays);

  if (type === "pm") {
    const rows = all("work_orders")
      .filter(w => w.type === "Preventive" && w.scheduled_date >= cutoff)
      .map(w => ({ wo: w, exec: all("pm_executions").find(e => e.work_order_id === w.id) }))
      .sort((a, b) => b.wo.scheduled_date.localeCompare(a.wo.scheduled_date));
    if (!rows.length) return emptyReport();
    return table(
      ["WO No.", "Equipment", "Technician", "Date", "Result", "Finding"],
      rows.map(r => [
        r.wo.wo_no, assetLabel(r.wo.asset_id), techName(r.wo.technician_id), fmtDate(r.wo.scheduled_date),
        r.exec ? badge(r.exec.overall_result) : badge(r.wo.status),
        r.exec && r.exec.overall_result === "Abnormal" ? (all("abnormalities").find(a => a.work_order_id === r.wo.id) || {}).finding || "—" : "—"
      ])
    );
  }

  if (type === "compliance") {
    const k = kpi(periodDays);
    return `
    <div class="grid kpi-grid" style="margin-bottom:6px">
      <div class="card"><div class="kpi-label">PM Compliance</div><div class="kpi-value">${k.pmCompliance ?? "—"}%</div><div class="kpi-note">${k.completed}/${k.planned} completed</div></div>
      <div class="card"><div class="kpi-label">Schedule Compliance</div><div class="kpi-value">${k.scheduleCompliance ?? "—"}%</div><div class="kpi-note">Completed on/before due date</div></div>
      <div class="card"><div class="kpi-label">Overdue (current)</div><div class="kpi-value">${k.overdue}</div></div>
      <div class="card"><div class="kpi-label">Due Today (current)</div><div class="kpi-value">${k.due}</div></div>
    </div>`;
  }

  if (type === "breakdown") {
    const rows = all("breakdowns").filter(b => b.date >= cutoff).sort((a, b) => b.date.localeCompare(a.date));
    if (!rows.length) return emptyReport();
    return table(
      ["Date", "Equipment", "Failure", "Mode", "Cause", "Downtime (h)", "Repair (h)", "Status"],
      rows.map(b => [fmtDate(b.date), assetLabel(b.asset_id), b.failure, b.failure_mode || "—", b.cause || "—", b.downtime_hours, b.repair_duration, badge(b.status)])
    );
  }

  if (type === "cost") {
    const byEquip = costByEquipment(periodDays);
    const byType = costByType(periodDays);
    const total = byType.reduce((s, t) => s + t.total, 0);
    return `
    <div class="kpi-value" style="margin-bottom:16px">${fmtMoney(total)} <span class="kpi-note">total (${periodDays}d)</span></div>
    <div class="grid two-col">
      <div>
        <div class="section-title" style="margin-top:0">By Equipment</div>
        ${byEquip.length ? table(["Equipment", "Cost"], byEquip.map(r => [assetLabel(r.asset_id), fmtMoney(r.total)])) : `<div class="empty">No cost recorded.</div>`}
      </div>
      <div>
        <div class="section-title" style="margin-top:0">By Type</div>
        ${byType.length ? table(["Type", "Cost"], byType.map(r => [r.type, fmtMoney(r.total)])) : `<div class="empty">No cost recorded.</div>`}
      </div>
    </div>`;
  }

  if (type === "workload") {
    const rows = technicianWorkload(periodDays);
    if (!rows.length) return emptyReport();
    return table(["Technician", "Work Orders", "Man-hours"], rows.map(w => [w.technician.name, w.workOrders, w.hours + "h"]));
  }

  if (type === "history") {
    if (!assetId) return emptyReport();
    const h = equipmentHistory(assetId);
    return `
    <div class="section-title" style="margin-top:0">PM History</div>
    ${h.pmHistory.length ? table(["WO No.", "Date", "Result"], h.pmHistory.map(r => [r.wo.wo_no, fmtDate(r.wo.scheduled_date), r.exec ? badge(r.exec.overall_result) : "—"])) : `<div class="empty">No PM history.</div>`}
    <div class="section-title">Breakdown History</div>
    ${h.breakdownHistory.length ? table(["Date", "Failure", "Downtime"], h.breakdownHistory.map(b => [fmtDate(b.date), b.failure, b.downtime_hours + "h"])) : `<div class="empty">No breakdown history.</div>`}
    <div class="section-title">Corrective History</div>
    ${h.correctiveHistory.length ? table(["Date", "Finding", "Status"], h.correctiveHistory.map(a => [fmtDate(a.created_at), a.finding, badge(a.status)])) : `<div class="empty">No corrective history.</div>`}
    `;
  }

  return emptyReport();
}

function reportCSV(type, periodDays, assetId) {
  const cutoff = addDays(today(), -periodDays);
  if (type === "pm") {
    const rows = all("work_orders").filter(w => w.type === "Preventive" && w.scheduled_date >= cutoff);
    return { filename: `PM_Report_${today()}.csv`, csv: toCSV(rows, [
      { label: "WO No.", value: "wo_no" },
      { label: "Equipment", value: w => assetLabel(w.asset_id) },
      { label: "Technician", value: w => techName(w.technician_id) },
      { label: "Date", value: "scheduled_date" },
      { label: "Status", value: "status" }
    ]) };
  }
  if (type === "breakdown") {
    const rows = all("breakdowns").filter(b => b.date >= cutoff);
    return { filename: `Breakdown_Report_${today()}.csv`, csv: toCSV(rows, [
      { label: "Date", value: "date" }, { label: "Equipment", value: b => assetLabel(b.asset_id) },
      { label: "Failure", value: "failure" }, { label: "Mode", value: "failure_mode" }, { label: "Cause", value: "cause" },
      { label: "Downtime (h)", value: "downtime_hours" }, { label: "Repair (h)", value: "repair_duration" }, { label: "Status", value: "status" }
    ]) };
  }
  if (type === "workload") {
    const rows = technicianWorkload(periodDays);
    return { filename: `Technician_Workload_${today()}.csv`, csv: toCSV(rows, [
      { label: "Technician", value: r => r.technician.name }, { label: "Work Orders", value: "workOrders" }, { label: "Man-hours", value: "hours" }
    ]) };
  }
  if (type === "cost") {
    const rows = costByEquipment(periodDays);
    return { filename: `Cost_By_Equipment_${today()}.csv`, csv: toCSV(rows, [
      { label: "Equipment", value: r => assetLabel(r.asset_id) }, { label: "Cost", value: "total" }
    ]) };
  }
  if (type === "history" && assetId) {
    const h = equipmentHistory(assetId);
    return { filename: `Equipment_History_${assetLabel(assetId).replace(/\s/g, "_")}_${today()}.csv`, csv: toCSV(h.pmHistory, [
      { label: "WO No.", value: r => r.wo.wo_no }, { label: "Date", value: r => r.wo.scheduled_date },
      { label: "Result", value: r => r.exec ? r.exec.overall_result : r.wo.status }
    ]) };
  }
  return { csv: null, filename: null };
}

function table(headers, rows) {
  // Report cells mix plain values (dates, numbers, asset/technician names,
  // free-text findings) with already-rendered HTML fragments from badge()
  // — escape the former, pass the latter through untouched.
  const cell = c => (typeof c === "string" && c.trim().startsWith("<")) ? c : esc(c);
  return `<table class="table"><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>
  ${rows.map(r => `<tr>${r.map(c => `<td>${cell(c)}</td>`).join("")}</tr>`).join("")}
  </tbody></table>`;
}

function emptyReport() {
  return `<div class="empty">No data available for this report / period.</div>`;
}
