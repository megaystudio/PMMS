/* ===================== SETTINGS ===================== */

function licenseUsageTable() {
  const assets = assetUsage();
  const wos = workOrderMonthUsage();
  const bar = (used, limit) => {
    if (!isFinite(limit)) return `<span class="status green">Unlimited</span>`;
    const pct = Math.min(100, Math.round((used / limit) * 100));
    return `
      <div class="bar-row" style="margin:0">
        <div class="bar-head"><span>${used} / ${limit}</span><span>${pct}%</span></div>
        <div class="bar"><i style="width:${pct}%;background:${pct >= 100 ? "#b33a35" : "#2f3b47"}"></i></div>
      </div>`;
  };
  return `
  <table class="table"><tbody>
    <tr><td style="width:220px"><b>Assets registered</b></td><td>${bar(assets.count, assets.limit)}</td></tr>
    <tr><td><b>Work Orders this month</b></td><td>${bar(wos.count, wos.limit)}</td></tr>
    <tr><td><b>Report export (CSV/Print)</b></td><td>${canExport() ? `<span class="status green">Enabled</span>` : `<span class="status yellow">Disabled — PREMIUM/VIP only</span>`}</td></tr>
    <tr><td><b>Start new RCA case</b></td><td>${canUseRca() ? `<span class="status green">Enabled</span>` : `<span class="status yellow">Disabled — PREMIUM/VIP only (existing cases remain viewable)</span>`}</td></tr>
  </tbody></table>`;
}

function licenseCardHtml() {
  const lic = DB.settings.active_license;
  const type = lic ? licenseType() : "DEMO"; // a non-DEMO type with no license record on file is inconsistent — treat as DEMO rather than crash
  const justExpired = lic && lic.expiry_date && lic.expiry_date < today() && type === "DEMO";
  const editable = can("Settings", "Edit");

  const statusBlock = justExpired ? `
    <div class="notice" style="margin-bottom:14px">Your ${lic.license_type} license (${lic.license_id}) expired on ${fmtDate(lic.expiry_date)} and this installation has reverted to DEMO. Contact your seller for a renewal file.</div>
  ` : type === "DEMO" ? `
    <p class="kpi-note" style="margin-bottom:10px">Running PMMS <b>DEMO</b> — open access with the limits shown in License Usage below. No license file is required to use DEMO.</p>
    <div style="margin-bottom:14px">${licenseUpgradeLinkHtml("dari halaman Settings")}</div>
  ` : `
    <div class="notice" style="background:#eefbf1;border-color:#bfe8cc;color:#1a6b3d;margin-bottom:14px">Running PMMS <b>${type}</b></div>
    <table class="table"><tbody>
      <tr><td style="width:120px"><b>Customer</b></td><td>${lic.customer_name}</td></tr>
      <tr><td><b>License ID</b></td><td>${lic.license_id}</td></tr>
      <tr><td><b>Issued</b></td><td>${fmtDate(lic.issued_date)}</td></tr>
      <tr><td><b>Expires</b></td><td>${lic.expiry_date ? fmtDate(lic.expiry_date) : "Never (VIP)"}</td></tr>
    </tbody></table>
  `;

  return `
  <div class="page-head" style="margin-bottom:10px"><strong>License</strong>${!justExpired ? `<span class="status ${type === "DEMO" ? "yellow" : "green"}">${type}</span>` : ""}</div>
  ${statusBlock}
  ${editable ? `
    <div class="section-title">Import License</div>
    <p class="kpi-note" style="margin-bottom:10px">PREMIUM and VIP require a signed license from your seller — either a file (.pmlic) or a short access code, both carry the exact same signed data. License type can't be changed by simply picking it from a list.</p>
    <label class="button" style="cursor:pointer">⬆ Import License File<input type="file" id="import-license-file" accept=".pmlic,application/json,.json" hidden></label>
    <div class="section-title" style="margin:18px 0 8px">Or Paste Access Code</div>
    <p class="kpi-note" style="margin-bottom:8px">A short text code your seller can send by email or WhatsApp instead of a file attachment.</p>
    <textarea id="license-code-input" rows="2" placeholder="PMMS-LIC-…"></textarea>
    <div class="form-actions" style="justify-content:flex-start;margin-top:10px"><button class="button" id="import-license-code">Apply Access Code</button></div>
    <div id="license-import-result"></div>
    ${type !== "DEMO" ? `<div class="form-actions" style="justify-content:flex-start;margin-top:14px"><button class="button danger" id="remove-license">Remove License (revert to DEMO)</button></div>` : ""}
  ` : `<div class="notice">Your current role (${currentRole()}) cannot manage the license.</div>`}
  `;
}

