/* ===================== WORK ORDER ===================== */

function workOrdersHtml() {
  const rows = [...all("work_orders")].sort((a, b) => b.id - a.id);
  const usage = workOrderMonthUsage();
  return `
  <div class="page-head">
    <div><strong>Work Orders</strong>${usage.unlimited ? "" : `<div class="kpi-note">${usage.count}/${usage.limit} created this month on ${licenseType()} license</div>`}</div>
    <div style="display:flex;gap:10px">
      <input id="quick-filter" class="inline-select" placeholder="Filter…">
      ${can("Work Order","Create") ? '<button class="button" id="import-pm-records">⬆ Import Historical PM Records</button>' : ""}
      ${can("Work Order","Create") ? '<button class="button primary" id="add-wo">+ New Work Order</button>' : ""}
    </div>
  </div>
  ${usage.atLimit ? `<div class="notice" style="margin-bottom:16px">You've reached the ${usage.limit} Work Order/month limit on the ${licenseType()} license. Upgrade to PREMIUM or VIP for unlimited Work Orders. ${licenseUpgradeLinkHtml("batas Work Order bulanan")}</div>` : ""}
  <div class="card table-wrap"><table class="table" id="work-orders-table">
    <thead><tr><th>WO No.</th><th>Asset</th><th>Type</th><th>Scheduled</th><th>Technician</th><th>Priority</th><th>Status</th><th></th></tr></thead>
    <tbody>
    ${rows.map(w => `<tr>
      <td><b>${esc(w.wo_no)}</b></td>
      <td>${esc(assetLabel(w.asset_id))}</td>
      <td>${esc(w.type)}</td>
      <td>${fmtDate(w.scheduled_date)}</td>
      <td>${esc(techName(w.technician_id))}</td>
      <td>${badge(w.priority === "High" ? "Overdue" : w.priority === "Medium" ? "Due" : "Planned")}</td>
      <td>${badge(w.status)}</td>
      <td><button class="link-btn" data-open-wo="${w.id}">Open</button>${can("Work Order","Delete") ? ` · <button class="link-btn" data-delete-wo="${w.id}" style="color:#b33a35">Delete</button>` : ""}</td>
    </tr>`).join("")}
    ${!rows.length ? `<tr><td colspan="8"><div class="empty">No work order yet.</div></td></tr>` : ""}
    </tbody>
  </table></div>`;
}

function adHocWoFormHtml() {
  return `
  <div class="form-grid">
    <div class="field"><label>Asset</label><select id="f-asset">${all("assets").map(a => option(a.id, `${a.code} — ${a.name}`)).join("")}</select></div>
    <div class="field"><label>Type</label><select id="f-type">
      ${option("Corrective", "Corrective")}${option("Breakdown", "Breakdown")}${option("Preventive", "Preventive")}
    </select></div>
    <div class="field"><label>Scheduled Date</label><input type="date" id="f-date" value="${today()}"></div>
    <div class="field"><label>Technician</label><select id="f-tech">${all("technicians").map(t => option(t.id, t.name)).join("")}</select></div>
    <div class="field"><label>Priority</label><select id="f-priority">${option("High", "High")}${option("Medium", "Medium", "Medium")}${option("Low", "Low")}</select></div>
  </div>
  <div class="form-actions"><button class="button" id="cancel">Cancel</button><button class="button primary" id="save">Create</button></div>`;
}

function workOrdersAfter() {
  wireQuickFilter("quick-filter", "#work-orders-table");
  document.getElementById("import-pm-records")?.addEventListener("click", () => openGenericImportModal({
    title: "Import Historical PM Records",
    extraNotice: `Each row becomes a completed Work Order + checklist execution (and an Abnormality if marked Abnormal) — this is how a real dataset (past PM history) gets loaded in bulk instead of clicking through the checklist once per record. Columns: <code>asset_code, task_code, date, technician_name, result (Normal/Abnormal), finding, severity, action, spare_part_code, qty, man_hours</code>`,
    templateHeaders: ["asset_code","task_code","date","technician_name","result","finding","severity","action","spare_part_code","qty","man_hours"],
    templateName: "PMMS_PMRecord_Import_Template.csv",
    importFn: importPmRecordsFromCSV, onDone: () => render("work-orders")
  }));
  document.getElementById("add-wo")?.addEventListener("click", () => {
    if (workOrderMonthUsage().atLimit) {
      toast(`Work Order limit reached (${workOrderMonthUsage().limit}/month) on the ${licenseType()} license. Upgrade for unlimited Work Orders.`, "error");
      return;
    }
    const overlay = openModal("New Work Order", adHocWoFormHtml());
    overlay.querySelector("#cancel").addEventListener("click", closeModal);
    overlay.querySelector("#save").addEventListener("click", () => {
      const wo = createAdHocWorkOrder({
        asset_id: Number(overlay.querySelector("#f-asset").value),
        type: overlay.querySelector("#f-type").value,
        scheduled_date: overlay.querySelector("#f-date").value,
        technician_id: Number(overlay.querySelector("#f-tech").value),
        priority: overlay.querySelector("#f-priority").value
      });
      if (!wo) return;
      toast(`Work Order ${wo.wo_no} created.`);
      closeModal();
      render("work-orders");
    });
  });
  document.querySelectorAll("[data-open-wo]").forEach(b => b.addEventListener("click", () => {
    openWorkOrderDetail(Number(b.dataset.openWo));
  }));
  document.querySelectorAll("[data-delete-wo]").forEach(b => b.addEventListener("click", () => {
    const wo = find("work_orders", b.dataset.deleteWo);
    const hasExec = all("pm_executions").some(e => e.work_order_id === wo.id);
    const relatedAbnormalities = all("abnormalities").filter(a => a.work_order_id === wo.id).length;
    const relatedCosts = all("maintenance_costs").filter(c => c.work_order_id === wo.id).length;
    const scheduleWarning = (wo.status === "Completed" || wo.status === "Closed")
      ? ` This Work Order is ${wo.status} — deleting it will NOT revert its linked PM Schedule entry (if any) back to Overdue/Planned, so PM Compliance figures may look inconsistent afterward. Consider this before deleting a completed record.`
      : "";
    const note = (hasExec || relatedAbnormalities || relatedCosts)
      ? ` It has ${hasExec ? "a PM execution record, " : ""}${relatedAbnormalities} Abnormality/ies, and ${relatedCosts} cost entr${relatedCosts === 1 ? "y" : "ies"} on record — deleting it does not remove those; they'll remain but reference a removed Work Order.${scheduleWarning}`
      : scheduleWarning;
    confirmDialog(`Delete Work Order ${esc(wo.wo_no)}? This can't be undone.${note}`, () => {
      if (!guardedRemove("work_orders", wo.id)) return;
      toast("Work Order deleted.");
      render("work-orders");
    });
  }));
}

