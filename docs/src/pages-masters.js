/* ===================== SPARE PARTS ===================== */

function sparePartsHtml() {
  const rows = all("spare_parts");
  return `
  <div class="page-head">
    <div><strong>Spare Part Master</strong><div class="kpi-note">Simple master for V1 (Blueprint §16) — full inventory/stock management is a later phase.</div></div>
    <div style="display:flex;gap:10px">
      <input id="quick-filter" class="inline-select" placeholder="Filter…">
      ${can("Spare Part","Create") ? '<button class="button" id="import-spare">⬆ Import CSV</button>' : ""}
      ${can("Spare Part","Create") ? '<button class="button primary" id="add-spare">+ Add Spare Part</button>' : ""}
    </div>
  </div>
  <div class="card table-wrap"><table class="table" id="spare-parts-table">
    <thead><tr><th>Code</th><th>Name</th><th>Department</th><th>Unit</th><th>Unit Cost</th><th></th></tr></thead>
    <tbody>
    ${rows.map(s => `<tr>
      <td><b>${esc(s.code)}</b></td><td>${esc(s.name)}</td><td>${esc(s.department) || "—"}</td><td>${esc(s.unit)}</td><td>${fmtMoney(s.unit_cost)}</td>
      <td>${can("Spare Part","Edit") ? `<button class="link-btn" data-edit-spare="${s.id}">Edit</button>` : ""}${can("Spare Part","Delete") ? ` ${can("Spare Part","Edit") ? "·" : ""} <button class="link-btn" data-delete-spare="${s.id}" style="color:#b33a35">Delete</button>` : (!can("Spare Part","Edit") ? "—" : "")}</td>
    </tr>`).join("")}
    ${!rows.length ? `<tr><td colspan="6"><div class="empty">No spare part registered.</div></td></tr>` : ""}
    </tbody>
  </table></div>`;
}

function sparePartFormHtml(sp) {
  const s = sp || {};
  return `
  <div class="form-grid">
    <div class="field"><label>Code</label><input id="f-code" value="${esc(s.code || "")}"></div>
    <div class="field"><label>Name</label><input id="f-name" value="${esc(s.name || "")}"></div>
    <div class="field"><label>Department Responsible</label><input id="f-dept" value="${esc(s.department || "")}" placeholder="e.g. Maintenance"></div>
    <div class="field"><label>Unit</label><input id="f-unit" value="${esc(s.unit || "")}" placeholder="e.g. Liter, Pcs"></div>
    <div class="field"><label>Unit Cost (Rp)</label><input type="number" id="f-cost" value="${s.unit_cost || 0}"></div>
  </div>
  <div class="form-actions"><button class="button" id="cancel">Cancel</button><button class="button primary" id="save">${sp ? "Save Changes" : "Add Spare Part"}</button></div>`;
}

function sparePartsAfter() {
  wireQuickFilter("quick-filter", "#spare-parts-table");
  document.getElementById("import-spare")?.addEventListener("click", () => openGenericImportModal({
    title: "Import Spare Parts", templateHeaders: ["code","name","department","unit","unit_cost"],
    templateName: "PMMS_SparePart_Import_Template.csv",
    importFn: importSparePartsFromCSV, onDone: () => render("spare-parts")
  }));
  document.getElementById("add-spare")?.addEventListener("click", () => {
    const overlay = openModal("Add Spare Part", sparePartFormHtml());
    wireSparePartForm(overlay, null);
  });
  document.querySelectorAll("[data-edit-spare]").forEach(b => b.addEventListener("click", () => {
    const sp = find("spare_parts", b.dataset.editSpare);
    const overlay = openModal("Edit Spare Part", sparePartFormHtml(sp));
    wireSparePartForm(overlay, sp);
  }));
  document.querySelectorAll("[data-delete-spare]").forEach(b => b.addEventListener("click", () => {
    const sp = find("spare_parts", b.dataset.deleteSpare);
    const usedByTasks = all("pm_tasks").filter(t => t.spare_part_id === sp.id).length;
    const usedByBreakdowns = all("breakdowns").filter(bd => bd.spare_part_id === sp.id).length;
    const usedInHistory = all("spare_part_usage").filter(u => u.spare_part_id === sp.id).length;
    const note = (usedByTasks || usedByBreakdowns || usedInHistory)
      ? ` This spare part is referenced by ${usedByTasks} PM Task(s), ${usedByBreakdowns} Breakdown(s), and ${usedInHistory} usage record(s) — deleting it does not remove those; they'll keep referencing a removed spare part.`
      : "";
    confirmDialog(`Delete ${esc(sp.code)} — ${esc(sp.name)}? This can't be undone.${note}`, () => {
      if (!guardedRemove("spare_parts", sp.id)) return;
      toast("Spare part deleted.");
      render("spare-parts");
    });
  }));
}

function wireSparePartForm(overlay, sp) {
  overlay.querySelector("#cancel").addEventListener("click", closeModal);
  overlay.querySelector("#save").addEventListener("click", () => {
    const data = {
      code: overlay.querySelector("#f-code").value.trim(),
      name: overlay.querySelector("#f-name").value.trim(),
      department: overlay.querySelector("#f-dept").value.trim(),
      unit: overlay.querySelector("#f-unit").value.trim(),
      unit_cost: Number(overlay.querySelector("#f-cost").value || 0)
    };
    if (!data.code || !data.name) { toast("Code and name are required.", "error"); return; }
    const ok = sp ? guardedUpdate("spare_parts", sp.id, data) : guardedInsert("spare_parts", data);
    if (!ok) return;
    toast(sp ? "Spare part updated." : "Spare part added.");
    closeModal();
    render("spare-parts");
  });
}