/* ---------------------------------------------------------------------------
   SESSION & USER MANAGEMENT — replaces the old "Simulate Role" dropdown.
   The role enforced everywhere is now whoever is actually logged in
   (Blueprint §25 groundwork, hardened in Fase 1) — this panel is where
   an Administrator creates accounts and assigns roles instead of anyone
   being able to flip a switch.
--------------------------------------------------------------------------- */
function sessionCardHtml() {
  const u = currentUser();
  return `
  <strong>Signed In As</strong>
  <table class="table" style="margin-top:12px"><tbody>
    <tr><td style="width:120px"><b>Username</b></td><td>${esc(u.username)}</td></tr>
    <tr><td><b>Name</b></td><td>${esc(u.name || u.username)}</td></tr>
    <tr><td><b>Role</b></td><td>${esc(u.role)}</td></tr>
    <tr><td><b>Last Login</b></td><td>${u.last_login ? new Date(u.last_login).toLocaleString() : "—"}</td></tr>
  </tbody></table>
  <div class="form-actions" style="justify-content:flex-start;gap:10px;margin-top:14px">
    <button class="button" id="change-own-password">Change My Password</button>
    <button class="button danger" id="sign-out">Sign Out</button>
  </div>`;
}

function usersCardHtml() {
  const rows = all("users");
  const manage = can("Settings", "Approve");
  return `
  <div class="page-head" style="margin-bottom:4px">
    <strong>User Management</strong>
    ${manage ? `<button class="button primary" id="add-user">+ New User</button>` : ""}
  </div>
  <p class="kpi-note" style="margin:0 0 12px">Administrator and Maintenance Planner are single-seat roles — only one active account may hold each at a time. Technician and Viewer have no limit.</p>
  <div class="table-wrap"><table class="table"><thead><tr><th>Username</th><th>Name</th><th>Role</th><th>Status</th>${manage ? "<th></th>" : ""}</tr></thead><tbody>
  ${rows.map(u => `<tr>
    <td><b>${esc(u.username)}</b></td>
    <td>${esc(u.name || u.username)}</td>
    <td>${manage ? `<select class="inline-select" data-role-for="${u.id}">${APP_ROLES.map(r => option(r, r, u.role)).join("")}</select>` : esc(u.role)}</td>
    <td>${badge(u.active === false ? "Down" : "Running")}</td>
    ${manage ? `<td style="white-space:nowrap">
      <button class="link-btn" data-reset-pw="${u.id}">Reset Password</button>
      &nbsp;·&nbsp;
      <button class="link-btn" data-toggle-active="${u.id}">${u.active === false ? "Activate" : "Deactivate"}</button>
    </td>` : ""}
  </tr>`).join("")}
  ${!rows.length ? `<tr><td colspan="${manage ? 5 : 4}"><div class="empty">No users yet.</div></td></tr>` : ""}
  </tbody></table></div>`;
}

function newUserFormHtml() {
  return `
  <div class="form-grid">
    <div class="field"><label>Username</label><input id="f-username" placeholder="e.g. jdoe"></div>
    <div class="field"><label>Full Name</label><input id="f-name"></div>
    <div class="field"><label>Role</label><select id="f-role">${APP_ROLES.map(r => option(r, r)).join("")}</select></div>
    <div class="field"><label>Password</label><input type="password" id="f-password" placeholder="min. 6 characters"></div>
  </div>
  <div id="new-user-error"></div>
  <div class="form-actions"><button class="button" id="cancel">Cancel</button><button class="button primary" id="save">Create User</button></div>`;
}

