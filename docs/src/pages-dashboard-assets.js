/* ===================== DASHBOARD ===================== */

function dashboardHtml() {
  const k = kpi(30);
  const recentAbnormal = DB.abnormalities.filter(a => a.status !== "Closed").slice(0, 5);
  const dueSoon = DB.pm_schedules
    .filter(s => s.status === "Due" || s.status === "Overdue")
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .slice(0, 6);

  return `
  <div class="grid kpi-grid">
    <div class="card"><div class="kpi-label">PM Compliance (30d)</div><div class="kpi-value">${k.pmCompliance ?? "—"}${k.pmCompliance !== null ? "%" : ""}</div><div class="kpi-note">${k.completed}/${k.planned} completed</div></div>
    <div class="card"><div class="kpi-label">PM Overdue</div><div class="kpi-value">${k.overdue}</div><div class="kpi-note">${k.due} due today</div></div>
    <div class="card"><div class="kpi-label">Breakdown (30d)</div><div class="kpi-value">${k.breakdownCount}</div><div class="kpi-note">${k.breakdownHours}h downtime</div></div>
    <div class="card"><div class="kpi-label">Availability</div><div class="kpi-value">${k.availability ?? "—"}${k.availability !== null ? "%" : ""}</div><div class="kpi-note">MTBF ${k.mtbf ?? "—"}h · MTTR ${k.mttr ?? "—"}h</div></div>
  </div>

  ${(k.overdue > 0 || k.criticalAbnormal > 0 || k.due > 0) ? `
  <div class="alert-row">
    ${k.overdue > 0 ? `<div class="alert red">🔴 ${k.overdue} PM Overdue</div>` : ""}
    ${k.due > 0 ? `<div class="alert yellow">🟡 ${k.due} PM Due Today</div>` : ""}
    ${k.criticalAbnormal > 0 ? `<div class="alert red">🔴 ${k.criticalAbnormal} Critical Findings</div>` : ""}
  </div>` : ""}

  <div class="section-title">PM Control Center</div>
  <div class="grid two-col">
    <div class="card">
      <div class="page-head"><strong>Upcoming / Overdue PM</strong><span class="status ${k.overdue ? "red" : "green"}">${k.overdue ? k.overdue + " overdue" : "on track"}</span></div>
      ${dueSoon.length ? `
      <table class="table"><thead><tr><th>Due</th><th>Asset</th><th>Status</th></tr></thead><tbody>
      ${dueSoon.map(s => `<tr><td>${fmtDate(s.due_date)}</td><td>${esc(assetLabel(s.asset_id))}</td><td>${badge(s.status)}</td></tr>`).join("")}
      </tbody></table>` : `<div class="empty">No PM due. Generate a schedule from the PM Schedule page.</div>`}
    </div>
    <div class="card">
      <strong>Open Abnormalities</strong>
      ${recentAbnormal.length ? `
      <table class="table" style="margin-top:12px"><thead><tr><th>Asset</th><th>Finding</th><th>Severity</th></tr></thead><tbody>
      ${recentAbnormal.map(a => `<tr><td>${esc(assetLabel(a.asset_id))}</td><td>${esc(a.finding)}</td><td>${badge(a.severity === "High" ? "Abnormal" : a.severity)}</td></tr>`).join("")}
      </tbody></table>` : `<div class="empty">No open findings.</div>`}
    </div>
  </div>

  <div class="section-title">Maintenance Cost (30d)</div>
  <div class="card"><div class="kpi-value">${fmtMoney(k.costInPeriod)}</div><div class="kpi-note">Spare part, labor and other cost recorded through Work Order execution</div></div>
  `;
}

function dashboardAfter() {}

/* ===================== ASSET MANAGEMENT ===================== */

