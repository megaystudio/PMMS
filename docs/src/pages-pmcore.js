/* ===================== MAINTENANCE MASTER ===================== */

function pmMasterHtml() {
  const tasks = all("pm_tasks");
  return `
  <div class="notice">Maintenance Type and Frequency are the building blocks for every PM Task below. PM Task is what gets scheduled and executed against an asset.</div>

  <div class="grid two-col">
    <div class="card">
      <div class="page-head"><strong>Maintenance Type</strong>${can("PM Master","Create") ? '<button class="button" id="add-type">+ Add</button>' : ""}</div>
      <div class="chip-list">${all("maintenance_types").map(t => `<span class="chip">${esc(t.name)}</span>`).join("")}</div>
    </div>
    <div class="card">
      <div class="page-head"><strong>Frequency</strong>${can("PM Master","Create") ? '<button class="button" id="add-freq">+ Add</button>' : ""}</div>
      <div class="chip-list">${all("frequencies").map(f => `<span class="chip">${esc(f.name)} <i>(${f.days}d)</i></span>`).join("")}</div>
    </div>
  </div>

  <div class="page-head" style="margin-top:26px">
    <strong>PM Task Master</strong>
    <div style="display:flex;gap:10px">
      <input id="quick-filter" class="inline-select" placeholder="Filter…">
      ${can("PM Master","Create") ? '<button class="button" id="import-tasks">⬆ Import CSV</button>' : ""}
      ${can("PM Master","Create") ? '<button class="button primary" id="add-task">+ Add PM Task</button>' : ""}
    </div>
  </div>
  <div class="card table-wrap"><table class="table" id="pm-tasks-table">
    <thead><tr><th>Code</th><th>Asset</th><th>Task</th><th>Department</th><th>Type</th><th>Frequency</th><th>Est. Duration</th><th></th></tr></thead>
    <tbody>
    ${tasks.map(t => {
      const mt = find("maintenance_types", t.maintenance_type_id);
      const fr = find("frequencies", t.frequency_id);
      return `<tr>
        <td><b>${t.code || "—"}</b></td>
        <td>${esc(assetLabel(t.asset_id))}</td>
        <td>${esc(t.description)}</td>
        <td>${esc(t.department) || "—"}</td>
        <td>${mt ? esc(mt.name) : "—"}</td>
        <td>${fr ? esc(fr.name) : "—"}</td>
        <td>${t.est_duration} min</td>
        <td>${can("PM Master","Edit") ? `<button class="link-btn" data-edit-task="${t.id}">Edit</button>` : ""}${can("PM Master","Delete") ? ` ${can("PM Master","Edit") ? "·" : ""} <button class="link-btn" data-delete-task="${t.id}" style="color:#b33a35">Delete</button>` : (!can("PM Master","Edit") ? "—" : "")}</td>
      </tr>`;
    }).join("")}
    ${!tasks.length ? `<tr><td colspan="8"><div class="empty">No PM task defined yet.</div></td></tr>` : ""}
    </tbody>
  </table></div>`;
}

