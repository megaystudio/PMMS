/* ===================== RCA & CONTINUOUS IMPROVEMENT — Blueprint §21 ===================== */

function rcaHtml() {
  const rows = [...all("rca_cases")].sort((a, b) => b.id - a.id);
  const canCreate = can("RCA", "Create") && canUseRca();
  return `
  <div class="page-head">
    <div><strong>RCA & Continuous Improvement</strong><div class="kpi-note">Failure → Problem Definition → Investigation → Root Cause → Action Plan → Implementation → Effectiveness Check → Standardization</div></div>
    ${canCreate ? '<button class="button primary" id="add-rca">+ New RCA Case</button>' : ""}
  </div>
  ${can("RCA", "Create") && !canUseRca() ? `<div class="notice" style="margin-bottom:16px">You can view and continue existing RCA cases on the ${licenseType()} license. Starting new RCA investigations requires PREMIUM or VIP. ${licenseUpgradeLinkHtml("fitur RCA")}</div>` : ""}
  <div class="card table-wrap"><table class="table">
    <thead><tr><th>Title</th><th>Asset</th><th>Source</th><th>Stage</th><th>Opened</th><th></th></tr></thead>
    <tbody>
    ${rows.map(c => `<tr>
      <td><b>${esc(c.title)}</b></td>
      <td>${esc(assetLabel(c.asset_id))}</td>
      <td>${c.source_type}</td>
      <td>${badge(c.status === "Closed" ? "Closed" : "Due")} ${c.status}</td>
      <td>${fmtDate(c.created_at)}</td>
      <td><button class="link-btn" data-open-rca="${c.id}">Open</button></td>
    </tr>`).join("")}
    ${!rows.length ? `<tr><td colspan="6"><div class="empty">No RCA case yet. Start one from here, or from a closed Abnormality / recurring failure.</div></td></tr>` : ""}
    </tbody>
  </table></div>`;
}

function rcaAfter() {
  document.getElementById("add-rca")?.addEventListener("click", () => openRcaCreateModal({}));
  document.querySelectorAll("[data-open-rca]").forEach(b => b.addEventListener("click", () => openRcaDetail(Number(b.dataset.openRca))));
}

function openRcaCreateModal(prefill) {
  if (!canUseRca()) {
    toast(`Starting new RCA cases requires PREMIUM or VIP (currently on ${licenseType()}).`, "error");
    return;
  }
  const overlay = openModal("New RCA Case", `
    <div class="form-grid">
      <div class="field" style="grid-column:1/-1"><label>Title</label><input id="f-title" value="${prefill.title || ""}" placeholder="e.g. Repeated hydraulic hose leakage — M-001"></div>
      <div class="field"><label>Asset</label><select id="f-asset">${all("assets").map(a => option(a.id, `${a.code} — ${a.name}`, prefill.asset_id)).join("")}</select></div>
      <div class="field"><label>Source</label><input value="${prefill.source_type || "Manual"}" disabled></div>
      <div class="field" style="grid-column:1/-1"><label>Problem Statement</label><textarea id="f-problem" rows="3" placeholder="Describe the problem clearly: what, where, when, impact">${prefill.problem_statement || ""}</textarea></div>
    </div>
    <div class="form-actions"><button class="button" id="cancel">Cancel</button><button class="button primary" id="save">Create Case</button></div>`);
  overlay.querySelector("#cancel").addEventListener("click", closeModal);
  overlay.querySelector("#save").addEventListener("click", () => {
    const title = overlay.querySelector("#f-title").value.trim();
    const problem = overlay.querySelector("#f-problem").value.trim();
    if (!title || !problem) { toast("Title and problem statement are required.", "error"); return; }
    const c = createRcaCase({
      title, problem_statement: problem,
      asset_id: Number(overlay.querySelector("#f-asset").value),
      source_type: prefill.source_type || "Manual",
      source_id: prefill.source_id || null
    });
    toast("RCA case created.");
    closeModal();
    if (document.getElementById("content").querySelector("#add-rca")) render("rca");
    openRcaDetail(c.id);
  });
}

