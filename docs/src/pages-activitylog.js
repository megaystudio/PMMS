/* ===================== ACTIVITY LOG — Catatan Perbaikan 9, poin #7 =====================
   audit_logs has recorded every create/update/delete since Build 02, and
   LOGIN/LOGOUT/ACCESS_DENIED since the Fase 1 login system — this page is
   the first UI to actually show any of it. Same visibility rule as the
   rest of Settings: gated on Settings:View (Administrator + Maintenance
   Planner), so Technician/Viewer see a notice instead of the log. */

const LOG_ACTION_COLOR = {
  LOGIN: "green", LOGOUT: "gray", CREATE: "blue", UPDATE: "yellow",
  DELETE: "red", ACCESS_DENIED: "red"
};
function logBadge(action) {
  return `<span class="status ${LOG_ACTION_COLOR[action] || "gray"}">${esc(action)}</span>`;
}

function activityLogHtml() {
  if (!can("Settings", "View")) {
    return `<div class="notice">Your current role (${currentRole()}) doesn't have permission to view the Activity Log.</div>`;
  }
  const actionTypes = ["All", "LOGIN", "LOGOUT", "CREATE", "UPDATE", "DELETE", "ACCESS_DENIED"];
  return `
  <div class="page-head">
    <strong>Activity Log</strong>
    <div style="display:flex;gap:10px">
      <input id="log-search" class="inline-select" placeholder="Search detail…" style="min-width:180px">
      <select id="log-action" class="inline-select">${actionTypes.map(a => `<option value="${a}">${a === "All" ? "All actions" : a.replace("_", " ")}</option>`).join("")}</select>
      <select id="log-period" class="inline-select">
        <option value="7">Last 7 days</option>
        <option value="30" selected>Last 30 days</option>
        <option value="90">Last 90 days</option>
        <option value="0">All time</option>
      </select>
    </div>
  </div>
  <p class="kpi-note" style="margin:0 0 14px">The 500 most recent events are kept. Every create, edit, delete, sign-in, sign-out, and denied access attempt is logged automatically — this page only displays what's already being recorded.</p>
  <div class="card" id="log-body"></div>`;
}

function activityLogAfter() {
  if (!can("Settings", "View")) return;
  const actionSel = document.getElementById("log-action");
  const periodSel = document.getElementById("log-period");
  const searchInput = document.getElementById("log-search");

  function refresh() {
    const action = actionSel.value;
    const days = Number(periodSel.value);
    const cutoff = days ? addDays(today(), -days) : null;
    const q = searchInput.value.trim().toLowerCase();

    let rows = [...all("audit_logs")];
    if (action !== "All") rows = rows.filter(l => l.action === action);
    if (cutoff) rows = rows.filter(l => l.timestamp.slice(0, 10) >= cutoff);
    if (q) rows = rows.filter(l => (l.detail || "").toLowerCase().includes(q));

    document.getElementById("log-body").innerHTML = rows.length ? `
      <div class="table-wrap"><table class="table">
        <thead><tr><th style="width:180px">Timestamp</th><th style="width:130px">Action</th><th>Detail</th></tr></thead>
        <tbody>${rows.map(l => `<tr><td>${new Date(l.timestamp).toLocaleString()}</td><td>${logBadge(l.action)}</td><td>${esc(l.detail)}</td></tr>`).join("")}</tbody>
      </table></div>` : `<div class="empty">No activity recorded for this filter.</div>`;
  }

  actionSel.addEventListener("change", refresh);
  periodSel.addEventListener("change", refresh);
  searchInput.addEventListener("input", refresh);
  refresh();
}