function taskFormHtml(task) {
  const t = task || { checklist: [{ item: "", standard: "" }] };
  const checklistRows = (t.checklist || []).map((c, i) => `
    <div class="checklist-row" data-row="${i}">
      <input placeholder="Checklist item" class="cl-item" value="${c.item || ""}">
      <input placeholder="Standard / acceptance" class="cl-standard" value="${c.standard || ""}">
      <button type="button" class="link-btn remove-row">✕</button>
    </div>`).join("");

  return `
  <div class="form-grid">
    <div class="field"><label>Task Code</label><input id="f-code" value="${t.code || nextPmTaskCode()}" placeholder="e.g. PMT-001"></div>
    <div class="field"><label>Asset</label><select id="f-asset">${all("assets").map(a => option(a.id, `${a.code} — ${a.name}`, t.asset_id)).join("")}</select></div>
    <div class="field"><label>Department Responsible</label><input id="f-dept" value="${esc(t.department || "")}" placeholder="e.g. Maintenance"></div>
    <div class="field"><label>Maintenance Type</label><select id="f-type">${all("maintenance_types").map(m => option(m.id, m.name, t.maintenance_type_id)).join("")}</select></div>
    <div class="field"><label>Frequency</label><select id="f-freq">${all("frequencies").map(f => option(f.id, f.name, t.frequency_id)).join("")}</select></div>
    <div class="field"><label>Estimated Duration (minutes)</label><input type="number" id="f-duration" value="${t.est_duration || 30}"></div>
    <div class="field" style="grid-column:1/-1"><label>Task Description</label><input id="f-desc" value="${t.description || ""}"></div>
    <div class="field"><label>Method</label><input id="f-method" value="${t.method || ""}"></div>
    <div class="field"><label>Safety Requirement</label><input id="f-safety" value="${t.safety || ""}"></div>
    <div class="field"><label>Required Tools</label><input id="f-tools" value="${t.tools || ""}"></div>
    <div class="field"><label>Required Manpower</label><input type="number" id="f-manpower" value="${t.manpower || 1}"></div>
    <div class="field"><label>Spare Part (optional)</label><select id="f-spare"><option value="">—</option>${all("spare_parts").map(s => option(s.id, s.name, t.spare_part_id)).join("")}</select></div>
    <div class="field"><label>Qty / Unit</label><input id="f-qty" value="${t.qty || ""}" placeholder="e.g. 2 Liter"></div>
  </div>

  <div class="section-title" style="margin-top:20px">Checklist</div>
  <div id="checklist-rows">${checklistRows}</div>
  <button type="button" class="button" id="add-row" style="margin-top:8px">+ Add Checklist Item</button>

  <div class="form-actions">
    <button class="button" id="cancel">Cancel</button>
    <button class="button primary" id="save">${task ? "Save Changes" : "Add PM Task"}</button>
  </div>`;
}

function wireTaskForm(task) {
  document.getElementById("cancel").addEventListener("click", closeModal);
  document.getElementById("add-row").addEventListener("click", () => {
    const wrap = document.getElementById("checklist-rows");
    wrap.appendChild(el(`<div class="checklist-row"><input placeholder="Checklist item" class="cl-item"><input placeholder="Standard / acceptance" class="cl-standard"><button type="button" class="link-btn remove-row">✕</button></div>`));
    wireRemoveButtons();
  });
  wireRemoveButtons();
  function wireRemoveButtons() {
    document.querySelectorAll(".remove-row").forEach(b => {
      b.onclick = () => b.closest(".checklist-row").remove();
    });
  }

  document.getElementById("save").addEventListener("click", () => {
    const checklist = [...document.querySelectorAll(".checklist-row")].map(row => ({
      item: row.querySelector(".cl-item").value.trim(),
      standard: row.querySelector(".cl-standard").value.trim()
    })).filter(c => c.item);

    const data = {
      code: document.getElementById("f-code").value.trim() || nextPmTaskCode(),
      asset_id: Number(document.getElementById("f-asset").value),
      department: document.getElementById("f-dept").value.trim(),
      maintenance_type_id: Number(document.getElementById("f-type").value),
      frequency_id: Number(document.getElementById("f-freq").value),
      est_duration: Number(document.getElementById("f-duration").value),
      description: document.getElementById("f-desc").value.trim(),
      method: document.getElementById("f-method").value.trim(),
      safety: document.getElementById("f-safety").value.trim(),
      tools: document.getElementById("f-tools").value.trim(),
      manpower: Number(document.getElementById("f-manpower").value),
      spare_part_id: document.getElementById("f-spare").value ? Number(document.getElementById("f-spare").value) : null,
      qty: document.getElementById("f-qty").value.trim(),
      checklist
    };
    if (!data.description || !checklist.length) { toast("Task description and at least one checklist item are required.", "error"); return; }
    if (!task && findByCode("pm_tasks", data.code)) { toast(`Task code "${data.code}" is already used.`, "error"); return; }

    if (task) { if (!guardedUpdate("pm_tasks", task.id, data)) return; toast("PM Task updated."); }
    else { if (!guardedInsert("pm_tasks", data)) return; toast("PM Task added."); }
    closeModal();
    render("pm-master");
  });
}