/* ===================== WORK ORDER DETAIL / PM EXECUTION ===================== */

function openWorkOrderDetail(id) {
  const wo = find("work_orders", id);
  const task = wo.pm_task_id ? find("pm_tasks", wo.pm_task_id) : null;
  const exec = all("pm_executions").find(e => e.work_order_id === id);
  const overlay = openModal(`${wo.wo_no}`, workOrderDetailHtml(wo, task, exec), { wide: true });
  wireWorkOrderDetail(wo, task, overlay);
}

function workOrderDetailHtml(wo, task, exec) {
  const header = `
  <div class="detail-grid">
    <div><span class="label">Asset</span><div>${esc(assetLabel(wo.asset_id))}</div></div>
    <div><span class="label">Type</span><div>${wo.type}</div></div>
    <div><span class="label">Scheduled</span><div>${fmtDate(wo.scheduled_date)}</div></div>
    <div><span class="label">Priority</span><div>${wo.priority}</div></div>
    <div><span class="label">Technician</span><div>${techName(wo.technician_id)}</div></div>
    <div><span class="label">Status</span><div>${badge(wo.status)}</div></div>
  </div>`;

  if (wo.status === "Closed" || wo.status === "Completed") {
    return header + executionSummaryHtml(exec, wo);
  }

  if (!task) {
    return header + `
    <div class="notice" style="margin-top:16px">This is an ad-hoc / corrective Work Order with no predefined checklist. Record the outcome below.</div>
    <div class="field" style="margin-top:10px"><label>Work Description / Result</label><textarea id="f-note" rows="3" ${can("Work Order","Execute") ? "" : "disabled"}></textarea></div>
    ${can("Work Order","Execute") ? `<div class="form-actions"><button class="button primary" id="complete-adhoc">Complete Work Order</button></div>` : `<div class="notice">Your current role cannot execute work orders.</div>`}`;
  }

  const checklistRows = (task.checklist || []).map((c, i) => `
    <div class="exec-row" data-idx="${i}">
      <div class="exec-item"><b>${esc(c.item)}</b><span>${esc(c.standard)}</span></div>
      <select class="exec-result">
        ${option("Normal", "Normal")}${option("Abnormal", "Abnormal")}${option("Not Applicable", "N/A")}
      </select>
      <input class="exec-note" placeholder="Note (optional)">
    </div>`).join("");

  return header + `
  <div class="section-title" style="margin-top:16px">Execution Header</div>
  <div class="form-grid">
    <div class="field"><label>Technician</label><select id="f-tech">${all("technicians").map(t => option(t.id, t.name, wo.technician_id)).join("")}</select></div>
    <div class="field"><label>Date</label><input type="date" id="f-date" value="${today()}"></div>
    <div class="field"><label>Start Time</label><input type="time" id="f-start"></div>
    <div class="field"><label>End Time</label><input type="time" id="f-end"></div>
  </div>

  <div class="section-title">Checklist</div>
  <div id="exec-rows">${checklistRows}</div>

  <div id="finding-block" class="hidden">
    <div class="section-title">Finding (required — an Abnormal item was recorded)</div>
    <div class="form-grid">
      <div class="field" style="grid-column:1/-1"><label>Finding Description</label><input id="f-finding" placeholder="e.g. Hydraulic hose showing minor leakage"></div>
      <div class="field"><label>Severity</label><select id="f-severity">${option("Low", "Low")}${option("Medium", "Medium", "Medium")}${option("High", "High")}</select></div>
      <div class="field"><label>Recommended Action</label><input id="f-action" placeholder="e.g. Replace hose"></div>
    </div>
  </div>

  <div class="section-title">Spare Part Used (optional)</div>
  <div class="form-grid">
    <div class="field"><label>Spare Part</label><select id="f-spare"><option value="">— none —</option>${all("spare_parts").map(s => option(s.id, `${s.name} (${fmtMoney(s.unit_cost)}/${s.unit})`)).join("")}</select></div>
    <div class="field"><label>Quantity</label><input type="number" id="f-spare-qty" value="0" min="0" step="0.1"></div>
    <div class="field"><label>Man-hours</label><input type="number" id="f-manhours" value="${task.est_duration ? (task.est_duration / 60).toFixed(1) : 0.5}" step="0.1"></div>
  </div>

  <div class="form-actions">
    <button class="button" id="cancel">Cancel</button>
    ${can("Work Order","Execute") ? '<button class="button primary" id="submit-exec">Submit & Close Checklist</button>' : '<div class="notice">Your current role cannot execute work orders.</div>'}
  </div>`;
}

