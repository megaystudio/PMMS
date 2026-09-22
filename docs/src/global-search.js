/* ===================== GLOBAL SEARCH — Catatan Perbaikan 9, poin #5 =====================
   A single search box in the topbar, searching across the tables people
   actually look things up by: Asset code/name, Technician name, Spare
   Part code/name, Work Order number, PM Task code/description, and
   Breakdown description. Results are grouped and clicking one navigates
   straight to the relevant page (and, where a direct detail view exists,
   opens it). This does not replace the per-page quick filters added
   alongside it — the two solve different problems: this finds *which*
   record and *where* it lives; the per-page filter narrows a list you're
   already looking at. */

function globalSearchResults(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const results = [];

  all("assets").forEach(a => {
    if (a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)) {
      results.push({
        group: "Assets", label: `${a.code} — ${a.name}`, sub: a.location || "",
        action: () => { render("assets"); setTimeout(() => document.querySelector(`[data-view="${a.id}"]`)?.click(), 30); }
      });
    }
  });
  all("technicians").forEach(t => {
    if (t.name.toLowerCase().includes(q) || (t.department || "").toLowerCase().includes(q)) {
      results.push({ group: "Technicians", label: t.name, sub: t.department || "", action: () => render("technicians") });
    }
  });
  all("spare_parts").forEach(s => {
    if (s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)) {
      results.push({ group: "Spare Parts", label: `${s.code} — ${s.name}`, sub: s.department || "", action: () => render("spare-parts") });
    }
  });
  all("work_orders").forEach(w => {
    if (w.wo_no.toLowerCase().includes(q)) {
      results.push({
        group: "Work Orders", label: w.wo_no, sub: `${assetLabel(w.asset_id)} · ${w.status}`,
        action: () => { render("work-orders"); setTimeout(() => openWorkOrderDetail(w.id), 30); }
      });
    }
  });
  all("pm_tasks").forEach(t => {
    if ((t.code || "").toLowerCase().includes(q) || t.description.toLowerCase().includes(q)) {
      results.push({ group: "PM Tasks", label: `${t.code || "—"} — ${t.description}`, sub: assetLabel(t.asset_id), action: () => render("pm-master") });
    }
  });
  all("breakdowns").forEach(b => {
    if (b.failure.toLowerCase().includes(q)) {
      results.push({ group: "Breakdowns", label: b.failure, sub: assetLabel(b.asset_id), action: () => render("breakdowns") });
    }
  });

  return results.slice(0, 30);
}

function renderGlobalSearchResults(results, query) {
  const box = document.getElementById("global-search-results");
  if (!box) return;
  if (!query.trim()) { box.classList.add("hidden"); box.innerHTML = ""; return; }
  if (!results.length) {
    box.innerHTML = `<div class="gsr-empty">No matches for "${esc(query)}"</div>`;
    box.classList.remove("hidden");
    return;
  }
  const grouped = {};
  results.forEach(r => { (grouped[r.group] = grouped[r.group] || []).push(r); });
  box.innerHTML = Object.keys(grouped).map(g => `
    <div class="gsr-group">${esc(g)}</div>
    ${grouped[g].map((r, i) => `<div class="gsr-item" data-gsr-group="${esc(g)}" data-gsr-index="${i}">${esc(r.label)}${r.sub ? `<small>${esc(r.sub)}</small>` : ""}</div>`).join("")}
  `).join("");
  box.classList.remove("hidden");
  box.querySelectorAll("[data-gsr-group]").forEach(el => {
    const g = el.dataset.gsrGroup, i = Number(el.dataset.gsrIndex);
    el.addEventListener("click", () => {
      grouped[g][i].action();
      box.classList.add("hidden");
      const input = document.getElementById("global-search");
      if (input) input.value = "";
    });
  });
}

(function wireGlobalSearch() {
  const input = document.getElementById("global-search");
  const wrap = document.getElementById("global-search-wrap");
  const box = document.getElementById("global-search-results");
  if (!input || !wrap || !box) return;

  input.addEventListener("input", () => renderGlobalSearchResults(globalSearchResults(input.value), input.value));
  input.addEventListener("focus", () => { if (input.value.trim()) renderGlobalSearchResults(globalSearchResults(input.value), input.value); });
  input.addEventListener("keydown", e => {
    if (e.key === "Escape") { input.value = ""; box.classList.add("hidden"); input.blur(); }
  });
  document.addEventListener("click", e => { if (!wrap.contains(e.target)) box.classList.add("hidden"); });
})();

/* ===================== PER-PAGE QUICK FILTER ===================== */
// A small reusable table filter: typing hides table rows whose text
// doesn't match. Deliberately client-side and dumb (no column targeting)
// so it can be dropped into any list page in one line.
function wireQuickFilter(inputId, tableSelector) {
  const input = document.getElementById(inputId);
  const table = document.querySelector(tableSelector);
  if (!input || !table) return;
  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    table.querySelectorAll("tbody tr").forEach(tr => {
      tr.style.display = (!q || tr.textContent.toLowerCase().includes(q)) ? "" : "none";
    });
  });
}