function pmMasterAfter() {
  wireQuickFilter("quick-filter", "#pm-tasks-table");
  document.getElementById("add-type")?.addEventListener("click", () => {
    const overlay = openModal("Add Maintenance Type", `
      <div class="field"><label>Name</label><input id="f-name"></div>
      <div class="form-actions"><button class="button" id="cancel">Cancel</button><button class="button primary" id="save">Add</button></div>`);
    overlay.querySelector("#cancel").addEventListener("click", closeModal);
    overlay.querySelector("#save").addEventListener("click", () => {
      const v = overlay.querySelector("#f-name").value.trim();
      if (!v) return;
      if (!guardedInsert("maintenance_types", { name: v })) return;
      closeModal(); render("pm-master");
    });
  });
  document.getElementById("add-freq")?.addEventListener("click", () => {
    const overlay = openModal("Add Frequency", `
      <div class="field"><label>Name</label><input id="f-name" placeholder="e.g. Every 45 Days"></div>
      <div class="field"><label>Interval (days)</label><input type="number" id="f-days"></div>
      <div class="form-actions"><button class="button" id="cancel">Cancel</button><button class="button primary" id="save">Add</button></div>`);
    overlay.querySelector("#cancel").addEventListener("click", closeModal);
    overlay.querySelector("#save").addEventListener("click", () => {
      const name = overlay.querySelector("#f-name").value.trim();
      const days = Number(overlay.querySelector("#f-days").value);
      if (!name || !days) return;
      if (!guardedInsert("frequencies", { name, days })) return;
      closeModal(); render("pm-master");
    });
  });
  document.getElementById("import-tasks")?.addEventListener("click", () => openGenericImportModal({
    title: "Import PM Tasks", templateHeaders: ["task_code","asset_code","description","department","maintenance_type","frequency","standard","method","safety","est_duration","manpower","spare_part_code","qty","unit","checklist_1","checklist_1_standard","checklist_2","checklist_2_standard","checklist_3","checklist_3_standard"],
    templateName: "PMMS_PMTask_Import_Template.csv",
    importFn: importPmTasksFromCSV, onDone: () => render("pm-master")
  }));
  document.getElementById("add-task")?.addEventListener("click", () => {
    openModal("Add PM Task", taskFormHtml(null), { wide: true });
    wireTaskForm(null);
  });
  document.querySelectorAll("[data-edit-task]").forEach(b => b.addEventListener("click", () => {
    const task = find("pm_tasks", b.dataset.editTask);
    openModal("Edit PM Task", taskFormHtml(task), { wide: true });
    wireTaskForm(task);
  }));
  document.querySelectorAll("[data-delete-task]").forEach(b => b.addEventListener("click", () => {
    const task = find("pm_tasks", b.dataset.deleteTask);
    const relatedPlans = all("pm_plans").filter(p => p.pm_task_id === task.id).length;
    const relatedSchedules = all("pm_schedules").filter(s => s.pm_task_id === task.id).length;
    const relatedWos = all("work_orders").filter(w => w.pm_task_id === task.id).length;
    const note = (relatedPlans || relatedSchedules || relatedWos)
      ? ` This task is used by ${relatedPlans} PM Plan(s), ${relatedSchedules} schedule entr${relatedSchedules === 1 ? "y" : "ies"}, and ${relatedWos} Work Order(s) — deleting it does not remove those; they'll keep referencing a removed task.`
      : "";
    confirmDialog(`Delete PM Task ${esc(task.code || "")} — ${esc(task.description)}? This can't be undone.${note}`, () => {
      if (!guardedRemove("pm_tasks", task.id)) return;
      toast("PM Task deleted.");
      render("pm-master");
    });
  }));
}

/* ===================== PM PLAN ===================== */

function pmPlanHtml() {
  const plans = all("pm_plans");
  return `
  <div class="notice">PM Plan links an Asset + PM Task + Frequency together. The PM Scheduler (next page) turns active plans into dated PM Schedule entries.</div>
  <div class="page-head"><strong>PM Plan</strong>
    <div style="display:flex;gap:10px">
      ${can("PM Plan","Create") ? '<button class="button" id="import-plans">⬆ Import CSV</button>' : ""}
      ${can("PM Plan","Create") ? '<button class="button primary" id="add-plan">+ Add PM Plan</button>' : ""}
    </div>
  </div>
  <div class="card table-wrap"><table class="table">
    <thead><tr><th>Asset</th><th>PM Task</th><th>Frequency</th><th>Start Date</th><th>Status</th><th></th></tr></thead>
    <tbody>
    ${plans.map(p => {
      const task = find("pm_tasks", p.pm_task_id);
      const fr = find("frequencies", p.frequency_id);
      return `<tr>
        <td>${esc(assetLabel(p.asset_id))}</td>
        <td>${task ? esc(task.description) : "—"}</td>
        <td>${fr ? esc(fr.name) : "—"}</td>
        <td>${fmtDate(p.start_date)}</td>
        <td>${badge(p.active ? "Running" : "Down")}</td>
        <td>${can("PM Plan","Delete") ? `<button class="link-btn" data-delete-plan="${p.id}" style="color:#b33a35">Delete</button>` : ""}</td>
      </tr>`;
    }).join("")}
    ${!plans.length ? `<tr><td colspan="6"><div class="empty">No PM plan yet. Add a PM Task first, then create a plan for it.</div></td></tr>` : ""}
    </tbody>
  </table></div>`;
}