function executionSummaryHtml(exec, wo) {
  if (!exec) return `<div class="notice" style="margin-top:16px">Work order completed without a recorded checklist.</div>`;
  return `
  <div class="section-title" style="margin-top:16px">Execution Result — ${badge(exec.overall_result)}</div>
  <table class="table"><thead><tr><th>Item</th><th>Result</th><th>Note</th></tr></thead><tbody>
  ${(exec.checklist || []).map(c => `<tr><td>${c.task}</td><td>${badge(c.result)}</td><td>${c.note || "—"}</td></tr>`).join("")}
  </tbody></table>
  ${wo.status === "Completed" && can("Work Order","Approve") ? `<div class="form-actions"><button class="button primary" id="close-wo">Close Work Order</button></div>` : ""}
  `;
}

function wireWorkOrderDetail(wo, task, overlay) {
  const cancelBtn = overlay.querySelector("#cancel");
  if (cancelBtn) cancelBtn.addEventListener("click", closeModal);

  const closeBtn = overlay.querySelector("#close-wo");
  if (closeBtn) closeBtn.addEventListener("click", () => {
    if (!closeWorkOrder(wo.id)) return;
    toast("Work Order closed.");
    closeModal();
    render("work-orders");
  });

  const adhocBtn = overlay.querySelector("#complete-adhoc");
  if (adhocBtn) adhocBtn.addEventListener("click", () => {
    if (!can("Work Order", "Execute")) { denyModuleAccess("Work Order", "Execute"); return; }
    const note = overlay.querySelector("#f-note").value.trim();
    update("work_orders", wo.id, { status: "Closed" });
    insert("maintenance_costs", { work_order_id: wo.id, type: "Labor", amount: 0, date: today() });
    log("EXECUTE", `Ad-hoc WO#${wo.id} closed: ${note}`);
    toast("Work Order completed.");
    closeModal();
    render("work-orders");
  });

  const resultSelects = overlay.querySelectorAll(".exec-result");
  function checkAbnormal() {
    const anyAbnormal = [...resultSelects].some(s => s.value === "Abnormal");
    const block = overlay.querySelector("#finding-block");
    if (block) block.classList.toggle("hidden", !anyAbnormal);
  }
  resultSelects.forEach(s => s.addEventListener("change", checkAbnormal));

  const submitBtn = overlay.querySelector("#submit-exec");
  if (submitBtn) submitBtn.addEventListener("click", () => {
    const rows = overlay.querySelectorAll(".exec-row");
    const checklist = [...rows].map((row, i) => ({
      task: task.checklist[i].item,
      result: row.querySelector(".exec-result").value,
      note: row.querySelector(".exec-note").value.trim()
    }));
    const anyAbnormal = checklist.some(c => c.result === "Abnormal");
    if (anyAbnormal && !overlay.querySelector("#f-finding").value.trim()) {
      toast("Finding description is required when a checklist item is Abnormal.", "error");
      return;
    }
    const spareId = overlay.querySelector("#f-spare").value;
    const spareQty = Number(overlay.querySelector("#f-spare-qty").value || 0);
    let spareUsage = [];
    if (spareId && spareQty > 0) {
      const sp = find("spare_parts", spareId);
      spareUsage.push({ spare_part_id: Number(spareId), qty: spareQty, cost: spareQty * sp.unit_cost });
    }

    const result = submitExecution(wo.id, {
      date: overlay.querySelector("#f-date").value,
      start_time: overlay.querySelector("#f-start").value,
      end_time: overlay.querySelector("#f-end").value,
      technician_id: Number(overlay.querySelector("#f-tech").value),
      checklist,
      finding: anyAbnormal ? overlay.querySelector("#f-finding").value.trim() : "",
      severity: anyAbnormal ? overlay.querySelector("#f-severity").value : "",
      action: anyAbnormal ? overlay.querySelector("#f-action").value.trim() : "",
      spareUsage,
      man_hours: Number(overlay.querySelector("#f-manhours").value || 0)
    });
    if (!result) return;

    toast(anyAbnormal ? "Execution submitted. Abnormality recorded for follow-up." : "Execution submitted. Work Order completed.");
    closeModal();
    render("work-orders");
  });
}