const RCA_STAGE_META = {
  "Investigation": { label: "Investigation Notes", field: "investigation_notes", placeholder: "What was checked, observed, measured, or tested?" },
  "Root Cause": { label: "Root Cause", field: "root_cause", placeholder: "The underlying cause identified — not just the symptom." },
  "Action Plan": { label: "Action Plan", field: "action_plan", placeholder: "What will be done, by whom, and by when." },
  "Standardization": { label: "Standardization Notes", field: "standardization_notes", placeholder: "How this is now standardized — updated SOP, PM Task, drawing, spec, or training." },
};

function openRcaDetail(id) {
  const overlay = openModal("RCA Case", rcaDetailHtml(id), { wide: true });
  wireRcaDetail(id, overlay);
}

function rcaDetailHtml(id) {
  const c = find("rca_cases", id);
  const stageIdx = RCA_FLOW.indexOf(c.status);
  return `
  <div class="detail-grid" style="grid-template-columns:repeat(3,1fr)">
    <div><span class="label">Title</span><div>${esc(c.title)}</div></div>
    <div><span class="label">Asset</span><div>${esc(assetLabel(c.asset_id))}</div></div>
    <div><span class="label">Stage</span><div>${badge(c.status === "Closed" ? "Closed" : "Due")} ${c.status}</div></div>
  </div>

  <div class="tabs" id="rca-subtabs">
    <button class="tab active" data-rtab="timeline">Case Timeline</button>
    <button class="tab" data-rtab="5why">5 Why (${rcaMethodRows("rca_5why", id).length})</button>
    <button class="tab" data-rtab="fishbone">Fishbone (${rcaMethodRows("rca_fishbone", id).length})</button>
    <button class="tab" data-rtab="fmea">FMEA (${rcaMethodRows("rca_fmea", id).length})</button>
  </div>

  <div class="rca-panel" data-rpanel="timeline">${rcaTimelineHtml(c, stageIdx)}</div>
  <div class="rca-panel hidden" data-rpanel="5why">${rcaFiveWhyHtml(id)}</div>
  <div class="rca-panel hidden" data-rpanel="fishbone">${rcaFishboneHtml(id)}</div>
  <div class="rca-panel hidden" data-rpanel="fmea">${rcaFmeaHtml(id)}</div>
  `;
}

function rcaTimelineHtml(c, stageIdx) {
  const steps = [
    { key: "Problem Definition", value: c.problem_statement, always: true },
    { key: "Investigation", value: c.investigation_notes },
    { key: "Root Cause", value: c.root_cause },
    { key: "Action Plan", value: c.action_plan },
    { key: "Implementation", value: c.implementation_notes, extra: c.implementation_date ? ` (done ${fmtDate(c.implementation_date)})` : "" },
    { key: "Effectiveness Check", value: c.effectiveness_notes, extra: c.effectiveness_result ? ` — ${badge(c.effectiveness_result === "Effective" ? "Normal" : "Abnormal")}` : "" },
    { key: "Standardization", value: c.standardization_notes }
  ];

  const rows = steps.map((s, i) => {
    const flowIdx = i === 0 ? -1 : RCA_FLOW.indexOf(s.key);
    const isDone = i === 0 || flowIdx < stageIdx || c.status === "Closed" && flowIdx <= RCA_FLOW.indexOf("Standardization");
    const isCurrent = s.key === c.status;
    const isFuture = !isDone && !isCurrent;

    if (isFuture) {
      return `<div class="rca-step locked"><div class="rca-step-title">${s.key}</div><div class="rca-step-body empty">Locked — complete previous stage first.</div></div>`;
    }
    if (isCurrent && c.status !== "Closed") {
      return `<div class="rca-step current"><div class="rca-step-title">${s.key} <span class="chip">current stage</span></div><div class="rca-step-body">${rcaStageForm(c, s.key)}</div></div>`;
    }
    return `<div class="rca-step done"><div class="rca-step-title">✓ ${s.key}${s.extra || ""}</div><div class="rca-step-body">${s.value ? esc(s.value) : "—"}</div></div>`;
  }).join("");

  const effLog = c.effectiveness_log && c.effectiveness_log.length > 1 ? `
    <div class="notice" style="margin-top:12px">This case looped back from Effectiveness Check ${c.effectiveness_log.filter(l => l.result !== "Effective").length} time(s) before being confirmed effective — each attempt is kept below.</div>
    ${table(["Date", "Result", "Notes"], c.effectiveness_log.map(l => [fmtDate(l.date), badge(l.result === "Effective" ? "Normal" : "Abnormal"), l.notes]))}
  ` : "";

  return rows + effLog;
}