function planFormHtml() {
  const tasks = all("pm_tasks");
  return `
  <div class="form-grid">
    <div class="field" style="grid-column:1/-1"><label>PM Task</label>
      <select id="f-task">${tasks.map(t => option(t.id, `${assetLabel(t.asset_id)} — ${t.description}`)).join("")}</select>
    </div>
    <div class="field"><label>Frequency</label><select id="f-freq">${all("frequencies").map(f => option(f.id, f.name)).join("")}</select></div>
    <div class="field"><label>Start Date</label><input type="date" id="f-start" value="${today()}"></div>
  </div>
  <div class="form-actions">
    <button class="button" id="cancel">Cancel</button>
    <button class="button primary" id="save">Add PM Plan</button>
  </div>`;
}

function pmPlanAfter() {
  document.getElementById("import-plans")?.addEventListener("click", () => openGenericImportModal({
    title: "Import PM Plans", templateHeaders: ["asset_code","task_code","frequency","start_date"],
    templateName: "PMMS_PMPlan_Import_Template.csv",
    importFn: importPmPlansFromCSV, onDone: () => render("pm-plan")
  }));
  document.getElementById("add-plan")?.addEventListener("click", () => {
    if (!all("pm_tasks").length) { toast("Create a PM Task first (Maintenance Master).", "error"); return; }
    const overlay = openModal("Add PM Plan", planFormHtml());
    overlay.querySelector("#cancel").addEventListener("click", closeModal);
    overlay.querySelector("#save").addEventListener("click", () => {
      const taskId = Number(overlay.querySelector("#f-task").value);
      const task = find("pm_tasks", taskId);
      const ok = guardedInsert("pm_plans", {
        asset_id: task.asset_id,
        pm_task_id: taskId,
        frequency_id: Number(overlay.querySelector("#f-freq").value),
        start_date: overlay.querySelector("#f-start").value,
        active: true,
        last_generated: null
      });
      if (!ok) return;
      toast("PM Plan created.");
      closeModal();
      render("pm-plan");
    });
  });
  document.querySelectorAll("[data-delete-plan]").forEach(b => b.addEventListener("click", () => {
    const plan = find("pm_plans", b.dataset.deletePlan);
    const relatedSchedules = all("pm_schedules").filter(s => s.pm_plan_id === plan.id).length;
    const note = relatedSchedules
      ? ` This plan has ${relatedSchedules} schedule entr${relatedSchedules === 1 ? "y" : "ies"} on record (PM Schedule page) — deleting the plan does not remove those; they'll remain but reference a removed plan, and no new schedule entries will be generated from it going forward.`
      : "";
    confirmDialog(`Delete this PM Plan for ${esc(assetLabel(plan.asset_id))}? This can't be undone.${note}`, () => {
      if (!guardedRemove("pm_plans", plan.id)) return;
      toast("PM Plan deleted.");
      render("pm-plan");
    });
  }));
}

/* ===================== PM SCHEDULE ===================== */

function scheduleHtml() {
  refreshOverdueStatuses(); save();
  const rows = [...all("pm_schedules")].sort((a, b) => a.due_date.localeCompare(b.due_date));
  return `
  <div class="page-head">
    <strong>PM Schedule</strong>
    <div style="display:flex;gap:10px">
      <select id="horizon" class="inline-select">
        <option value="7">Next 7 days</option>
        <option value="30" selected>Next 30 days</option>
        <option value="90">Next 90 days</option>
      </select>
      ${can("Schedule","Create") ? '<button class="button primary" id="gen-schedule">Generate Schedule</button>' : ""}
    </div>
  </div>
  <div class="card table-wrap"><table class="table">
    <thead><tr><th>Due Date</th><th>Asset</th><th>PM Task</th><th>Status</th><th></th></tr></thead>
    <tbody>
    ${rows.map(s => {
      const task = find("pm_tasks", s.pm_task_id);
      const actionable = (s.status === "Due" || s.status === "Overdue" || s.status === "Planned");
      return `<tr>
        <td>${fmtDate(s.due_date)} ${s.rescheduled ? '<span class="chip" style="padding:2px 8px">rescheduled</span>' : ""}</td>
        <td>${esc(assetLabel(s.asset_id))}</td>
        <td>${task ? task.description : "—"}</td>
        <td>${badge(s.status)}</td>
        <td>${actionable ? `${can("Work Order","Create") ? `<button class="link-btn" data-create-wo="${s.id}">Create WO</button>` : ""}${can("Work Order","Create") && can("Schedule","Edit") ? " · " : ""}${can("Schedule","Edit") ? `<button class="link-btn" data-reschedule="${s.id}">Reschedule</button>` : ""}` : "—"}</td>
      </tr>`;
    }).join("")}
    ${!rows.length ? `<tr><td colspan="5"><div class="empty">No schedule generated yet. Click "Generate Schedule" once at least one PM Plan exists.</div></td></tr>` : ""}
    </tbody>
  </table></div>`;
}