/* ===================== ABNORMALITY MANAGEMENT ===================== */

function abnormalitiesHtml() {
  const rows = [...all("abnormalities")].sort((a, b) => b.id - a.id);
  return `
  <div class="page-head"><div><strong>Abnormality Management</strong><div class="kpi-note">Findings from PM Execution that require follow-up action (Blueprint §13 flow)</div></div><input id="quick-filter" class="inline-select" placeholder="Filter…"></div>
  <div class="card table-wrap"><table class="table" id="abnormalities-table">
    <thead><tr><th>Asset</th><th>Finding</th><th>Severity</th><th>Corrective WO</th><th>Status</th><th></th></tr></thead>
    <tbody>
    ${rows.map(a => {
      const ca = correctiveActionFor(a.id);
      const wo = ca ? find("work_orders", ca.work_order_id) : null;
      return `<tr>
      <td>${esc(assetLabel(a.asset_id))}</td>
      <td>${esc(a.finding)}</td>
      <td>${badge(a.severity === "High" ? "Abnormal" : a.severity)}</td>
      <td>${wo ? `${wo.wo_no} ${badge(wo.status)}` : "—"}</td>
      <td>${badge(a.status)}</td>
      <td>${abnormalityActionCell(a)}</td>
    </tr>`;
    }).join("")}
    ${!rows.length ? `<tr><td colspan="6"><div class="empty">No abnormality recorded. Findings raised during PM Execution will appear here automatically.</div></td></tr>` : ""}
    </tbody>
  </table></div>`;
}