function rcaStageForm(c, stage) {
  if (stage === "Implementation") {
    if (!can("RCA", "Edit")) return `<div class="empty">Your current role cannot edit this stage.</div>`;
    return `
    <textarea id="rca-input" rows="3" placeholder="What was implemented and how.">${c.implementation_notes || ""}</textarea>
    <div class="field" style="margin-top:10px"><label>Implementation Date</label><input type="date" id="rca-input-2" value="${c.implementation_date || today()}"></div>
    <div class="form-actions"><button class="button primary" data-confirm-stage="Implementation">Confirm Implementation</button></div>`;
  }
  if (stage === "Effectiveness Check") {
    if (!can("RCA", "Approve")) return `<div class="empty">Your current role cannot approve an effectiveness check.</div>`;
    return `
    <div class="field"><label>Result</label><select id="rca-select"><option value="Effective">Effective</option><option value="Not Effective">Not Effective — reopen Root Cause</option></select></div>
    <textarea id="rca-input" rows="3" placeholder="How effectiveness was verified (e.g. re-inspected after 2 weeks, no recurrence)."></textarea>
    <div class="form-actions"><button class="button primary" data-confirm-stage="Effectiveness Check">Submit Check</button></div>`;
  }
  const meta = RCA_STAGE_META[stage];
  if (!meta) return "";
  if (!can("RCA", "Edit")) return `<div class="empty">Your current role cannot edit this stage.</div>`;
  return `
  <textarea id="rca-input" rows="3" placeholder="${meta.placeholder}"></textarea>
  <div class="form-actions"><button class="button primary" data-confirm-stage="${stage}">Confirm ${stage}</button></div>`;
}

function rcaFiveWhyHtml(id) {
  const rows = rcaMethodRows("rca_5why", id).sort((a, b) => a.level - b.level);
  return `
  <div class="notice">Ask "why" repeatedly (typically 5 times) until the root cause surfaces, not just the first symptom.</div>
  <div style="margin-top:12px">
  ${rows.map(r => `<div class="why-row"><b>Why ${r.level}:</b> ${esc(r.why_text)}</div>`).join("")}
  </div>
  ${rows.length < 5 ? `
  <div class="field" style="margin-top:12px"><label>Why ${rows.length + 1}</label><input id="rca-why-input" placeholder="Why did this happen?"></div>
  <div class="form-actions"><button class="button primary" id="add-why">Add</button></div>` : `<div class="kpi-note" style="margin-top:10px">5 levels reached.</div>`}`;
}

function rcaFishboneHtml(id) {
  const cats = ["Man", "Machine", "Method", "Material", "Environment"];
  const rows = rcaMethodRows("rca_fishbone", id);
  return `
  <div class="notice">4M + 1E — capture possible causes under each category before narrowing down to the root cause.</div>
  <div class="fishbone-grid" style="margin-top:12px">
  ${cats.map(cat => `
    <div class="fishbone-col">
      <div class="fishbone-head">${cat}</div>
      ${rows.filter(r => r.category === cat).map(r => `<div class="fishbone-cause">${esc(r.cause_text)}</div>`).join("") || `<div class="empty" style="padding:8px 0">No cause listed.</div>`}
      <input class="fishbone-input" data-cat="${cat}" placeholder="+ add cause">
    </div>`).join("")}
  </div>`;
}

function rcaFmeaHtml(id) {
  const rows = rcaMethodRows("rca_fmea", id).sort((a, b) => b.rpn - a.rpn);
  return `
  <div class="notice">RPN = Severity × Occurrence × Detection (each 1–10). Higher RPN = higher priority to fix.</div>
  ${rows.length ? table(
    ["Failure Mode", "Effect", "Cause", "S", "O", "D", "RPN"],
    rows.map(r => [r.failure_mode, r.effect, r.cause, r.severity, r.occurrence, r.detection, `<b>${r.rpn}</b>`])
  ) : `<div class="empty" style="margin-top:10px">No FMEA entry yet.</div>`}
  <div class="section-title">Add FMEA Entry</div>
  <div class="form-grid">
    <div class="field" style="grid-column:1/-1"><label>Failure Mode</label><input id="f-fm"></div>
    <div class="field" style="grid-column:1/-1"><label>Effect</label><input id="f-effect"></div>
    <div class="field" style="grid-column:1/-1"><label>Cause</label><input id="f-cause"></div>
    <div class="field"><label>Severity (1-10)</label><input type="number" id="f-sev" min="1" max="10" value="5"></div>
    <div class="field"><label>Occurrence (1-10)</label><input type="number" id="f-occ" min="1" max="10" value="5"></div>
    <div class="field"><label>Detection (1-10)</label><input type="number" id="f-det" min="1" max="10" value="5"></div>
  </div>
  <div class="form-actions"><button class="button primary" id="add-fmea">Add Entry</button></div>`;
}