function scheduleAfter() {
  document.getElementById("gen-schedule")?.addEventListener("click", () => {
    if (!all("pm_plans").filter(p => p.active).length) { toast("No active PM Plan found.", "error"); return; }
    const horizon = Number(document.getElementById("horizon").value);
    const n = generateSchedule(horizon);
    toast(n ? `${n} schedule entr${n > 1 ? "ies" : "y"} generated.` : "Schedule is already up to date.");
    render("schedule");
  });
  document.querySelectorAll("[data-create-wo]").forEach(b => b.addEventListener("click", () => {
    if (workOrderMonthUsage().atLimit) {
      toast(`Work Order limit reached (${workOrderMonthUsage().limit}/month) on the ${licenseType()} license. Upgrade for unlimited Work Orders.`, "error");
      return;
    }
    const sched = find("pm_schedules", b.dataset.createWo);
    const overlay = openModal("Create Work Order", `
      <div class="form-grid">
        <div class="field"><label>Asset</label><input value="${esc(assetLabel(sched.asset_id))}" disabled></div>
        <div class="field"><label>Due Date</label><input value="${fmtDate(sched.due_date)}" disabled></div>
        <div class="field"><label>Technician</label><select id="f-tech">${all("technicians").map(t => option(t.id, t.name)).join("")}</select></div>
        <div class="field"><label>Priority</label><select id="f-priority">
          ${option("High", "High")}${option("Medium", "Medium", "Medium")}${option("Low", "Low")}
        </select></div>
      </div>
      <div class="form-actions"><button class="button" id="cancel">Cancel</button><button class="button primary" id="save">Create Work Order</button></div>`);
    overlay.querySelector("#cancel").addEventListener("click", closeModal);
    overlay.querySelector("#save").addEventListener("click", () => {
      const wo = createWorkOrderFromSchedule(sched.id, Number(overlay.querySelector("#f-tech").value), overlay.querySelector("#f-priority").value);
      if (!wo) return;
      toast(`Work Order ${wo.wo_no} created.`);
      closeModal();
      render("schedule");
    });
  }));
  document.querySelectorAll("[data-reschedule]").forEach(b => b.addEventListener("click", () => {
    const sched = find("pm_schedules", b.dataset.reschedule);
    const overlay = openModal("Reschedule PM", `
      <div class="form-grid">
        <div class="field"><label>Asset</label><input value="${esc(assetLabel(sched.asset_id))}" disabled></div>
        <div class="field"><label>Current Due Date</label><input value="${fmtDate(sched.due_date)}" disabled></div>
        <div class="field"><label>New Due Date</label><input type="date" id="f-newdate" value="${sched.due_date}"></div>
        <div class="field" style="grid-column:1/-1"><label>Reason</label><input id="f-reason" placeholder="e.g. Production line still running, moved to next stop"></div>
      </div>
      <div class="form-actions"><button class="button" id="cancel">Cancel</button><button class="button primary" id="save">Reschedule</button></div>`);
    overlay.querySelector("#cancel").addEventListener("click", closeModal);
    overlay.querySelector("#save").addEventListener("click", () => {
      const newDate = overlay.querySelector("#f-newdate").value;
      if (!newDate) { toast("New due date is required.", "error"); return; }
      rescheduleSchedule(sched.id, newDate, overlay.querySelector("#f-reason").value.trim());
      toast("PM rescheduled.");
      closeModal();
      render("schedule");
    });
  }));
}