function resetPasswordFormHtml(u) {
  return `
  <p class="kpi-note" style="margin:0 0 14px">Setting a new password for <b>${esc(u.username)}</b>. They'll be asked to change it again on their next sign-in.</p>
  <div class="field"><label>New Password (min. 6 characters)</label><input type="password" id="f-newpw"></div>
  <div id="reset-pw-error"></div>
  <div class="form-actions"><button class="button" id="cancel">Cancel</button><button class="button primary" id="save">Set Password</button></div>`;
}

function changeOwnPasswordFormHtml() {
  return `
  <div class="field"><label>Current Password</label><input type="password" id="f-current"></div>
  <div class="field"><label>New Password (min. 6 characters)</label><input type="password" id="f-new"></div>
  <div class="field"><label>Confirm New Password</label><input type="password" id="f-confirm"></div>
  <div id="own-pw-error"></div>
  <div class="form-actions"><button class="button" id="cancel">Cancel</button><button class="button primary" id="save">Save</button></div>`;
}

function settingsHtml() {
  const s = DB.settings;
  const role = currentRole();
  const modules = Object.keys(PERMISSIONS["Administrator"]);
  const actions = ["View", "Create", "Edit", "Delete", "Execute", "Approve", "Export"];

  return `
  <div class="grid two-col">
    <div class="card">
      <strong>Application</strong>
      <div class="form-grid" style="margin-top:15px">
        <div class="field"><label>Application</label><input value="PMMS" readonly></div>
        <div class="field"><label>Version</label><input value="Build 15 (Fase 5)" readonly></div>
        <div class="field"><label>Mode</label><input value="Offline" readonly></div>
        <div class="field"><label>Database</label><input value="Local (browser storage — will map 1:1 to SQLite in the desktop build)" readonly></div>
        <div class="field"><label>Company Name</label><input id="f-company" value="${esc(s.company_name)}" ${can("Settings", "Edit") ? "" : "disabled"}></div>
        <div class="field">
          <label>Company Logo (optional)</label>
          ${s.company_logo ? `<div style="margin-bottom:8px"><img src="${s.company_logo}" alt="Company logo" style="max-height:40px;max-width:160px;display:block"></div>` : ""}
          ${can("Settings", "Edit") ? `
            <label class="button" style="cursor:pointer;display:inline-block">⬆ ${s.company_logo ? "Replace Logo" : "Upload Logo"}<input type="file" id="f-logo" accept="image/png,image/jpeg,image/svg+xml" hidden></label>
            ${s.company_logo ? ` <button class="button" id="remove-logo" type="button">Remove</button>` : ""}
          ` : ""}
        </div>
      </div>
      <p class="kpi-note" style="margin:10px 0 0">Shown next to the page title on every screen, and on the letterhead of every printed/exported Report.</p>
      ${can("Settings", "Edit") ? `<div class="form-actions"><button class="button primary" id="save-settings">Save</button></div>` : `<div class="notice" style="margin-top:14px">Your current role (${role}) can view settings but not change them.</div>`}
    </div>

    <div class="card">
      ${licenseCardHtml()}
    </div>
  </div>

  <div class="grid two-col" style="margin-top:16px">
    <div class="card">
      ${sessionCardHtml()}
    </div>
    <div class="card">
      ${usersCardHtml()}
    </div>
  </div>

  <div class="card" style="margin-top:16px">
    <div class="page-head" style="margin-bottom:10px"><strong>License Usage — Blueprint §31</strong><span class="status ${licenseType() === "DEMO" ? "yellow" : "green"}">${licenseType()}</span></div>
    <p class="kpi-note" style="margin-bottom:14px">This is separate from the role above: the role governs what an operator can do, this governs what the product tier allows regardless of role — even an Administrator hits these caps on a DEMO license.</p>
    ${licenseUsageTable()}
  </div>

  <div class="card" style="margin-top:16px">
    <strong>Role Permission Matrix</strong>
    <p class="kpi-note" style="margin:8px 0 14px">Highlighted cells are allowed for your current role (${role}).</p>
    <div class="table-wrap"><table class="table matrix-table">
      <thead><tr><th>Module</th>${actions.map(a => `<th>${a}</th>`).join("")}</tr></thead>
      <tbody>
      ${modules.map(m => `<tr>
        <td><b>${m}</b></td>
        ${actions.map(a => `<td class="${can(m, a) ? "perm-yes" : "perm-no"}">${(PERMISSIONS[role][m] || []).includes(a) ? "✓" : "—"}</td>`).join("")}
      </tr>`).join("")}
      </tbody>
    </table></div>
  </div>

  <div class="grid two-col" style="margin-top:16px">
    <div class="card">
      <strong>Backup &amp; Restore</strong>
      <p class="kpi-note" style="margin:10px 0 16px">Because PMMS runs fully offline, backup is a critical feature (Blueprint §26). A backup is a complete JSON snapshot of every table — master and transaction — that can be restored on any machine.</p>
      ${can("Settings", "Approve") ? `
      <div class="form-actions" style="justify-content:flex-start;gap:12px">
        <button class="button primary" id="backup-now">⬇ Backup Now</button>
        <label class="button" style="cursor:pointer">⬆ Restore from File<input type="file" id="restore-file" accept="application/json" hidden></label>
      </div>
      <div class="section-title">Automatic Backup</div>
      <div class="field" style="max-width:220px"><label>Frequency</label>
        <select id="f-auto-backup">
          ${option("off", "Off", DB.settings.auto_backup)}
          ${option("daily", "Daily", DB.settings.auto_backup)}
          ${option("weekly", "Weekly", DB.settings.auto_backup)}
        </select>
      </div>
      <p class="kpi-note" style="margin:8px 0 0">Checked once each time someone signs in: if the interval has passed since the last automatic backup, a file downloads on its own — no button click needed. This can't run while the app isn't open (a plain webpage has no background scheduler), so it means "on first sign-in after the interval elapses," not a fixed clock time.</p>
      <p class="kpi-note" style="margin:6px 0 0">Last automatic backup: ${DB.settings.last_auto_backup ? new Date(DB.settings.last_auto_backup).toLocaleString() : "never"}</p>
      <div class="section-title">Recent Backups</div>
      ${DB.backups.length ? `<table class="table"><tbody>${DB.backups.slice(0, 5).map(b => `<tr><td>${esc(b.filename)}${b.auto ? ` <span class="status gray">auto</span>` : ""}</td><td>${new Date(b.created_at).toLocaleString()}</td></tr>`).join("")}</tbody></table>` : `<div class="empty">No backup taken yet in this session.</div>`}
      ` : `<div class="notice">Your current role (${role}) does not have Backup/Restore permission.</div>`}
    </div>
  </div>

  ${can("Settings", "Approve") ? `
  <div class="card" style="margin-top:16px">
    <strong>Danger Zone</strong>
    <p class="kpi-note" style="margin:10px 0 16px">Reset erases all local data and reloads the Build 10 demo dataset. Take a backup first.</p>
    <button class="button danger" id="reset-db">Reset Database</button>
    <p class="kpi-note" style="margin:16px 0 10px">Loading your own dataset via CSV import? Use this instead of Reset — it clears all demo assets, tasks, plans, Work Orders, breakdowns, and RCA cases (keeping the standard Maintenance Type and Frequency lookups every import matches against), so your imported data is the only business data in the system.</p>
    <button class="button danger" id="start-empty">Start Empty (No Demo Data)</button>
  </div>` : ""}
  `;
}

