const pages = {
  dashboard: { title: "Maintenance Dashboard", crumb: "Dashboard", html: dashboardHtml, after: dashboardAfter },
  assets: { title: "Asset Management", crumb: "Asset Management", html: assetsHtml, after: assetsAfter },
  "pm-master": { title: "Maintenance Master", crumb: "Maintenance Master", html: pmMasterHtml, after: pmMasterAfter },
  "pm-plan": { title: "PM Planning", crumb: "PM Planning", html: pmPlanHtml, after: pmPlanAfter },
  schedule: { title: "PM Schedule", crumb: "PM Schedule", html: scheduleHtml, after: scheduleAfter },
  "work-orders": { title: "Work Orders", crumb: "Work Orders", html: workOrdersHtml, after: workOrdersAfter },
  abnormalities: { title: "Abnormality Management", crumb: "Abnormality", html: abnormalitiesHtml, after: abnormalitiesAfter },
  breakdowns: { title: "Breakdown Management", crumb: "Breakdown", html: breakdownsHtml, after: breakdownsAfter },
  analytics: { title: "Analytics", crumb: "Analytics", html: analyticsHtml, after: analyticsAfter },
  rca: { title: "RCA & Improvement", crumb: "RCA & Improvement", html: rcaHtml, after: rcaAfter },
  "spare-parts": { title: "Spare Part Master", crumb: "Spare Parts", html: sparePartsHtml, after: sparePartsAfter },
  technicians: { title: "Technician Master", crumb: "Technicians", html: techniciansHtml, after: techniciansAfter },
  reports: { title: "Reports", crumb: "Reports", html: reportsHtml, after: reportsAfter },
  "activity-log": { title: "Activity Log", crumb: "Activity Log", html: activityLogHtml, after: activityLogAfter },
  settings: { title: "Settings", crumb: "Settings", html: settingsHtml, after: settingsAfter }
};

function render(page) {
  const meta = pages[page] || pages.dashboard;
  document.getElementById("page-title").textContent = meta.title;
  document.getElementById("breadcrumb").textContent = meta.crumb;
  document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.page === page));
  try {
    document.getElementById("content").innerHTML = meta.html();
    meta.after();
  } catch (err) {
    console.error(`PMMS: failed to render page "${page}"`, err);
    document.getElementById("content").innerHTML = `
      <div class="card" style="border-color:#f3c8c6;background:#fdeceb">
        <strong>This page couldn't be displayed.</strong>
        <p class="kpi-note" style="margin-top:8px">Something went wrong while loading "${meta.title}". Your data is safe — try another page, or reload the app. If this keeps happening, use Settings → Backup Now, then Reset Database.</p>
      </div>`;
  }
  sessionStorage.setItem("pmms_last_page", page);
  updateLicenseBadge();
  updateCompanyStrip();
}

function updateCompanyStrip() {
  const el = document.getElementById("company-strip");
  if (!el) return;
  const s = DB.settings;
  el.innerHTML = `${s.company_logo ? `<img src="${s.company_logo}" alt="Company logo">` : ""}<span>${esc(s.company_name)}</span>`;
}

function updateLicenseBadge() {
  const badgeEl = document.getElementById("license-badge");
  if (badgeEl) badgeEl.textContent = DB.settings.license_type;
  const chipEl = document.getElementById("user-chip");
  const u = currentUser();
  if (chipEl) chipEl.textContent = u ? `${u.name || u.username} · ${u.role}` : currentRole();
}

document.querySelectorAll(".nav-item").forEach(b =>
  b.addEventListener("click", () => render(b.dataset.page))
);

document.getElementById("user-chip").addEventListener("click", () => {
  confirmDialog("Sign out of PMMS?", () => {
    logout();
    showLogin();
  });
});

/* ---------------------------------------------------------------------------
   LOGIN GATE
   The app shell only ever renders a page after a real, active session
   exists. On a fresh tab (or after logout), the login screen is shown
   instead and the shell stays hidden — so there is no longer a way to
   see any PMMS data without signing in first.
--------------------------------------------------------------------------- */
function showLogin() {
  document.getElementById("app-shell").classList.add("hidden");
  document.getElementById("login-shell").classList.remove("hidden");
  document.getElementById("login-error").innerHTML = "";
  const form = document.getElementById("login-form");
  form.reset();
  document.getElementById("login-username").focus();
}

function showApp() {
  document.getElementById("login-shell").classList.add("hidden");
  document.getElementById("app-shell").classList.remove("hidden");
  const u = currentUser();
  render(sessionStorage.getItem("pmms_last_page") || "dashboard");
  if (u && u.must_change_password) promptPasswordChange(u);
  else if (checkAutoBackup()) toast(`Automatic ${DB.settings.auto_backup} backup completed — check your Downloads folder.`);
}

function promptPasswordChange(u) {
  const overlay = openModal("Set a New Password", `
    <p class="kpi-note" style="margin:0 0 16px">This account is still using a default or migrated password. Set a new one before continuing.</p>
    <div id="pw-change-error"></div>
    <div class="field"><label>New Password (min. 6 characters)</label><input type="password" id="pw-new"></div>
    <div class="field"><label>Confirm New Password</label><input type="password" id="pw-confirm"></div>
    <div class="form-actions"><button class="button primary" id="pw-save">Save Password</button></div>
  `);
  overlay.querySelector(".modal-close").classList.add("hidden");
  overlay.querySelector("#pw-save").addEventListener("click", async () => {
    const a = overlay.querySelector("#pw-new").value;
    const b = overlay.querySelector("#pw-confirm").value;
    const errEl = overlay.querySelector("#pw-change-error");
    if (a !== b) { errEl.innerHTML = `<div class="login-error">Passwords don't match.</div>`; return; }
    const result = await setUserPassword(u.id, a, { self: true });
    if (!result.ok) { errEl.innerHTML = `<div class="login-error">${result.error}</div>`; return; }
    closeModal();
    toast("Password updated.");
    render(sessionStorage.getItem("pmms_last_page") || "dashboard");
  });
}

document.getElementById("login-form").addEventListener("submit", async e => {
  e.preventDefault();
  const username = document.getElementById("login-username").value;
  const password = document.getElementById("login-password").value;
  const submitBtn = document.getElementById("login-submit");
  submitBtn.disabled = true;
  submitBtn.textContent = "Signing in…";
  const result = await authenticate(username, password);
  submitBtn.disabled = false;
  submitBtn.textContent = "Sign In";
  if (!result.ok) {
    document.getElementById("login-error").innerHTML = `<div class="login-error">${result.error}</div>`;
    return;
  }
  showApp();
});

if (currentUser()) showApp(); else showLogin();