function abnormalityActionCell(a) {
  if (a.status === "Open") return can("Abnormality","Approve") ? `<button class="link-btn" data-create-corrective="${a.id}">Create Corrective WO</button>` : "—";
  if (a.status === "Corrective Action") return can("Abnormality","Approve") ? `<button class="link-btn" data-progress="${a.id}">Mark Repaired</button>` : "—";
  if (a.status === "Repair") return can("Abnormality","Approve") ? `<button class="link-btn" data-verify="${a.id}">Verify Effectiveness</button>` : "—";
  if (a.status === "Verification") return can("Abnormality","Approve") ? `<button class="link-btn" data-progress="${a.id}">Close Finding</button>` : "—";
  return (can("RCA","Create") && canUseRca()) ? `<button class="link-btn" data-start-rca="${a.id}">Start RCA</button>` : "—";
}

function abnormalitiesAfter() {
  wireQuickFilter("quick-filter", "#abnormalities-table");
  document.querySelectorAll("[data-create-corrective]").forEach(b => b.addEventListener("click", () => {
    const a = find("abnormalities", b.dataset.createCorrective);
    const overlay = openModal("Create Corrective Work Order", `
      <div class="form-grid">
        <div class="field" style="grid-column:1/-1"><label>Finding</label><input value="${esc(a.finding)}" disabled></div>
        <div class="field"><label>Technician</label><select id="f-tech">${all("technicians").map(t => option(t.id, t.name)).join("")}</select></div>
        <div class="field"><label>Priority</label><select id="f-priority">${option("High", "High", "High")}${option("Medium", "Medium")}</select></div>
      </div>
      <div class="form-actions"><button class="button" id="cancel">Cancel</button><button class="button primary" id="save">Create</button></div>`);
    overlay.querySelector("#cancel").addEventListener("click", closeModal);
    overlay.querySelector("#save").addEventListener("click", () => {
      const result = createCorrectiveWorkOrder(a.id, Number(overlay.querySelector("#f-tech").value), overlay.querySelector("#f-priority").value);
      if (!result) return;
      toast(`Corrective Work Order ${result.wo.wo_no} created — complete it from Work Orders.`);
      closeModal();
      render("abnormalities");
    });
  }));

  document.querySelectorAll("[data-progress]").forEach(b => b.addEventListener("click", () => {
    const a = find("abnormalities", b.dataset.progress);
    const label = a.status === "Verification" ? "close this finding" : `move this finding from "${a.status}"`;
    confirmDialog(`Confirm you want to ${label}?`, () => {
      const result = progressAbnormality(a.id);
      if (!result.ok) { toast(result.error, "error"); return; }
      toast("Finding updated.");
      render("abnormalities");
    });
  }));

  document.querySelectorAll("[data-verify]").forEach(b => b.addEventListener("click", () => {
    const a = find("abnormalities", b.dataset.verify);
    const overlay = openModal("Verify Effectiveness", `
      <div class="field"><label>Verification Note</label><textarea id="f-note" rows="3" placeholder="e.g. Re-inspected after repair, no further leakage after 3 days"></textarea></div>
      <div class="form-actions"><button class="button" id="cancel">Cancel</button><button class="button primary" id="save">Save & Move to Verification</button></div>`);
    overlay.querySelector("#cancel").addEventListener("click", closeModal);
    overlay.querySelector("#save").addEventListener("click", () => {
      const result = progressAbnormality(a.id, overlay.querySelector("#f-note").value);
      if (!result.ok) { toast(result.error, "error"); return; }
      toast("Verification recorded.");
      closeModal();
      render("abnormalities");
    });
  }));

  document.querySelectorAll("[data-start-rca]").forEach(b => b.addEventListener("click", () => {
    const a = find("abnormalities", b.dataset.startRca);
    openRcaCreateModal({
      title: `${esc(a.finding)} — ${esc(assetLabel(a.asset_id))}`,
      asset_id: a.asset_id,
      problem_statement: a.finding,
      source_type: "Abnormality",
      source_id: a.id
    });
  }));
}