function assetsHtml() {
  const rows = all("assets");
  const usage = assetUsage();
  return `
  <div class="page-head">
    <div><strong>Equipment Register</strong><div class="kpi-note">${rows.length} asset(s) registered${usage.unlimited ? "" : ` · ${usage.count}/${usage.limit} used on ${licenseType()} license`}</div></div>
    <div style="display:flex;gap:10px">
      <input id="quick-filter" class="inline-select" placeholder="Filter…">
      ${can("Asset", "Create") ? `<button class="button" id="btn-import-asset">⬆ Import CSV</button>` : ""}
      ${can("Asset", "Create") ? `<button class="button primary" id="btn-add-asset">+ Add Asset</button>` : ""}
    </div>
  </div>
  ${usage.atLimit ? `<div class="notice" style="margin-bottom:16px">You've reached the ${usage.limit}-asset limit on the ${licenseType()} license. Upgrade to PREMIUM or VIP to register more equipment. ${licenseUpgradeLinkHtml("batas jumlah aset")}</div>` : ""}
  <div class="card table-wrap"><table class="table" id="assets-table">
    <thead><tr><th>Code</th><th>Name</th><th>Category</th><th>Location</th><th>Criticality</th><th>Status</th><th>Hrs/Day</th><th></th></tr></thead>
    <tbody>
    ${rows.map(a => `
      <tr>
        <td><b>${esc(a.code)}</b></td>
        <td>${esc(a.name)}</td>
        <td>${esc(a.category)}</td>
        <td>${esc(a.location)}</td>
        <td>${criticalityBadge(a.criticality)}</td>
        <td>${badge(a.status)}</td>
        <td>${a.operating_hours_per_day ?? 24}h</td>
        <td><button class="link-btn" data-view="${a.id}">View</button>${can("Asset", "Edit") ? ` · <button class="link-btn" data-edit="${a.id}">Edit</button>` : ""}${can("Asset", "Delete") ? ` · <button class="link-btn" data-delete-asset="${a.id}" style="color:#b33a35">Delete</button>` : ""}</td>
      </tr>`).join("")}
    </tbody>
  </table></div>`;
}

function assetImportModalHtml() {
  return `
  <div class="notice">CSV needs a header row. Required columns: <b>code, name</b>. Optional: category, manufacturer, model, serial, install_date, location, criticality (A/B/C), department.</div>
  <div class="form-actions" style="justify-content:flex-start;margin-top:10px">
    <button class="button" id="download-template">⬇ Download Template</button>
  </div>
  <div class="import-drop" id="import-drop" style="margin-top:14px">
    Click to choose a CSV file, or drag one here
    <input type="file" id="import-file" accept=".csv,text/csv" hidden>
  </div>
  <div id="import-preview"></div>
  <div class="form-actions"><button class="button" id="cancel">Close</button></div>`;
}

function assetFormHtml(asset) {
  const a = asset || {};
  return `
  <div class="form-grid">
    <div class="field"><label>Asset Code</label><input id="f-code" value="${a.code || ""}"></div>
    <div class="field"><label>Asset Name</label><input id="f-name" value="${a.name || ""}"></div>
    <div class="field"><label>Category</label><input id="f-category" value="${a.category || ""}"></div>
    <div class="field"><label>Manufacturer</label><input id="f-manufacturer" value="${a.manufacturer || ""}"></div>
    <div class="field"><label>Model</label><input id="f-model" value="${a.model || ""}"></div>
    <div class="field"><label>Serial Number</label><input id="f-serial" value="${a.serial || ""}"></div>
    <div class="field"><label>Installation Date</label><input type="date" id="f-install" value="${a.install_date || ""}"></div>
    <div class="field"><label>Commission Date</label><input type="date" id="f-commission" value="${a.commission_date || ""}"></div>
    <div class="field"><label>Location</label><input id="f-location" value="${a.location || ""}"></div>
    <div class="field"><label>Production Line</label>
      <select id="f-line">${all("production_lines").map(l => option(l.id, l.name, a.line_id)).join("")}</select>
    </div>
    <div class="field"><label>Criticality</label>
      <select id="f-crit">
        ${option("A", "A — Critical", a.criticality)}
        ${option("B", "B — Important", a.criticality)}
        ${option("C", "C — Normal", a.criticality)}
      </select>
    </div>
    <div class="field"><label>Status</label>
      <select id="f-status">
        ${option("Running", "Running", a.status)}
        ${option("Standby", "Standby", a.status)}
        ${option("Down", "Down", a.status)}
      </select>
    </div>
    <div class="field"><label>Operating Hours / Day</label><input type="number" min="0" max="24" step="0.5" id="f-hours-per-day" value="${a.operating_hours_per_day ?? 24}"></div>
    <div class="field"><label>Responsible Department</label><input id="f-dept" value="${a.department || ""}"></div>
    <div class="field" style="grid-column:1/-1"><label>Notes</label><input id="f-notes" value="${a.notes || ""}"></div>
  </div>
  <p class="kpi-note" style="margin-top:10px">Operating Hours/Day feeds MTBF/MTTR/Availability on the Dashboard and Analytics — set it to match this asset's real schedule (e.g. 8 for one shift, 24 for continuous run). A Down asset counts as 0 hours and Standby as half, regardless of this setting.</p>
  <div class="form-actions">
    <button class="button" id="cancel">Cancel</button>
    <button class="button primary" id="save">${asset ? "Save Changes" : "Add Asset"}</button>
  </div>`;
}

function wireAssetForm(asset) {
  document.getElementById("cancel").addEventListener("click", closeModal);
  document.getElementById("save").addEventListener("click", () => {
    const data = {
      code: document.getElementById("f-code").value.trim(),
      name: document.getElementById("f-name").value.trim(),
      category: document.getElementById("f-category").value.trim(),
      manufacturer: document.getElementById("f-manufacturer").value.trim(),
      model: document.getElementById("f-model").value.trim(),
      serial: document.getElementById("f-serial").value.trim(),
      install_date: document.getElementById("f-install").value,
      commission_date: document.getElementById("f-commission").value,
      location: document.getElementById("f-location").value.trim(),
      line_id: Number(document.getElementById("f-line").value),
      criticality: document.getElementById("f-crit").value,
      status: document.getElementById("f-status").value,
      operating_hours_per_day: Math.min(24, Math.max(0, Number(document.getElementById("f-hours-per-day").value) || 24)),
      department: document.getElementById("f-dept").value.trim(),
      notes: document.getElementById("f-notes").value.trim()
    };
    if (!data.code || !data.name) { toast("Asset code and name are required.", "error"); return; }
    if (asset) {
      if (!guardedUpdate("assets", asset.id, data)) return;
      toast("Asset updated.");
    } else {
      if (assetUsage().atLimit) {
        toast(`Asset limit reached (${assetUsage().limit}) on the ${licenseType()} license. Upgrade to add more.`, "error");
        return;
      }
      if (!guardedInsert("assets", { ...data, operating_hours: 0 })) return;
      toast("Asset added.");
    }
    closeModal();
    render("assets");
  });
}

function assetDetailHtml(id) {
  const a = find("assets", id);
  const h = equipmentHistory(id);
  const tasks = all("pm_tasks").filter(t => t.asset_id === a.id);
  return `
  <div class="detail-grid">
    <div><span class="label">Code</span><div>${a.code}</div></div>
    <div><span class="label">Name</span><div>${esc(a.name)}</div></div>
    <div><span class="label">Category</span><div>${a.category}</div></div>
    <div><span class="label">Location</span><div>${a.location}</div></div>
    <div><span class="label">Criticality</span><div>${criticalityBadge(a.criticality)}</div></div>
    <div><span class="label">Status</span><div>${badge(a.status)}</div></div>
    <div><span class="label">Operating Hours / Day</span><div>${a.operating_hours_per_day ?? 24}h</div></div>
    <div><span class="label">Install Date</span><div>${fmtDate(a.install_date)}</div></div>
    <div><span class="label">Department</span><div>${a.department || "—"}</div></div>
  </div>

  <div class="tabs">
    <button class="tab active" data-tab="pm">PM History (${h.pmHistory.length})</button>
    <button class="tab" data-tab="bd">Breakdown (${h.breakdownHistory.length})</button>
    <button class="tab" data-tab="ab">Corrective (${h.correctiveHistory.length})</button>
    <button class="tab" data-tab="sp">Spare Parts (${h.spareUsage.length})</button>
    <button class="tab" data-tab="pt">PM Tasks (${tasks.length})</button>
  </div>

  <div class="tab-panel" data-panel="pm">
    ${h.pmHistory.length ? `<table class="table"><thead><tr><th>WO</th><th>Date</th><th>Result</th><th>Status</th></tr></thead><tbody>
    ${h.pmHistory.map(r => `<tr><td>${r.wo.wo_no}</td><td>${fmtDate(r.wo.scheduled_date)}</td><td>${r.exec ? badge(r.exec.overall_result) : "—"}</td><td>${badge(r.wo.status)}</td></tr>`).join("")}
    </tbody></table>` : `<div class="empty">No PM execution recorded yet.</div>`}
  </div>
  <div class="tab-panel hidden" data-panel="bd">
    ${h.breakdownHistory.length ? `<table class="table"><thead><tr><th>Date</th><th>Failure</th><th>Downtime</th><th>Status</th></tr></thead><tbody>
    ${h.breakdownHistory.map(b => `<tr><td>${fmtDate(b.date)}</td><td>${esc(b.failure)}</td><td>${b.downtime_hours}h</td><td>${badge(b.status)}</td></tr>`).join("")}
    </tbody></table>` : `<div class="empty">No breakdown recorded.</div>`}
  </div>
  <div class="tab-panel hidden" data-panel="ab">
    ${h.correctiveHistory.length ? `<table class="table"><thead><tr><th>Date</th><th>Finding</th><th>Severity</th><th>Status</th></tr></thead><tbody>
    ${h.correctiveHistory.map(a => `<tr><td>${fmtDate(a.created_at)}</td><td>${esc(a.finding)}</td><td>${a.severity}</td><td>${badge(a.status)}</td></tr>`).join("")}
    </tbody></table>` : `<div class="empty">No corrective finding recorded.</div>`}
  </div>
  <div class="tab-panel hidden" data-panel="sp">
    ${h.spareUsage.length ? `<table class="table"><thead><tr><th>Spare Part</th><th>Qty</th><th>Cost</th></tr></thead><tbody>
    ${h.spareUsage.map(su => { const sp = find("spare_parts", su.spare_part_id); return `<tr><td>${sp ? sp.name : "—"}</td><td>${su.qty}</td><td>${fmtMoney(su.cost)}</td></tr>`; }).join("")}
    </tbody></table>` : `<div class="empty">No spare part usage recorded.</div>`}
  </div>
  <div class="tab-panel hidden" data-panel="pt">
    ${tasks.length ? `<table class="table"><thead><tr><th>Task</th><th>Type</th><th>Frequency</th></tr></thead><tbody>
    ${tasks.map(t => { const mt = find("maintenance_types", t.maintenance_type_id); const fr = find("frequencies", t.frequency_id); return `<tr><td>${esc(t.description)}</td><td>${mt ? esc(mt.name) : "—"}</td><td>${fr ? esc(fr.name) : "—"}</td></tr>`; }).join("")}
    </tbody></table>` : `<div class="empty">No PM task defined for this asset yet. Add one from Maintenance Master.</div>`}
  </div>
  `;
}

function wireAssetDetailTabs(overlay) {
  overlay.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      overlay.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      overlay.querySelectorAll(".tab-panel").forEach(p => p.classList.add("hidden"));
      overlay.querySelector(`.tab-panel[data-panel="${btn.dataset.tab}"]`).classList.remove("hidden");
    });
  });
}

function assetsAfter() {
  wireQuickFilter("quick-filter", "#assets-table");
  const addBtn = document.getElementById("btn-add-asset");
  if (addBtn) addBtn.addEventListener("click", () => {
    if (assetUsage().atLimit) {
      toast(`Asset limit reached (${assetUsage().limit}) on the ${licenseType()} license. Upgrade to add more.`, "error");
      return;
    }
    const overlay = openModal("Add Asset", assetFormHtml());
    wireAssetForm(null);
  });
  const importBtn = document.getElementById("btn-import-asset");
  if (importBtn) importBtn.addEventListener("click", () => {
    const overlay = openModal("Import Assets from CSV", assetImportModalHtml());
    overlay.querySelector("#cancel").addEventListener("click", closeModal);
    overlay.querySelector("#download-template").addEventListener("click", () => {
      downloadCSV("PMMS_Asset_Import_Template.csv", ASSET_IMPORT_TEMPLATE_HEADERS.join(","));
    });
    const dropZone = overlay.querySelector("#import-drop");
    const fileInput = overlay.querySelector("#import-file");
    dropZone.addEventListener("click", () => fileInput.click());
    dropZone.addEventListener("dragover", e => e.preventDefault());
    dropZone.addEventListener("drop", e => {
      e.preventDefault();
      if (e.dataTransfer.files[0]) handleImportFile(e.dataTransfer.files[0], overlay);
    });
    fileInput.addEventListener("change", () => {
      if (fileInput.files[0]) handleImportFile(fileInput.files[0], overlay);
    });
  });
  document.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () => {
    const asset = find("assets", b.dataset.edit);
    openModal("Edit Asset", assetFormHtml(asset));
    wireAssetForm(asset);
  }));
  document.querySelectorAll("[data-view]").forEach(b => b.addEventListener("click", () => {
    const asset = find("assets", b.dataset.view);
    const overlay = openModal(`${esc(asset.code)} — ${esc(asset.name)}`, assetDetailHtml(asset.id), { wide: true });
    wireAssetDetailTabs(overlay);
  }));
  document.querySelectorAll("[data-delete-asset]").forEach(b => b.addEventListener("click", () => {
    const asset = find("assets", b.dataset.deleteAsset);
    const relatedTasks = all("pm_tasks").filter(t => t.asset_id === asset.id).length;
    const relatedWos = all("work_orders").filter(w => w.asset_id === asset.id).length;
    const relatedNote = (relatedTasks || relatedWos) ? ` This asset has ${relatedTasks} PM Task(s) and ${relatedWos} Work Order(s) on record — deleting the asset does not delete those; they'll remain but reference a removed asset.` : "";
    confirmDialog(`Delete ${esc(asset.code)} — ${esc(asset.name)}? This can't be undone.${relatedNote}`, () => {
      if (!guardedRemove("assets", asset.id)) return;
      toast("Asset deleted.");
      render("assets");
    });
  }));
}

function handleImportFile(file, overlay) {
  const reader = new FileReader();
  reader.onload = () => {
    const rows = parseCSV(reader.result);
    if (!rows.length) { toast("The file appears to be empty.", "error"); return; }
    const result = importAssetsFromCSV(rows);
    overlay.querySelector("#import-preview").innerHTML = `
      <div class="notice" style="margin-top:14px">Imported <b>${result.count}</b> of ${rows.length} row(s).</div>
      ${result.errors.length ? `<div class="card" style="margin-top:10px;background:#fdeceb"><b>Skipped rows:</b><ul style="margin:8px 0 0 18px;font-size:12px">${result.errors.map(e => `<li>${e}</li>`).join("")}</ul></div>` : ""}`;
    if (result.count) toast(`${result.count} asset(s) imported.`);
    render("assets");
  };
  reader.onerror = () => toast("Could not read the file.", "error");
  reader.readAsText(file);
}