/* ===================== TECHNICIANS ===================== */

function techniciansHtml() {
  const rows = all("technicians");
  const workload = technicianWorkload(30);
  return `
  <div class="page-head">
    <strong>Technician Master</strong>
    <div style="display:flex;gap:10px">
      <input id="quick-filter" class="inline-select" placeholder="Filter…">
      ${can("Technician","Create") ? '<button class="button" id="import-tech">⬆ Import CSV</button>' : ""}
      ${can("Technician","Create") ? '<button class="button primary" id="add-tech">+ Add Technician</button>' : ""}
    </div>
  </div>
  <div class="card table-wrap"><table class="table" id="technicians-table">
    <thead><tr><th>Name</th><th>Department</th><th>Skill</th><th>Status</th><th></th></tr></thead>
    <tbody>
    ${rows.map(t => `<tr>
      <td><b>${esc(t.name)}</b></td><td>${esc(t.department)}</td><td>${esc(t.skill)}</td><td>${badge(t.status === "Active" ? "Running" : "Standby")}</td>
      <td>${can("Technician","Edit") ? `<button class="link-btn" data-edit-tech="${t.id}">Edit</button>` : ""}${can("Technician","Delete") ? ` ${can("Technician","Edit") ? "·" : ""} <button class="link-btn" data-delete-tech="${t.id}" style="color:#b33a35">Delete</button>` : (!can("Technician","Edit") ? "—" : "")}</td>
    </tr>`).join("")}
    ${!rows.length ? `<tr><td colspan="5"><div class="empty">No technician registered.</div></td></tr>` : ""}
    </tbody>
  </table></div>

  <div class="section-title">Workload — Last 30 Days</div>
  <div class="card table-wrap"><table class="table">
    <thead><tr><th>Technician</th><th>Work Orders</th><th>Man-hours</th></tr></thead>
    <tbody>
    ${workload.map(w => `<tr><td>${esc(w.technician.name)}</td><td>${w.workOrders}</td><td>${w.hours}h</td></tr>`).join("")}
    ${!workload.length ? `<tr><td colspan="3"><div class="empty">No workload data yet.</div></td></tr>` : ""}
    </tbody>
  </table></div>`;
}

function technicianFormHtml(t) {
  const x = t || {};
  return `
  <div class="form-grid">
    <div class="field"><label>Name</label><input id="f-name" value="${esc(x.name || "")}"></div>
    <div class="field"><label>Department</label><input id="f-dept" value="${esc(x.department || "Maintenance")}"></div>
    <div class="field"><label>Skill</label><input id="f-skill" value="${esc(x.skill || "")}" placeholder="e.g. Mechanical, Electrical"></div>
    <div class="field"><label>Certification</label><input id="f-cert" value="${esc(x.certification || "-")}"></div>
    <div class="field"><label>Status</label><select id="f-status">${option("Active", "Active", x.status)}${option("Inactive", "Inactive", x.status)}</select></div>
  </div>
  <div class="form-actions"><button class="button" id="cancel">Cancel</button><button class="button primary" id="save">${t ? "Save Changes" : "Add Technician"}</button></div>`;
}

function techniciansAfter() {
  wireQuickFilter("quick-filter", "#technicians-table");
  document.getElementById("import-tech")?.addEventListener("click", () => openGenericImportModal({
    title: "Import Technicians", templateHeaders: ["name","department","skill","certification","status"],
    templateName: "PMMS_Technician_Import_Template.csv",
    importFn: importTechniciansFromCSV, onDone: () => render("technicians")
  }));
  document.getElementById("add-tech")?.addEventListener("click", () => {
    const overlay = openModal("Add Technician", technicianFormHtml());
    wireTechForm(overlay, null);
  });
  document.querySelectorAll("[data-edit-tech]").forEach(b => b.addEventListener("click", () => {
    const t = find("technicians", b.dataset.editTech);
    const overlay = openModal("Edit Technician", technicianFormHtml(t));
    wireTechForm(overlay, t);
  }));
  document.querySelectorAll("[data-delete-tech]").forEach(b => b.addEventListener("click", () => {
    const t = find("technicians", b.dataset.deleteTech);
    const relatedWos = all("work_orders").filter(w => w.technician_id === t.id).length;
    const relatedBds = all("breakdowns").filter(bd => bd.technician_id === t.id).length;
    const note = (relatedWos || relatedBds)
      ? ` This technician is referenced by ${relatedWos} Work Order(s) and ${relatedBds} Breakdown(s) on record — deleting them does not remove those; they'll keep referencing a removed technician.`
      : "";
    confirmDialog(`Delete ${esc(t.name)}? This can't be undone.${note}`, () => {
      if (!guardedRemove("technicians", t.id)) return;
      toast("Technician deleted.");
      render("technicians");
    });
  }));
}

function wireTechForm(overlay, t) {
  overlay.querySelector("#cancel").addEventListener("click", closeModal);
  overlay.querySelector("#save").addEventListener("click", () => {
    const data = {
      name: overlay.querySelector("#f-name").value.trim(),
      department: overlay.querySelector("#f-dept").value.trim(),
      skill: overlay.querySelector("#f-skill").value.trim(),
      certification: overlay.querySelector("#f-cert").value.trim(),
      status: overlay.querySelector("#f-status").value
    };
    if (!data.name) { toast("Name is required.", "error"); return; }
    const ok = t ? guardedUpdate("technicians", t.id, data) : guardedInsert("technicians", data);
    if (!ok) return;
    toast(t ? "Technician updated." : "Technician added.");
    closeModal();
    render("technicians");
  });
}