/* ===================== BREAKDOWN MANAGEMENT ===================== */

const FAILURE_MODES = ["Mechanical Wear", "Electrical Fault", "Leakage", "Overheating", "Blockage", "Corrosion", "Software/Control Fault", "Operator Error", "Other"];
const FAILURE_CAUSES = ["Lack of Lubrication", "Fatigue / Age", "Contamination", "Overload", "Poor Installation", "Design Weakness", "Inadequate Maintenance", "Unknown"];

function breakdownsHtml() {
  const rows = [...all("breakdowns")].sort((a, b) => b.id - a.id);
  return `
  <div class="page-head">
    <strong>Breakdown Management</strong>
    <div style="display:flex;gap:10px">
      <input id="quick-filter" class="inline-select" placeholder="Filter…">
      ${can("Breakdown","Create") ? '<button class="button" id="import-breakdown">⬆ Import CSV</button>' : ""}
      ${can("Breakdown","Create") ? '<button class="button primary" id="add-breakdown">+ Record Breakdown</button>' : ""}
    </div>
  </div>
  <div class="card table-wrap"><table class="table" id="breakdowns-table">
    <thead><tr><th>Date</th><th>Asset</th><th>Failure</th><th>Mode</th><th>Cause</th><th>Downtime</th><th>Repair</th><th>Cost</th><th>Status</th><th></th></tr></thead>
    <tbody>
    ${rows.map(b => `<tr>
      <td>${fmtDate(b.date)}</td><td>${esc(assetLabel(b.asset_id))}</td><td>${esc(b.failure)}</td>
      <td>${b.failure_mode || "—"}</td><td>${b.cause || "—"}</td>
      <td>${b.downtime_hours}h</td><td>${b.repair_duration}h</td>
      <td>${fmtMoney(b.spare_cost || 0)}</td>
      <td>${badge(b.status)}</td>
      <td>${(can("RCA","Create") && canUseRca()) ? `<button class="link-btn" data-start-rca-bd="${b.id}">Start RCA</button>` : ""}${can("Breakdown","Delete") ? ` ${(can("RCA","Create") && canUseRca()) ? "·" : ""} <button class="link-btn" data-delete-bd="${b.id}" style="color:#b33a35">Delete</button>` : (!(can("RCA","Create") && canUseRca()) ? "—" : "")}</td>
    </tr>`).join("")}
    ${!rows.length ? `<tr><td colspan="10"><div class="empty">No breakdown recorded. This feeds MTBF / MTTR / Availability on the dashboard and the Breakdown Report.</div></td></tr>` : ""}
    </tbody>
  </table></div>`;
}

function breakdownFormHtml() {
  return `
  <div class="form-grid">
    <div class="field"><label>Asset</label><select id="f-asset">${all("assets").map(a => option(a.id, `${a.code} — ${a.name}`)).join("")}</select></div>
    <div class="field"><label>Date</label><input type="date" id="f-date" value="${today()}"></div>
    <div class="field" style="grid-column:1/-1"><label>Failure Description</label><input id="f-failure"></div>
    <div class="field"><label>Failure Mode</label><select id="f-mode">${FAILURE_MODES.map(m => `<option>${m}</option>`).join("")}</select></div>
    <div class="field"><label>Cause</label><select id="f-cause">${FAILURE_CAUSES.map(c => `<option>${c}</option>`).join("")}</select></div>
    <div class="field"><label>Downtime (hours)</label><input type="number" id="f-downtime" step="0.1" value="0"></div>
    <div class="field"><label>Repair Duration (hours)</label><input type="number" id="f-repair" step="0.1" value="0"></div>
    <div class="field"><label>Technician</label><select id="f-tech">${all("technicians").map(t => option(t.id, t.name)).join("")}</select></div>
    <div class="field"><label>Status</label><select id="f-status">${option("Open", "Open")}${option("Closed", "Closed")}</select></div>
    <div class="field"><label>Spare Part Used (optional)</label><select id="f-spare"><option value="">— none —</option>${all("spare_parts").map(s => option(s.id, `${s.name} (${fmtMoney(s.unit_cost)}/${s.unit})`)).join("")}</select></div>
    <div class="field"><label>Quantity</label><input type="number" id="f-spare-qty" step="0.1" value="0"></div>
    <div class="field" style="grid-column:1/-1"><label>Action Taken</label><input id="f-action" placeholder="e.g. Replaced hydraulic hose"></div>
  </div>
  <div class="form-actions"><button class="button" id="cancel">Cancel</button><button class="button primary" id="save">Save</button></div>`;
}