function wireRcaDetail(id, overlay) {
  overlay.querySelectorAll("#rca-subtabs .tab").forEach(btn => {
    btn.addEventListener("click", () => {
      overlay.querySelectorAll("#rca-subtabs .tab").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      overlay.querySelectorAll(".rca-panel").forEach(p => p.classList.add("hidden"));
      overlay.querySelector(`.rca-panel[data-rpanel="${btn.dataset.rtab}"]`).classList.remove("hidden");
    });
  });

  function refresh() {
    const activeTab = overlay.querySelector("#rca-subtabs .tab.active");
    const activeKey = activeTab ? activeTab.dataset.rtab : "timeline";
    const scrollY = overlay.querySelector(".modal-body").scrollTop;
    overlay.querySelector(".modal-body").innerHTML = rcaDetailHtml(id);
    wireRcaDetail(id, overlay);
    if (activeKey !== "timeline") {
      overlay.querySelectorAll("#rca-subtabs .tab").forEach(b => b.classList.toggle("active", b.dataset.rtab === activeKey));
      overlay.querySelectorAll(".rca-panel").forEach(p => p.classList.toggle("hidden", p.dataset.rpanel !== activeKey));
    }
    overlay.querySelector(".modal-body").scrollTop = scrollY;
  }

  const confirmBtn = overlay.querySelector("[data-confirm-stage]");
  if (confirmBtn) confirmBtn.addEventListener("click", () => {
    const stage = confirmBtn.dataset.confirmStage;
    let payload = {};
    if (stage === "Implementation") {
      payload = { implementation_notes: overlay.querySelector("#rca-input").value, implementation_date: overlay.querySelector("#rca-input-2").value };
    } else if (stage === "Effectiveness Check") {
      payload = { effectiveness_result: overlay.querySelector("#rca-select").value, effectiveness_notes: overlay.querySelector("#rca-input").value };
    } else {
      const field = RCA_STAGE_META[stage].field;
      payload[field] = overlay.querySelector("#rca-input").value;
    }
    const result = progressRcaCase(id, stage, payload);
    if (!result.ok) { toast(result.error, "error"); return; }
    toast(result.loopedBack ? "Marked Not Effective — case reopened at Root Cause." : "Stage confirmed.");
    refresh();
  });

  const addWhyBtn = overlay.querySelector("#add-why");
  if (addWhyBtn) addWhyBtn.addEventListener("click", () => {
    const val = overlay.querySelector("#rca-why-input").value.trim();
    if (!val) return;
    addWhy(id, val);
    refresh();
  });

  overlay.querySelectorAll(".fishbone-input").forEach(inp => {
    inp.addEventListener("keydown", e => {
      if (e.key === "Enter" && inp.value.trim()) {
        addFishboneCause(id, inp.dataset.cat, inp.value.trim());
        refresh();
      }
    });
  });

  const addFmeaBtn = overlay.querySelector("#add-fmea");
  if (addFmeaBtn) addFmeaBtn.addEventListener("click", () => {
    const fm = overlay.querySelector("#f-fm").value.trim();
    if (!fm) { toast("Failure mode is required.", "error"); return; }
    addFmeaRow(id, {
      failure_mode: fm,
      effect: overlay.querySelector("#f-effect").value.trim(),
      cause: overlay.querySelector("#f-cause").value.trim(),
      severity: Number(overlay.querySelector("#f-sev").value),
      occurrence: Number(overlay.querySelector("#f-occ").value),
      detection: Number(overlay.querySelector("#f-det").value)
    });
    refresh();
  });
}