function settingsAfter() {
  const saveBtn = document.getElementById("save-settings");
  if (saveBtn) saveBtn.addEventListener("click", () => {
    DB.settings.company_name = document.getElementById("f-company").value.trim();
    save();
    toast("Settings saved.");
    render("settings");
  });

  const logoInput = document.getElementById("f-logo");
  if (logoInput) logoInput.addEventListener("change", () => {
    const file = logoInput.files[0];
    if (!file) return;
    if (file.size > 500 * 1024) { toast("Please use a logo image under 500 KB.", "error"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      DB.settings.company_logo = reader.result;
      save();
      toast("Logo updated.");
      render("settings");
    };
    reader.onerror = () => toast("Could not read that image.", "error");
    reader.readAsDataURL(file);
  });
  const removeLogoBtn = document.getElementById("remove-logo");
  if (removeLogoBtn) removeLogoBtn.addEventListener("click", () => {
    DB.settings.company_logo = null;
    save();
    toast("Logo removed.");
    render("settings");
  });

  document.getElementById("sign-out").addEventListener("click", () => {
    confirmDialog("Sign out of PMMS?", () => {
      logout();
      showLogin();
    });
  });

  document.getElementById("change-own-password").addEventListener("click", () => {
    const overlay = openModal("Change My Password", changeOwnPasswordFormHtml());
    overlay.querySelector("#cancel").addEventListener("click", closeModal);
    overlay.querySelector("#save").addEventListener("click", async () => {
      const current = overlay.querySelector("#f-current").value;
      const a = overlay.querySelector("#f-new").value;
      const b = overlay.querySelector("#f-confirm").value;
      const errEl = overlay.querySelector("#own-pw-error");
      const u = currentUser();
      const check = await authenticate(u.username, current);
      if (!check.ok) { errEl.innerHTML = `<div class="login-error">Current password is incorrect.</div>`; return; }
      if (a !== b) { errEl.innerHTML = `<div class="login-error">New passwords don't match.</div>`; return; }
      const result = await setUserPassword(u.id, a, { self: true });
      if (!result.ok) { errEl.innerHTML = `<div class="login-error">${result.error}</div>`; return; }
      closeModal();
      toast("Password updated.");
    });
  });

  const addUserBtn = document.getElementById("add-user");
  if (addUserBtn) addUserBtn.addEventListener("click", () => {
    const overlay = openModal("New User", newUserFormHtml());
    overlay.querySelector("#cancel").addEventListener("click", closeModal);
    overlay.querySelector("#save").addEventListener("click", async () => {
      const result = await createUser({
        username: overlay.querySelector("#f-username").value,
        name: overlay.querySelector("#f-name").value,
        role: overlay.querySelector("#f-role").value,
        password: overlay.querySelector("#f-password").value
      });
      const errEl = overlay.querySelector("#new-user-error");
      if (!result.ok) { errEl.innerHTML = `<div class="login-error">${result.error}</div>`; return; }
      closeModal();
      toast("User created.");
      render("settings");
    });
  });

  document.querySelectorAll("[data-role-for]").forEach(sel => sel.addEventListener("change", () => {
    const result = setUserRole(sel.dataset.roleFor, sel.value);
    if (!result.ok) { toast(result.error, "error"); render("settings"); return; }
    toast("Role updated.");
    render("settings");
  }));

  document.querySelectorAll("[data-toggle-active]").forEach(b => b.addEventListener("click", () => {
    const u = find("users", b.dataset.toggleActive);
    const nextActive = u.active === false;
    confirmDialog(`${nextActive ? "Activate" : "Deactivate"} ${u.username}?`, () => {
      const result = setUserActive(u.id, nextActive);
      if (!result.ok) { toast(result.error, "error"); return; }
      toast(nextActive ? "User activated." : "User deactivated.");
      render("settings");
    });
  }));

  document.querySelectorAll("[data-reset-pw]").forEach(b => b.addEventListener("click", () => {
    const u = find("users", b.dataset.resetPw);
    const overlay = openModal("Reset Password", resetPasswordFormHtml(u));
    overlay.querySelector("#cancel").addEventListener("click", closeModal);
    overlay.querySelector("#save").addEventListener("click", async () => {
      const result = await setUserPassword(u.id, overlay.querySelector("#f-newpw").value);
      const errEl = overlay.querySelector("#reset-pw-error");
      if (!result.ok) { errEl.innerHTML = `<div class="login-error">${result.error}</div>`; return; }
      closeModal();
      toast("Password reset.");
    });
  }));

  const importLicenseInput = document.getElementById("import-license-file");
  if (importLicenseInput) importLicenseInput.addEventListener("change", () => {
    const file = importLicenseInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const result = await importLicenseFile(reader.result);
      const resultEl = document.getElementById("license-import-result");
      if (!result.ok) {
        if (resultEl) resultEl.innerHTML = `<div class="notice" style="margin-top:10px;background:#fdeceb;border-color:#f3c8c6;color:#8a2d29">${result.error}</div>`;
        toast(result.error, "error");
        return;
      }
      toast(`Running PMMS ${result.license.license_type}.`);
      render("settings");
    };
    reader.onerror = () => toast("Could not read that file.", "error");
    reader.readAsText(file);
  });

  const importCodeBtn = document.getElementById("import-license-code");
  if (importCodeBtn) importCodeBtn.addEventListener("click", async () => {
    const codeText = document.getElementById("license-code-input").value;
    const result = await importLicenseCode(codeText);
    const resultEl = document.getElementById("license-import-result");
    if (!result.ok) {
      if (resultEl) resultEl.innerHTML = `<div class="notice" style="margin-top:10px;background:#fdeceb;border-color:#f3c8c6;color:#8a2d29">${result.error}</div>`;
      toast(result.error, "error");
      return;
    }
    toast(`Running PMMS ${result.license.license_type}.`);
    render("settings");
  });

  const removeLicenseBtn = document.getElementById("remove-license");
  if (removeLicenseBtn) removeLicenseBtn.addEventListener("click", () => {
    confirmDialog("Remove the current license and revert this installation to DEMO?", () => {
      removeLicense();
      toast("License removed. Running PMMS DEMO.");
      render("settings");
    });
  });

  const backupBtn = document.getElementById("backup-now");
  if (backupBtn) backupBtn.addEventListener("click", () => {
    backupToFile();
    toast("Backup file downloaded.");
    render("settings");
  });
  const autoBackupSel = document.getElementById("f-auto-backup");
  if (autoBackupSel) autoBackupSel.addEventListener("change", () => {
    if (!can("Settings", "Approve")) { toast("Your current role can't change this.", "error"); render("settings"); return; }
    DB.settings.auto_backup = autoBackupSel.value;
    save();
    toast(autoBackupSel.value === "off" ? "Automatic backup turned off." : `Automatic backup set to ${autoBackupSel.value}.`);
    render("settings");
  });
  const restoreInput = document.getElementById("restore-file");
  if (restoreInput) restoreInput.addEventListener("change", e => {
    const file = e.target.files[0];
    if (!file) return;
    restoreFromFile(file, err => {
      if (err) { toast("Restore failed: " + err.message, "error"); return; }
      toast("Database restored.");
      if (currentUser()) render("dashboard"); else { toast("Please sign in again."); showLogin(); }
    });
  });
  const resetBtn = document.getElementById("reset-db");
  if (resetBtn) resetBtn.addEventListener("click", () => {
    confirmDialog("This will erase all current local data. Continue?", () => {
      resetDatabase();
      toast("Database reset to demo data. Please sign in again.");
      showLogin();
    });
  });
  const startEmptyBtn = document.getElementById("start-empty");
  if (startEmptyBtn) startEmptyBtn.addEventListener("click", () => {
    confirmDialog("This will erase all current data (including any demo assets, PM history, breakdowns, and RCA cases) and start with just the standard Maintenance Type/Frequency lookups — nothing else reseeded. Make sure you've backed up anything you need first. Continue?", () => {
      startEmpty();
      toast("Database cleared. Please sign in again.");
      showLogin();
    });
  });
}