function breakdownsAfter() {
  wireQuickFilter("quick-filter", "#breakdowns-table");
  document.getElementById("import-breakdown")?.addEventListener("click", () => openGenericImportModal({
    title: "Import Breakdowns", templateHeaders: ["asset_code","date","failure","failure_mode","cause","downtime_hours","repair_duration","technician_name","spare_part_code","qty","status"],
    templateName: "PMMS_Breakdown_Import_Template.csv",
    importFn: importBreakdownsFromCSV, onDone: () => render("breakdowns")
  }));
  document.getElementById("add-breakdown")?.addEventListener("click", () => {
    const overlay = openModal("Record Breakdown", breakdownFormHtml());
    overlay.querySelector("#cancel").addEventListener("click", closeModal);
    overlay.querySelector("#save").addEventListener("click", () => {
      const spareId = overlay.querySelector("#f-spare").value;
      const qty = Number(overlay.querySelector("#f-spare-qty").value || 0);
      let spareCost = 0;
      const bd = guardedInsert("breakdowns", {
        asset_id: Number(overlay.querySelector("#f-asset").value),
        date: overlay.querySelector("#f-date").value,
        failure: overlay.querySelector("#f-failure").value.trim(),
        failure_mode: overlay.querySelector("#f-mode").value,
        cause: overlay.querySelector("#f-cause").value,
        downtime_hours: Number(overlay.querySelector("#f-downtime").value || 0),
        repair_duration: Number(overlay.querySelector("#f-repair").value || 0),
        technician_id: Number(overlay.querySelector("#f-tech").value),
        spare_part_id: spareId ? Number(spareId) : null,
        spare_cost: 0,
        action: overlay.querySelector("#f-action").value.trim(),
        status: overlay.querySelector("#f-status").value
      });
      if (!bd) return;
      if (spareId && qty > 0) {
        const sp = find("spare_parts", spareId);
        spareCost = qty * sp.unit_cost;
        insert("maintenance_costs", { work_order_id: null, type: "Spare Part", amount: spareCost, date: bd.date, breakdown_id: bd.id });
        update("breakdowns", bd.id, { spare_cost: spareCost });
      }
      toast("Breakdown recorded.");
      closeModal();
      render("breakdowns");
    });
  });
  document.querySelectorAll("[data-start-rca-bd]").forEach(b => b.addEventListener("click", () => {
    const bd = find("breakdowns", b.dataset.startRcaBd);
    openRcaCreateModal({
      title: `${esc(bd.failure)} — ${esc(assetLabel(bd.asset_id))}`,
      asset_id: bd.asset_id,
      problem_statement: `${bd.failure} (${bd.failure_mode || "Unspecified"}, cause: ${bd.cause || "Unknown"}). Downtime ${bd.downtime_hours}h.`,
      source_type: "Breakdown",
      source_id: bd.id
    });
  }));
  document.querySelectorAll("[data-delete-bd]").forEach(b => b.addEventListener("click", () => {
    const bd = find("breakdowns", b.dataset.deleteBd);
    const relatedCosts = all("maintenance_costs").filter(c => c.breakdown_id === bd.id).length;
    const relatedRca = all("rca_cases").filter(c => c.source_type === "Breakdown" && c.source_id === bd.id).length;
    const note = (relatedCosts || relatedRca)
      ? ` It has ${relatedCosts} cost entr${relatedCosts === 1 ? "y" : "ies"} and ${relatedRca} RCA case(s) on record — deleting it does not remove those; they'll remain but reference a removed breakdown.`
      : "";
    confirmDialog(`Delete this breakdown (${esc(bd.failure)} — ${esc(assetLabel(bd.asset_id))})? This can't be undone.${note}`, () => {
      if (!guardedRemove("breakdowns", bd.id)) return;
      toast("Breakdown deleted.");
      render("breakdowns");
    });
  }));
}
