/* ============================================================================
   PMMS DATA LAYER (Build 02)
   ----------------------------------------------------------------------------
   V1 runs 100% offline in the browser using localStorage as the persistence
   engine. The table names and relationships below are a direct mirror of
   Blueprint section 23 (DATABASE CORE) and section 24 (DATA RELATIONSHIP),
   so this layer can be swapped for a real local SQLite engine (Electron /
   Tauri + better-sqlite3) later WITHOUT changing any page code — every page
   only talks to the DB through the functions in this file.
   ============================================================================ */

const DB_KEY = "pmms_db_v1";
const SCHEMA_VERSION = 1;

const EMPTY_DB = () => ({
  version: SCHEMA_VERSION,

  // ---------------- MASTER ----------------
  plants: [],
  areas: [],
  production_lines: [],
  assets: [],
  components: [],
  maintenance_types: [],
  frequencies: [],
  pm_tasks: [],
  pm_plans: [],
  spare_parts: [],
  technicians: [],
  users: [],

  // ---------------- TRANSACTION ----------------
  pm_schedules: [],
  schedule_reschedules: [],
  work_orders: [],
  pm_executions: [],
  inspection_results: [],
  abnormalities: [],
  breakdowns: [],
  corrective_actions: [],
  rca_cases: [],
  rca_5why: [],
  rca_fishbone: [],
  rca_fmea: [],
  spare_part_usage: [],
  manpower_usage: [],
  maintenance_costs: [],

  // ---------------- SYSTEM ----------------
  settings: {
    app_name: "PMMS",
    company_name: "Your Manufacturing Plant",
    company_logo: null,
    license_type: "DEMO", // DEMO | PREMIUM | VIP — derived from active_license, never set freely
    active_license: null, // the imported, signature-verified license file, or null on DEMO
    auto_backup: "off", // off | daily | weekly
    last_auto_backup: null,
    current_user_id: 1,
    current_role: "Administrator"
  },
  audit_logs: [],
  backups: [],

  // ---------------- COUNTERS ----------------
  _seq: {}
});

let DB = null;

function nextId(table) {
  DB._seq[table] = (DB._seq[table] || 0) + 1;
  return DB._seq[table];
}

function log(action, detail) {
  DB.audit_logs.unshift({
    id: nextId("audit_logs"),
    timestamp: new Date().toISOString(),
    action,
    detail
  });
  if (DB.audit_logs.length > 500) DB.audit_logs.length = 500;
}

function save() {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(DB));
  } catch (e) {
    // Most commonly a full local storage quota. Previously this failed
    // completely silently — the user would keep working, believing their
    // change was saved, until a reload wiped it out. Surface it instead.
    console.error("PMMS: failed to save to local storage.", e);
    if (typeof toast === "function") {
      toast("Warning: your last change may not have been saved — local storage may be full. Please back up your data now (Settings → Backup Now).", "error");
    }
  }
}

function load() {
  const raw = localStorage.getItem(DB_KEY);
  if (raw) {
    try {
      const stored = JSON.parse(raw);
      // Backfill any table/setting introduced in a later build than the one
      // that last saved this browser's data — without this, a table like
      // rca_cases could be `undefined` for a browser that saved before RCA
      // existed, and any page reading it would throw and silently fail to
      // render (leaving the previous page on screen).
      const blank = EMPTY_DB();
      DB = { ...blank, ...stored };
      DB.settings = { ...blank.settings, ...(stored.settings || {}) };
      Object.keys(blank).forEach(key => {
        if (Array.isArray(blank[key]) && !Array.isArray(DB[key])) DB[key] = [];
      });
      // Migrate a browser that saved before real login existed (Build 10
      // and earlier): its users had no password at all. Give each such
      // account the same default password as a fresh install and force a
      // change at first login, rather than leaving them impossible to
      // log into or, worse, defaulting to no password check at all.
      DB.users.forEach(u => {
        if (!u.password_hash) {
          u.password_salt = "246b66e38b5ab623576a18dca296cb7b";
          u.password_hash = "aeea13d0197899a0b894a929d56734ce05c104bc10428384b9a7d8ef6ca29ad2";
          u.must_change_password = true;
          if (u.active === undefined) u.active = true;
        }
      });
      if (!DB.users.length) {
        // A pre-login database with an empty/missing users table would
        // otherwise have no way to log in at all — add just the default
        // admin account (not seedReferenceData(), which would duplicate
        // this database's existing plants/areas/lookups).
        DB.users.push({
          id: nextId("users"), username: "admin", name: "Administrator", role: "Administrator",
          active: true, password_salt: "246b66e38b5ab623576a18dca296cb7b",
          password_hash: "aeea13d0197899a0b894a929d56734ce05c104bc10428384b9a7d8ef6ca29ad2",
          must_change_password: true, created_at: new Date().toISOString(), last_login: null
        });
      }
      save();
      reviewLicenseExpiry();
      return;
    } catch (e) {
      console.warn("PMMS: stored database was corrupted, reinitializing.", e);
    }
  }
  DB = EMPTY_DB();
  seed();
  save();
}

/* ---------------------------------------------------------------------------
   GENERIC CRUD
   Every master/transaction table follows the same shape: array of objects
   with an `id`. These helpers keep every page's code identical regardless
   of which table it touches, and centralize save()+audit logging.
--------------------------------------------------------------------------- */
function all(table) {
  return DB[table];
}
function find(table, id) {
  return DB[table].find(r => r.id === Number(id));
}
function insert(table, record) {
  const row = { id: nextId(table), ...record };
  DB[table].push(row);
  log("CREATE", `${table}#${row.id}`);
  save();
  return row;
}
function update(table, id, patch) {
  const row = find(table, id);
  if (!row) return null;
  Object.assign(row, patch);
  log("UPDATE", `${table}#${id}`);
  save();
  return row;
}
function remove(table, id) {
  const idx = DB[table].findIndex(r => r.id === Number(id));
  if (idx === -1) return false;
  DB[table].splice(idx, 1);
  log("DELETE", `${table}#${id}`);
  save();
  return true;
}

/* ---------------------------------------------------------------------------
   DOMAIN HELPERS
--------------------------------------------------------------------------- */
function assetLabel(assetId) {
  const a = find("assets", assetId);
  return a ? `${a.code} — ${a.name}` : "—"; // assetLabel() output is later escaped by esc() at each render call site alongside other free text
}
function techName(id) {
  const t = find("technicians", id);
  return t ? t.name : "Unassigned";
}
function freqDays(id) {
  const f = find("frequencies", id);
  return f ? f.days : 0;
}
function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + Number(days));
  return d.toISOString().slice(0, 10);
}
function today() {
  return new Date().toISOString().slice(0, 10);
}
function genWoNo() {
  const year = new Date().getFullYear();
  const seqVal = nextId("wo_no_seq");
  return `WO-${year}-${String(seqVal).padStart(6, "0")}`;
}

/* ---------------------------------------------------------------------------
   SCHEDULER — Blueprint section 10 (PM SCHEDULER)
   Generates pm_schedules rows for every ACTIVE pm_plan whose next due date
   falls within the requested horizon. Each generation call advances the
   plan's last_generated date so schedules are never duplicated.
--------------------------------------------------------------------------- */
function generateSchedule(horizonDays = 30) {
  const plans = DB.pm_plans.filter(p => p.active);
  const horizon = addDays(today(), horizonDays);
  let created = 0;

  plans.forEach(plan => {
    let cursor = plan.last_generated || plan.start_date;
    const days = freqDays(plan.frequency_id) || 30;
    // walk forward from the last generated date, creating one schedule
    // per due occurrence, until we pass the horizon
    let nextDue = plan.last_generated ? addDays(cursor, days) : plan.start_date;

    while (nextDue <= horizon) {
      const exists = DB.pm_schedules.some(
        s => s.pm_plan_id === plan.id && s.due_date === nextDue
      );
      if (!exists) {
        insertScheduleRow(plan, nextDue);
        created++;
      }
      plan.last_generated = nextDue;
      nextDue = addDays(nextDue, days);
    }
  });

  refreshOverdueStatuses();
  save();
  return created;
}

function insertScheduleRow(plan, dueDate) {
  DB.pm_schedules.push({
    id: nextId("pm_schedules"),
    pm_plan_id: plan.id,
    asset_id: plan.asset_id,
    pm_task_id: plan.pm_task_id,
    due_date: dueDate,
    status: "Planned"
  });
}

function refreshOverdueStatuses() {
  const t = today();
  DB.pm_schedules.forEach(s => {
    if ((s.status === "Planned" || s.status === "Due") && s.due_date < t) {
      s.status = "Overdue";
    } else if (s.status === "Planned" && s.due_date === t) {
      s.status = "Due";
    }
  });
}

function rescheduleSchedule(scheduleId, newDate, reason) {
  const sched = find("pm_schedules", scheduleId);
  if (!sched) return null;
  const fromDate = sched.due_date;
  insert("schedule_reschedules", {
    pm_schedule_id: scheduleId,
    asset_id: sched.asset_id,
    from_date: fromDate,
    to_date: newDate,
    reason: reason || "",
    created_at: today()
  });
  sched.due_date = newDate;
  sched.status = newDate < today() ? "Overdue" : (newDate === today() ? "Due" : "Planned");
  sched.rescheduled = true;
  save();
  return sched;
}

/* ---------------------------------------------------------------------------
   WORK ORDER CREATION — from a schedule row, or ad-hoc
--------------------------------------------------------------------------- */
function createWorkOrderFromSchedule(scheduleId, technicianId, priority) {
  if (!can("Work Order", "Create")) return denyModuleAccess("Work Order", "Create");
  const sched = find("pm_schedules", scheduleId);
  if (!sched) return null;
  const wo = insert("work_orders", {
    wo_no: genWoNo(),
    pm_schedule_id: sched.id,
    asset_id: sched.asset_id,
    pm_task_id: sched.pm_task_id,
    type: "Preventive",
    scheduled_date: sched.due_date,
    technician_id: technicianId || null,
    priority: priority || "Medium",
    status: "Open",
    created_at: sched.due_date
  });
  sched.status = "In Progress";
  save();
  return wo;
}

function createAdHocWorkOrder(data) {
  if (!can("Work Order", "Create")) return denyModuleAccess("Work Order", "Create");
  return insert("work_orders", {
    wo_no: genWoNo(),
    pm_schedule_id: null,
    asset_id: data.asset_id,
    pm_task_id: data.pm_task_id || null,
    type: data.type || "Corrective",
    scheduled_date: data.scheduled_date || today(),
    technician_id: data.technician_id || null,
    priority: data.priority || "Medium",
    status: "Open",
    created_at: today()
  });
}

/* ---------------------------------------------------------------------------
   PM EXECUTION — Blueprint section 12 & 13
   Submits the checklist, closes the work order, and — if any checklist
   item or measurement is Abnormal — automatically opens an Abnormality
   record so findings never dead-end at the checklist (section 13).
--------------------------------------------------------------------------- */
function submitExecution(workOrderId, payload) {
  if (!can("Work Order", "Execute")) return denyModuleAccess("Work Order", "Execute");
  return _submitExecutionRaw(workOrderId, payload);
}
// Unguarded core, reused by importPmRecordsFromCSV() and seedDemoHistory():
// both already run under their own appropriate permission check (the
// importer's own top-of-function "Work Order":"Create" gate is the right
// check for a bulk historical-data load — the person doing the import
// isn't required to also hold "Execute", the permission for a technician
// running a live checklist right now, which is a different action).
function _submitExecutionRaw(workOrderId, payload) {
  const wo = find("work_orders", workOrderId);
  if (!wo) return null;

  const exec = insert("pm_executions", {
    work_order_id: workOrderId,
    date: payload.date || today(),
    start_time: payload.start_time,
    end_time: payload.end_time,
    technician_id: payload.technician_id,
    checklist: payload.checklist, // [{task, result, note}]
    overall_result: payload.checklist.some(c => c.result === "Abnormal")
      ? "Abnormal"
      : "Normal",
    notes: payload.notes || ""
  });

  (payload.spareUsage || []).forEach(su => {
    insert("spare_part_usage", {
      work_order_id: workOrderId,
      spare_part_id: su.spare_part_id,
      qty: su.qty,
      cost: su.cost
    });
    insert("maintenance_costs", {
      work_order_id: workOrderId,
      type: "Spare Part",
      amount: su.cost,
      date: payload.date || today()
    });
  });

  if (payload.technician_id && payload.man_hours) {
    insert("manpower_usage", {
      work_order_id: workOrderId,
      technician_id: payload.technician_id,
      hours: payload.man_hours
    });
  }

  let abnormality = null;
  if (exec.overall_result === "Abnormal") {
    abnormality = insert("abnormalities", {
      work_order_id: workOrderId,
      asset_id: wo.asset_id,
      finding: payload.finding || "See checklist notes",
      severity: payload.severity || "Medium",
      action: payload.action || "",
      status: "Open",
      created_at: payload.date || today()
    });
  }

  update("work_orders", workOrderId, { status: "Completed" });
  if (wo.pm_schedule_id) {
    update("pm_schedules", wo.pm_schedule_id, { status: "Completed" });
  }

  return { exec, abnormality };
}

function closeWorkOrder(workOrderId) {
  if (!can("Work Order", "Approve")) return denyModuleAccess("Work Order", "Approve");
  return _closeWorkOrderRaw(workOrderId);
}
function _closeWorkOrderRaw(workOrderId) {
  return update("work_orders", workOrderId, { status: "Closed" });
}

/* ---------------------------------------------------------------------------
   KPI ENGINE — Blueprint section 19
   Every KPI is computed live from transaction tables — never stored —
   so it is always consistent with the underlying data, per the blueprint's
   explicit rule that "KPI harus dihitung dari transaction data, bukan
   input manual."
--------------------------------------------------------------------------- */
/* ---------------------------------------------------------------------------
   ACTUAL OPERATING HOURS — Catatan Perbaikan 9, poin #11
   Replaces the old flat "every asset runs 24h/day, always" assumption.
   Each asset now has its own Operating Hours/Day (asset.operating_hours_per_day,
   default 24 for continuous-run equipment — set it lower to reflect an
   8h or 16h shift pattern), and its current status weights that number:
   Running counts in full, Standby at half (it's powered but not
   producing), Down at zero.

   Honest limit: PMMS V1 has no historical status timeline, so this
   applies each asset's CURRENT status across the whole requested period
   — an asset that was Down for half of last month and is Running today
   is counted as fully Running for that entire past period. That's a
   real improvement over the old calculation (which counted a
   permanently-Down asset as running 24/7 forever), but it is still an
   approximation, not a minute-by-minute log. A precise fix needs an
   asset status history feature, which is bigger than this phase.
--------------------------------------------------------------------------- */
const ASSET_STATUS_UPTIME_FACTOR = { Running: 1, Standby: 0.5, Down: 0 };
function fleetOperatingHours(periodDays) {
  return DB.assets.reduce((sum, a) => {
    const factor = ASSET_STATUS_UPTIME_FACTOR[a.status] ?? 1;
    const hoursPerDay = Number(a.operating_hours_per_day) || 24;
    return sum + factor * hoursPerDay * periodDays;
  }, 0);
}

function kpi(periodDays = 30) {
  const cutoff = addDays(today(), -periodDays);
  const schedulesInPeriod = DB.pm_schedules.filter(s => s.due_date >= cutoff);

  const planned = schedulesInPeriod.length;
  const completed = schedulesInPeriod.filter(s => s.status === "Completed").length;
  const overdue = DB.pm_schedules.filter(s => s.status === "Overdue").length;
  const due = DB.pm_schedules.filter(s => s.status === "Due").length;

  const pmCompliance = planned ? Math.round((completed / planned) * 100) : null;

  const onTime = schedulesInPeriod.filter(s => {
    if (s.status !== "Completed") return false;
    const wo = DB.work_orders.find(w => w.pm_schedule_id === s.id);
    return wo && wo.scheduled_date >= s.due_date;
  }).length;
  const scheduleCompliance = planned ? Math.round((onTime / planned) * 100) : null;

  const breakdownsInPeriod = DB.breakdowns.filter(b => b.date >= cutoff);
  const breakdownCount = breakdownsInPeriod.length;
  const breakdownHours = breakdownsInPeriod.reduce(
    (s, b) => s + Number(b.downtime_hours || 0), 0
  );

  // Actual Operating Hours — Catatan Perbaikan 9, poin #11. Previously
  // assumed every asset ran 24h/day regardless of status; now each
  // asset's own Operating Hours/Day setting is used, and a Down asset
  // contributes 0 hours while Standby counts at half (see
  // fleetOperatingHours() for the full explanation and its limits).
  const operatingHours = fleetOperatingHours(periodDays);
  const mtbf = breakdownCount ? Math.round(operatingHours / breakdownCount) : null;
  const totalRepairHours = breakdownsInPeriod.reduce(
    (s, b) => s + Number(b.repair_duration || 0), 0
  );
  const mttr = breakdownCount ? +(totalRepairHours / breakdownCount).toFixed(1) : null;
  const availability = operatingHours
    ? +(((operatingHours - breakdownHours) / operatingHours) * 100).toFixed(1)
    : null;

  const costInPeriod = DB.maintenance_costs
    .filter(c => c.date >= cutoff)
    .reduce((s, c) => s + Number(c.amount || 0), 0);

  const openAbnormal = DB.abnormalities.filter(a => a.status !== "Closed").length;
  const criticalAbnormal = DB.abnormalities.filter(
    a => a.status !== "Closed" && a.severity === "High"
  ).length;

  return {
    planned, completed, overdue, due,
    pmCompliance, scheduleCompliance,
    breakdownCount, breakdownHours,
    mtbf, mttr, availability,
    costInPeriod,
    openAbnormal, criticalAbnormal
  };
}

function equipmentHistory(assetId) {
  const id = Number(assetId);
  const pmHistory = DB.work_orders
    .filter(w => w.asset_id === id && (w.status === "Completed" || w.status === "Closed"))
    .map(w => ({ wo: w, exec: DB.pm_executions.find(e => e.work_order_id === w.id) }))
    .sort((a, b) => (b.wo.scheduled_date || "").localeCompare(a.wo.scheduled_date || ""));

  const breakdownHistory = DB.breakdowns
    .filter(b => b.asset_id === id)
    .sort((a, b) => b.date.localeCompare(a.date));

  const correctiveHistory = DB.abnormalities
    .filter(a => a.asset_id === id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  const spareUsage = DB.spare_part_usage.filter(su => {
    const wo = DB.work_orders.find(w => w.id === su.work_order_id);
    return wo && wo.asset_id === id;
  });

  return { pmHistory, breakdownHistory, correctiveHistory, spareUsage };
}

/* ---------------------------------------------------------------------------
   CORRECTIVE ACTION — formalizes Blueprint section 13's flow:
   Abnormal Finding -> Corrective Action -> Work Order -> Repair ->
   Verification -> Closed. A corrective_actions row plus a real Work Order
   are created together, so "Corrective Action" is never just a status label.
--------------------------------------------------------------------------- */
function createCorrectiveWorkOrder(abnormalityId, technicianId, priority) {
  if (!can("Abnormality", "Approve")) return denyModuleAccess("Abnormality", "Approve");
  const ab = find("abnormalities", abnormalityId);
  if (!ab) return null;

  const wo = createAdHocWorkOrder({
    asset_id: ab.asset_id,
    type: "Corrective",
    scheduled_date: today(),
    technician_id: technicianId,
    priority: priority || "High"
  });

  const ca = insert("corrective_actions", {
    abnormality_id: abnormalityId,
    work_order_id: wo.id,
    action: ab.action || "",
    status: "Open",
    closed_at: null
  });

  update("abnormalities", abnormalityId, { status: "Corrective Action", corrective_action_id: ca.id });
  return { wo, ca };
}

function correctiveActionFor(abnormalityId) {
  return DB.corrective_actions.find(c => c.abnormality_id === abnormalityId);
}

function progressAbnormality(abnormalityId, note) {
  if (!can("Abnormality", "Approve")) {
    log("ACCESS_DENIED", `Approve on Abnormality denied for role ${currentRole()}`);
    save();
    return { ok: false, error: "Your current role can't do that." };
  }
  const ab = find("abnormalities", abnormalityId);
  if (!ab) return { ok: false, error: "Not found." };
  const ca = correctiveActionFor(abnormalityId);

  if (ab.status === "Corrective Action") {
    if (!ca) return { ok: false, error: "No corrective Work Order has been created yet." };
    const wo = find("work_orders", ca.work_order_id);
    if (!wo || (wo.status !== "Completed" && wo.status !== "Closed")) {
      return { ok: false, error: "The corrective Work Order must be completed by the technician first." };
    }
    update("abnormalities", abnormalityId, { status: "Repair" });
    return { ok: true };
  }
  if (ab.status === "Repair") {
    if (!note || !note.trim()) return { ok: false, error: "A verification note is required." };
    update("abnormalities", abnormalityId, { status: "Verification", verification_note: note.trim() });
    return { ok: true };
  }
  if (ab.status === "Verification") {
    update("abnormalities", abnormalityId, { status: "Closed" });
    if (ca) update("corrective_actions", ca.id, { status: "Closed", closed_at: today() });
    return { ok: true };
  }
  return { ok: false, error: "This finding is already closed." };
}

/* ---------------------------------------------------------------------------
   REPORTING HELPERS — Blueprint section 22 (REPORTING)
--------------------------------------------------------------------------- */
function toCSV(rows, columns) {
  const header = columns.map(c => `"${c.label.replace(/"/g, '""')}"`).join(",");
  const body = rows.map(r =>
    columns.map(c => {
      const v = typeof c.value === "function" ? c.value(r) : r[c.value];
      return `"${String(v ?? "").replace(/"/g, '""')}"`;
    }).join(",")
  ).join("\n");
  return header + "\n" + body;
}

function downloadCSV(filename, csvText) {
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function technicianWorkload(periodDays = 30) {
  const cutoff = addDays(today(), -periodDays);
  return DB.technicians.map(t => {
    const usage = DB.manpower_usage.filter(m => {
      if (m.technician_id !== t.id) return false;
      const wo = DB.work_orders.find(w => w.id === m.work_order_id);
      return wo && wo.created_at >= cutoff;
    });
    const woCount = new Set(usage.map(u => u.work_order_id)).size;
    const hours = usage.reduce((s, u) => s + Number(u.hours || 0), 0);
    return { technician: t, workOrders: woCount, hours: +hours.toFixed(1) };
  });
}

function costByEquipment(periodDays = 30) {
  const cutoff = addDays(today(), -periodDays);
  const map = {};
  DB.maintenance_costs.filter(c => c.date >= cutoff).forEach(c => {
    let assetId = null;
    if (c.work_order_id) {
      const wo = DB.work_orders.find(w => w.id === c.work_order_id);
      if (wo) assetId = wo.asset_id;
    } else if (c.breakdown_id) {
      const bd = DB.breakdowns.find(b => b.id === c.breakdown_id);
      if (bd) assetId = bd.asset_id;
    }
    if (assetId === null) return;
    map[assetId] = (map[assetId] || 0) + Number(c.amount || 0);
  });
  return Object.entries(map).map(([assetId, total]) => ({
    asset_id: Number(assetId), total
  })).sort((a, b) => b.total - a.total);
}

function costByType(periodDays = 30) {
  const cutoff = addDays(today(), -periodDays);
  const map = {};
  DB.maintenance_costs.filter(c => c.date >= cutoff).forEach(c => {
    map[c.type] = (map[c.type] || 0) + Number(c.amount || 0);
  });
  return Object.entries(map).map(([type, total]) => ({ type, total }));
}

/* ---------------------------------------------------------------------------
   ANALYTICS — Blueprint section 20
   All figures are derived live from transaction data, bucketed by month,
   consistent with the KPI Engine's rule (section 19) that nothing here is
   hand-entered.
--------------------------------------------------------------------------- */
function monthBuckets(n) {
  const out = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
    const start = `${key}-01`;
    const endDate = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const end = endDate.toISOString().slice(0, 10);
    out.push({ key, label, start, end });
  }
  return out;
}

function assetAreaName(assetId) {
  const a = find("assets", assetId);
  if (!a) return "—";
  const line = find("production_lines", a.line_id);
  if (!line) return "—";
  const area = find("areas", line.area_id);
  return area ? area.name : "—";
}

function pmAnalysisTrend(months = 6) {
  const buckets = monthBuckets(months);
  return buckets.map(b => {
    const inBucket = DB.pm_schedules.filter(s => s.due_date >= b.start && s.due_date <= b.end);
    const planned = inBucket.length;
    const completed = inBucket.filter(s => s.status === "Completed").length;
    const overdue = inBucket.filter(s => s.status === "Overdue").length;
    const rescheduled = DB.schedule_reschedules.filter(r => r.to_date >= b.start && r.to_date <= b.end).length;
    return {
      label: b.label, planned, completed, overdue, rescheduled,
      compliance: planned ? Math.round((completed / planned) * 100) : 0
    };
  });
}

function paretoBy(dimension, periodDays = 90) {
  const cutoff = addDays(today(), -periodDays);
  const rows = DB.breakdowns.filter(b => b.date >= cutoff);
  const map = {};

  rows.forEach(b => {
    let key;
    if (dimension === "failure") key = b.failure || "Unspecified";
    else if (dimension === "mode") key = b.failure_mode || "Unspecified";
    else if (dimension === "equipment") key = assetLabel(b.asset_id);
    else if (dimension === "area") key = assetAreaName(b.asset_id);
    else key = "Unspecified";

    if (!map[key]) map[key] = { label: key, count: 0, downtime: 0 };
    map[key].count += 1;
    map[key].downtime += Number(b.downtime_hours || 0);
  });

  const metric = dimension === "equipment" ? "downtime" : "count";
  const list = Object.values(map).sort((a, b) => b[metric] - a[metric]);
  const total = list.reduce((s, r) => s + r[metric], 0);
  let cum = 0;
  return list.map(r => {
    cum += r[metric];
    return { ...r, value: r[metric], cumPct: total ? Math.round((cum / total) * 100) : 0 };
  });
}

function reliabilityTrend(months = 6) {
  const buckets = monthBuckets(months);
  return buckets.map(b => {
    const daysInMonth = (new Date(b.end).getDate());
    const operatingHours = fleetOperatingHours(daysInMonth);
    const bds = DB.breakdowns.filter(x => x.date >= b.start && x.date <= b.end);
    const count = bds.length;
    const downtimeHours = bds.reduce((s, x) => s + Number(x.downtime_hours || 0), 0);
    const repairHours = bds.reduce((s, x) => s + Number(x.repair_duration || 0), 0);
    return {
      label: b.label,
      mtbf: count ? Math.round(operatingHours / count) : null,
      mttr: count ? +(repairHours / count).toFixed(1) : null,
      availability: operatingHours ? +(((operatingHours - downtimeHours) / operatingHours) * 100).toFixed(1) : null
    };
  });
}

function costByMonth(months = 6) {
  const buckets = monthBuckets(months);
  return buckets.map(b => {
    const total = DB.maintenance_costs
      .filter(c => c.date >= b.start && c.date <= b.end)
      .reduce((s, c) => s + Number(c.amount || 0), 0);
    return { label: b.label, total };
  });
}

function costByLine(periodDays = 90) {
  const cutoff = addDays(today(), -periodDays);
  const map = {};
  DB.maintenance_costs.filter(c => c.date >= cutoff).forEach(c => {
    let assetId = null;
    if (c.work_order_id) { const wo = DB.work_orders.find(w => w.id === c.work_order_id); if (wo) assetId = wo.asset_id; }
    else if (c.breakdown_id) { const bd = DB.breakdowns.find(x => x.id === c.breakdown_id); if (bd) assetId = bd.asset_id; }
    if (assetId === null) return;
    const asset = find("assets", assetId);
    const line = asset ? find("production_lines", asset.line_id) : null;
    const key = line ? line.name : "Unassigned";
    map[key] = (map[key] || 0) + Number(c.amount || 0);
  });
  return Object.entries(map).map(([line, total]) => ({ line, total })).sort((a, b) => b.total - a.total);
}

function recurringFailures(periodDays = 180, minOccurrences = 2) {
  const cutoff = addDays(today(), -periodDays);
  const map = {};
  DB.breakdowns.filter(b => b.date >= cutoff).forEach(b => {
    const key = `${b.asset_id}::${b.failure_mode || "Unspecified"}`;
    if (!map[key]) map[key] = { asset_id: b.asset_id, failure_mode: b.failure_mode || "Unspecified", occurrences: [] };
    map[key].occurrences.push(b);
  });
  return Object.values(map)
    .filter(r => r.occurrences.length >= minOccurrences)
    .map(r => ({
      asset_id: r.asset_id,
      failure_mode: r.failure_mode,
      count: r.occurrences.length,
      lastDate: r.occurrences.map(o => o.date).sort().slice(-1)[0],
      totalDowntime: +r.occurrences.reduce((s, o) => s + Number(o.downtime_hours || 0), 0).toFixed(1)
    }))
    .sort((a, b) => b.count - a.count);
}

/* ---------------------------------------------------------------------------
   RCA & CONTINUOUS IMPROVEMENT — Blueprint section 21 (Phase 4)
   Flow: Problem Definition -> Investigation -> Root Cause -> Action Plan ->
   Implementation -> Effectiveness Check -> Standardization -> Closed.
   "Problem Definition" is captured at case creation time; the stored
   `status` therefore starts at "Investigation". An "Not Effective" result
   at the Effectiveness Check loops back to Root Cause, per standard RCA
   practice, so continuous improvement is a real loop and not just a label.
--------------------------------------------------------------------------- */
const RCA_FLOW = ["Investigation", "Root Cause", "Action Plan", "Implementation", "Effectiveness Check", "Standardization", "Closed"];

function createRcaCase(data) {
  if (!can("RCA", "Create")) return denyAccess("rca_cases", "Create");
  return insert("rca_cases", {
    title: data.title,
    asset_id: data.asset_id,
    source_type: data.source_type || "Manual",
    source_id: data.source_id || null,
    status: "Investigation",
    problem_statement: data.problem_statement,
    investigation_notes: "", root_cause: "", action_plan: "",
    implementation_notes: "", implementation_date: "",
    effectiveness_result: "", effectiveness_notes: "",
    effectiveness_log: [],
    standardization_notes: "",
    created_at: today(), closed_at: null
  });
}

function progressRcaCase(caseId, stage, payload) {
  if (!can("RCA", "Edit")) return { ok: false, error: "Your current role can't progress RCA cases." };
  const c = find("rca_cases", caseId);
  if (!c) return { ok: false, error: "Case not found." };

  if (stage === "Investigation") {
    if (!payload.investigation_notes || !payload.investigation_notes.trim()) return { ok: false, error: "Investigation notes are required." };
    update("rca_cases", caseId, { investigation_notes: payload.investigation_notes.trim(), status: "Root Cause" });
    return { ok: true };
  }
  if (stage === "Root Cause") {
    if (!payload.root_cause || !payload.root_cause.trim()) return { ok: false, error: "Root cause is required." };
    update("rca_cases", caseId, { root_cause: payload.root_cause.trim(), status: "Action Plan" });
    return { ok: true };
  }
  if (stage === "Action Plan") {
    if (!payload.action_plan || !payload.action_plan.trim()) return { ok: false, error: "Action plan is required." };
    update("rca_cases", caseId, { action_plan: payload.action_plan.trim(), status: "Implementation" });
    return { ok: true };
  }
  if (stage === "Implementation") {
    if (!payload.implementation_notes || !payload.implementation_notes.trim() || !payload.implementation_date) {
      return { ok: false, error: "Implementation notes and date are required." };
    }
    update("rca_cases", caseId, {
      implementation_notes: payload.implementation_notes.trim(),
      implementation_date: payload.implementation_date,
      status: "Effectiveness Check"
    });
    return { ok: true };
  }
  if (stage === "Effectiveness Check") {
    if (!payload.effectiveness_notes || !payload.effectiveness_notes.trim() || !payload.effectiveness_result) {
      return { ok: false, error: "Effectiveness result and notes are required." };
    }
    const log = [...(c.effectiveness_log || []), { date: today(), result: payload.effectiveness_result, notes: payload.effectiveness_notes.trim() }];
    const nextStatus = payload.effectiveness_result === "Effective" ? "Standardization" : "Root Cause";
    update("rca_cases", caseId, {
      effectiveness_result: payload.effectiveness_result,
      effectiveness_notes: payload.effectiveness_notes.trim(),
      effectiveness_log: log,
      status: nextStatus
    });
    return { ok: true, loopedBack: nextStatus === "Root Cause" };
  }
  if (stage === "Standardization") {
    if (!payload.standardization_notes || !payload.standardization_notes.trim()) return { ok: false, error: "Standardization notes are required." };
    update("rca_cases", caseId, { standardization_notes: payload.standardization_notes.trim(), status: "Closed", closed_at: today() });
    return { ok: true };
  }
  return { ok: false, error: "This case is already closed." };
}

function rcaMethodRows(table, rcaId) {
  return DB[table].filter(r => r.rca_id === Number(rcaId));
}
function addWhy(rcaId, whyText) {
  if (!can("RCA", "Edit")) return denyAccess("rca_5why", "Edit");
  const level = rcaMethodRows("rca_5why", rcaId).length + 1;
  return insert("rca_5why", { rca_id: Number(rcaId), level, why_text: whyText });
}
function addFishboneCause(rcaId, category, causeText) {
  if (!can("RCA", "Edit")) return denyAccess("rca_fishbone", "Edit");
  return insert("rca_fishbone", { rca_id: Number(rcaId), category, cause_text: causeText });
}
function addFmeaRow(rcaId, data) {
  if (!can("RCA", "Edit")) return denyAccess("rca_fmea", "Edit");
  const rpn = Number(data.severity) * Number(data.occurrence) * Number(data.detection);
  return insert("rca_fmea", { rca_id: Number(rcaId), ...data, rpn });
}

/* ---------------------------------------------------------------------------
   ROLE-BASED PERMISSIONS — Blueprint section 25
   IMPORTANT: this is a workflow/UX gate, not a security boundary. PMMS V1
   is a single-PC offline app with all data in the browser's own storage —
   there is no server to enforce access control against. The matrix below
   exists so the *shape* of the multi-user permission system is correct
   and ready to be enforced server-side once Phase 5 (multi-user / network
   database) is built. The role switcher on Settings is provided for
   demonstration and single-operator convenience, not authentication.
--------------------------------------------------------------------------- */
const APP_ROLES = ["Administrator", "Maintenance Planner", "Technician", "Viewer"];

const PERMISSIONS = {
  "Administrator": {
    "Asset": ["View", "Create", "Edit", "Delete", "Export"],
    "PM Master": ["View", "Create", "Edit", "Delete"],
    "PM Plan": ["View", "Create", "Edit", "Delete"],
    "Schedule": ["View", "Create", "Edit"],
    "Work Order": ["View", "Create", "Edit", "Execute", "Approve", "Delete"],
    "Abnormality": ["View", "Create", "Approve"],
    "Breakdown": ["View", "Create", "Edit", "Delete"],
    "Spare Part": ["View", "Create", "Edit", "Delete"],
    "Technician": ["View", "Create", "Edit", "Delete"],
    "Reports": ["View", "Export"],
    "Analytics": ["View"],
    "RCA": ["View", "Create", "Edit", "Approve"],
    "Settings": ["View", "Edit", "Approve"]
  },
  "Maintenance Planner": {
    "Asset": ["View", "Create", "Edit", "Export"],
    "PM Master": ["View", "Create", "Edit"],
    "PM Plan": ["View", "Create", "Edit"],
    "Schedule": ["View", "Create", "Edit"],
    "Work Order": ["View", "Create", "Edit", "Approve"],
    "Abnormality": ["View", "Create", "Approve"],
    "Breakdown": ["View", "Create", "Edit"],
    "Spare Part": ["View", "Create", "Edit"],
    "Technician": ["View", "Create", "Edit"],
    "Reports": ["View", "Export"],
    "Analytics": ["View"],
    "RCA": ["View", "Create", "Edit", "Approve"],
    "Settings": ["View"]
  },
  "Technician": {
    "Asset": ["View"],
    "PM Master": ["View"],
    "PM Plan": ["View"],
    "Schedule": ["View"],
    "Work Order": ["View", "Execute"],
    "Abnormality": ["View"],
    "Breakdown": ["View", "Create"],
    "Spare Part": ["View"],
    "Technician": ["View"],
    "Reports": ["View"],
    "Analytics": ["View"],
    "RCA": ["View"],
    "Settings": []
  },
  "Viewer": {
    "Asset": ["View"], "PM Master": ["View"], "PM Plan": ["View"], "Schedule": ["View"],
    "Work Order": ["View"], "Abnormality": ["View"], "Breakdown": ["View"],
    "Spare Part": ["View"], "Technician": ["View"], "Reports": ["View", "Export"],
    "Analytics": ["View"], "RCA": ["View"], "Settings": []
  }
};

/* ---------------------------------------------------------------------------
   AUTHENTICATION & USER MANAGEMENT — Catatan Perbaikan 9, poin #2 dan #3
   Replaces the old "Simulate Role" dropdown with a real login: every
   operator has their own username + password, set only by an
   Administrator, and the role enforced everywhere is whoever is
   genuinely logged in on this browser tab — not a dropdown anyone could
   flip. Passwords are never stored in the clear: only a random per-user
   salt and a PBKDF2-SHA256 hash of the password are kept.

   Same honesty as the LICENSE SYSTEM section below: this is client-side,
   offline, single-PC protection. It stops a coworker from casually
   opening PMMS as someone else, or a wrong click switching roles with no
   trace. It does not withstand someone editing this browser's local
   storage directly in DevTools — there is no server this build can check
   against. Removing that gap is exactly what the future networked/
   multi-user phase is for.
--------------------------------------------------------------------------- */
const SESSION_KEY = "pmms_session_user_id";
const PBKDF2_ITERATIONS = 150000;

function bufToHex(buf) {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}
function hexToBuf(hex) {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(hex.substr(i * 2, 2), 16);
  return arr;
}
function randomSaltHex() {
  return bufToHex(crypto.getRandomValues(new Uint8Array(16)));
}
async function hashPassword(password, saltHex) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: hexToBuf(saltHex), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial, 256
  );
  return bufToHex(bits);
}

// Administrator and Maintenance Planner are single-seat roles: exactly
// one ACTIVE account may hold each at a time. Technician and Viewer are
// unrestricted in number. excludeUserId lets an edit check against every
// OTHER user without tripping over itself.
const SINGLE_SEAT_ROLES = ["Administrator", "Maintenance Planner"];
function roleSeatConflict(role, excludeUserId) {
  if (!SINGLE_SEAT_ROLES.includes(role)) return null;
  return DB.users.find(u => u.role === role && u.active !== false && u.id !== Number(excludeUserId)) || null;
}

async function createUser({ username, name, role, password }) {
  if (!can("Settings", "Approve")) return { ok: false, error: "Your current role can't manage users." };
  username = (username || "").trim();
  if (!username) return { ok: false, error: "Username is required." };
  if (!/^[A-Za-z0-9._-]{3,30}$/.test(username)) return { ok: false, error: "Username must be 3-30 characters: letters, numbers, dot, dash or underscore only." };
  if (!APP_ROLES.includes(role)) return { ok: false, error: "Invalid role." };
  if (!password || password.length < 6) return { ok: false, error: "Password must be at least 6 characters." };
  if (DB.users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
    return { ok: false, error: `Username "${username}" is already taken.` };
  }
  const conflict = roleSeatConflict(role, null);
  if (conflict) {
    return { ok: false, error: `${role} already has an active account (${conflict.username}). Deactivate it first, or choose a different role.` };
  }
  const saltHex = randomSaltHex();
  const hash = await hashPassword(password, saltHex);
  const row = {
    id: nextId("users"), username, name: (name || "").trim() || username, role,
    active: true, password_salt: saltHex, password_hash: hash,
    must_change_password: false, created_at: new Date().toISOString(), last_login: null
  };
  DB.users.push(row);
  log("CREATE", `users#${row.id} (${username})`);
  save();
  return { ok: true, user: row };
}

async function setUserPassword(userId, newPassword, { self = false } = {}) {
  if (!self && !can("Settings", "Approve")) return { ok: false, error: "Your current role can't manage users." };
  const u = find("users", userId);
  if (!u) return { ok: false, error: "User not found." };
  if (!newPassword || newPassword.length < 6) return { ok: false, error: "Password must be at least 6 characters." };
  u.password_salt = randomSaltHex();
  u.password_hash = await hashPassword(newPassword, u.password_salt);
  u.must_change_password = false;
  log("UPDATE", `users#${u.id} password changed`);
  save();
  return { ok: true };
}

function setUserRole(userId, role) {
  if (!can("Settings", "Approve")) return { ok: false, error: "Your current role can't manage users." };
  const u = find("users", userId);
  if (!u) return { ok: false, error: "User not found." };
  if (!APP_ROLES.includes(role)) return { ok: false, error: "Invalid role." };
  if (u.active !== false) {
    const conflict = roleSeatConflict(role, userId);
    if (conflict) return { ok: false, error: `${role} already has an active account (${conflict.username}).` };
  }
  u.role = role;
  log("UPDATE", `users#${u.id} role -> ${role}`);
  save();
  return { ok: true };
}

function setUserActive(userId, active) {
  if (!can("Settings", "Approve")) return { ok: false, error: "Your current role can't manage users." };
  const u = find("users", userId);
  if (!u) return { ok: false, error: "User not found." };
  if (active) {
    const conflict = roleSeatConflict(u.role, userId);
    if (conflict) return { ok: false, error: `${u.role} already has an active account (${conflict.username}). Deactivate that one first.` };
  } else {
    const activeAdmins = DB.users.filter(x => x.role === "Administrator" && x.active !== false);
    if (u.role === "Administrator" && activeAdmins.length <= 1) {
      return { ok: false, error: "Can't deactivate the last active Administrator account." };
    }
  }
  u.active = active;
  log("UPDATE", `users#${u.id} ${active ? "activated" : "deactivated"}`);
  save();
  if (!active && sessionUserId() === u.id) logout();
  return { ok: true };
}

async function authenticate(username, password) {
  const u = DB.users.find(x => x.username.toLowerCase() === String(username || "").trim().toLowerCase());
  if (!u || u.active === false) return { ok: false, error: "Invalid username or password." };
  const hash = await hashPassword(password, u.password_salt);
  if (hash !== u.password_hash) return { ok: false, error: "Invalid username or password." };
  u.last_login = new Date().toISOString();
  log("LOGIN", `users#${u.id} (${u.username})`);
  save();
  sessionStorage.setItem(SESSION_KEY, String(u.id));
  return { ok: true, user: u };
}

function sessionUserId() {
  const raw = sessionStorage.getItem(SESSION_KEY);
  return raw ? Number(raw) : null;
}
function currentUser() {
  const id = sessionUserId();
  if (!id) return null;
  const u = find("users", id);
  return (u && u.active !== false) ? u : null;
}
function logout() {
  const u = currentUser();
  if (u) log("LOGOUT", `users#${u.id} (${u.username})`);
  sessionStorage.removeItem(SESSION_KEY);
  save();
}

function currentRole() {
  const u = currentUser();
  if (u) return u.role;
  // Nobody is logged in on this tab yet — used only as an internal
  // bootstrap default (e.g. while seed() runs on first install, before
  // any UI is shown). The login screen gates every real page.
  return "Administrator";
}
function can(module, action) {
  const roleMatrix = PERMISSIONS[currentRole()];
  if (!roleMatrix) return false;
  const allowed = roleMatrix[module];
  return !!allowed && allowed.includes(action);
}

/* ---------------------------------------------------------------------------
   DATA-LAYER RBAC ENFORCEMENT
   can() alone only hid buttons in the UI — anything that reached
   insert/update/remove directly (a stray call, a console command) bypassed
   it completely. This wraps the generic CRUD helpers with the SAME
   permission check the UI uses, for every master table that has a direct
   Create/Edit/Delete form. A denied attempt is logged to audit_logs
   instead of silently doing nothing.
   Abnormality / PM Schedule / RCA-progress are deliberately NOT in this
   table map (RCA case creation is guarded separately, in createRcaCase
   itself): their tables are touched by many internal engine steps
   (submit execution, close, reschedule, progress stage) each with its own
   narrower permission (Execute vs Approve vs Edit) already checked at the
   top of the relevant function below — mapping them to a single blanket
   "Edit" here would incorrectly block a Technician's "Execute" action.
   Work Order IS in the map below, but only for Delete (Fase 2) — nothing
   calls guardedInsert/guardedUpdate on it, so its Create/Edit/Execute/
   Approve paths are unaffected and still go through their own guards.
--------------------------------------------------------------------------- */
const TABLE_MODULE = {
  assets: "Asset",
  spare_parts: "Spare Part",
  technicians: "Technician",
  pm_tasks: "PM Master",
  maintenance_types: "PM Master",
  frequencies: "PM Master",
  pm_plans: "PM Plan",
  breakdowns: "Breakdown",
  work_orders: "Work Order" // guardedRemove() only — Work Order create/edit/execute/approve
  // keep going through their own narrower per-function guards (see comment above);
  // adding it here is safe only because nothing calls guardedInsert/guardedUpdate
  // on work_orders — only the Delete button (Fase 2) does, via guardedRemove.
};
const CRUD_ACTION = { insert: "Create", update: "Edit", remove: "Delete" };

function denyAccess(table, crudOp) {
  const module = TABLE_MODULE[table] || table;
  log("ACCESS_DENIED", `${crudOp} on ${module} (${table}) denied for role ${currentRole()}`);
  save();
  if (typeof toast === "function") toast(`Your role (${currentRole()}) doesn't have permission to do that.`, "error");
  return null;
}
// Sibling of denyAccess() above, for actions that aren't a simple table
// CRUD op — Work Order Execute/Approve and Abnormality Approve each guard
// a specific engine function below rather than a generic table map entry
// (see the comment on TABLE_MODULE for why). Same logging/toast behavior.
function denyModuleAccess(module, action) {
  log("ACCESS_DENIED", `${action} on ${module} denied for role ${currentRole()}`);
  save();
  if (typeof toast === "function") toast(`Your role (${currentRole()}) doesn't have permission to do that.`, "error");
  return null;
}
function guardedInsert(table, record) {
  const module = TABLE_MODULE[table];
  if (module && !can(module, CRUD_ACTION.insert)) return denyAccess(table, "Create");
  return insert(table, record);
}
function guardedUpdate(table, id, patch) {
  const module = TABLE_MODULE[table];
  if (module && !can(module, CRUD_ACTION.update)) return denyAccess(table, "Edit");
  return update(table, id, patch);
}
function guardedRemove(table, id) {
  const module = TABLE_MODULE[table];
  if (module && !can(module, CRUD_ACTION.remove)) return denyAccess(table, "Delete");
  return remove(table, id);
}

/* ---------------------------------------------------------------------------
   CSV IMPORT — Blueprint section 27 (Excel import; CSV is used here since
   V1 stays free of external libraries/CDN — every spreadsheet tool can
   export CSV, so this covers the same practical need offline)
--------------------------------------------------------------------------- */
function parseCSV(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter(l => l.trim().length);
  if (!lines.length) return [];
  const splitLine = line => {
    const cells = []; let cur = ""; let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) { cells.push(cur); cur = ""; }
      else cur += ch;
    }
    cells.push(cur);
    return cells.map(c => c.trim());
  };
  const headers = splitLine(lines[0]).map(h => h.toLowerCase());
  return lines.slice(1).map(line => {
    const cells = splitLine(line);
    const row = {};
    headers.forEach((h, i) => row[h] = cells[i] !== undefined ? cells[i] : "");
    return row;
  });
}

const ASSET_IMPORT_TEMPLATE_HEADERS = ["code", "name", "category", "manufacturer", "model", "serial", "install_date", "location", "criticality", "department", "operating_hours_per_day"];

function findOrCreateAreaLine(areaName) {
  if (!areaName || !areaName.trim()) return DB.production_lines[0] ? DB.production_lines[0].id : null;
  const name = areaName.trim();
  let area = DB.areas.find(a => a.name.trim().toLowerCase() === name.toLowerCase());
  if (!area) area = insert("areas", { plant_id: DB.plants[0] ? DB.plants[0].id : null, name });
  let line = DB.production_lines.find(l => l.area_id === area.id);
  if (!line) line = insert("production_lines", { area_id: area.id, name: name + " Line" });
  return line.id;
}

function importAssetsFromCSV(rows) {
  if (!can("Asset", "Create")) return { count: 0, errors: ["Your current role can't import assets."] };
  const errors = [];
  let count = 0;
  const limit = licenseLimits().max_assets;
  rows.forEach((r, i) => {
    if (DB.assets.length >= limit) {
      errors.push(`Row ${i + 2}: skipped — DEMO license asset limit (${limit}) reached. Upgrade to add more.`);
      return;
    }
    const code = (r.code || "").trim();
    const name = (r.name || "").trim();
    if (!code || !name) { errors.push(`Row ${i + 2}: code and name are required — skipped.`); return; }
    if (DB.assets.some(a => a.code === code)) { errors.push(`Row ${i + 2}: code "${code}" already exists — skipped.`); return; }
    insert("assets", {
      code, name,
      category: r.category || "", manufacturer: r.manufacturer || "", model: r.model || "",
      serial: r.serial || "", install_date: r.install_date || "", commission_date: r.install_date || "",
      location: r.location || "", line_id: findOrCreateAreaLine(r.area || r.location),
      criticality: ["A", "B", "C"].includes((r.criticality || "").toUpperCase()) ? r.criticality.toUpperCase() : "C",
      operating_hours: 0, operating_hours_per_day: Math.min(24, Math.max(0, Number(r.operating_hours_per_day) || 24)),
      status: "Running", department: r.department || "", notes: "Imported via CSV"
    });
    count++;
  });
  return { count, errors };
}

/* ---------------------------------------------------------------------------
   MORE CSV IMPORT — extends the pattern above to the rest of Master Data
   and Fact tables, so a full linked dataset (Assets -> Spare Parts ->
   Technicians -> PM Tasks -> PM Plans -> historical PM Records ->
   Breakdowns) can be brought in without retyping it through the forms.
   Each importer is independent and reports skipped rows individually,
   the same way importAssetsFromCSV already does — nothing here fails the
   whole batch over one bad row.
--------------------------------------------------------------------------- */
function findByCode(table, code) {
  return DB[table].find(r => r.code && r.code.trim().toLowerCase() === String(code || "").trim().toLowerCase());
}
function findByName(table, name) {
  return DB[table].find(r => r.name && r.name.trim().toLowerCase() === String(name || "").trim().toLowerCase());
}
function findOrCreateMaintenanceType(name) {
  if (!name) return null;
  let row = findByName("maintenance_types", name);
  if (!row) row = insert("maintenance_types", { name: name.trim() });
  return row;
}
function findOrCreateTechnician(name) {
  if (!name) return null;
  let row = findByName("technicians", name);
  if (!row) row = insert("technicians", { name: name.trim(), department: "Maintenance", skill: "", certification: "-", status: "Active" });
  return row;
}
function findFrequencyByName(name) {
  return DB.frequencies.find(f => f.name.trim().toLowerCase() === String(name || "").trim().toLowerCase());
}
function nextPmTaskCode() {
  const n = (DB._seq.pm_tasks || 0) + 1;
  return "PMT-" + String(n).padStart(3, "0");
}

function importSparePartsFromCSV(rows) {
  if (!can("Spare Part", "Create")) return { count: 0, errors: ["Your current role can't import spare parts."] };
  const errors = []; let count = 0;
  rows.forEach((r, i) => {
    const code = (r.code || "").trim(), name = (r.name || "").trim();
    if (!code || !name) { errors.push(`Row ${i + 2}: code and name are required — skipped.`); return; }
    if (findByCode("spare_parts", code)) { errors.push(`Row ${i + 2}: code "${code}" already exists — skipped.`); return; }
    insert("spare_parts", { code, name, department: (r.department || "").trim(), unit: r.unit || "", unit_cost: Number(r.unit_cost) || 0 });
    count++;
  });
  return { count, errors };
}

function importTechniciansFromCSV(rows) {
  if (!can("Technician", "Create")) return { count: 0, errors: ["Your current role can't import technicians."] };
  const errors = []; let count = 0;
  rows.forEach((r, i) => {
    const name = (r.name || "").trim();
    if (!name) { errors.push(`Row ${i + 2}: name is required — skipped.`); return; }
    if (findByName("technicians", name)) { errors.push(`Row ${i + 2}: "${name}" already exists — skipped.`); return; }
    insert("technicians", {
      name, department: r.department || "Maintenance", skill: r.skill || "",
      certification: r.certification || "-", status: r.status || "Active"
    });
    count++;
  });
  return { count, errors };
}

function importPmTasksFromCSV(rows) {
  if (!can("PM Master", "Create")) return { count: 0, errors: ["Your current role can't import PM tasks."] };
  const errors = []; let count = 0;
  rows.forEach((r, i) => {
    const asset = findByCode("assets", r.asset_code);
    if (!asset) { errors.push(`Row ${i + 2}: asset code "${r.asset_code}" not found — skipped.`); return; }
    const freq = findFrequencyByName(r.frequency);
    if (!freq) { errors.push(`Row ${i + 2}: frequency "${r.frequency}" not found (import Frequencies first, or use an existing name) — skipped.`); return; }
    if (!r.description) { errors.push(`Row ${i + 2}: description is required — skipped.`); return; }
    const mtype = findOrCreateMaintenanceType(r.maintenance_type || "Preventive");
    const sparePart = r.spare_part_code ? findByCode("spare_parts", r.spare_part_code) : null;
    if (r.spare_part_code && !sparePart) errors.push(`Row ${i + 2}: spare part code "${r.spare_part_code}" not found — task saved without a linked spare part.`);

    const checklist = [];
    for (let n = 1; n <= 3; n++) {
      const item = r[`checklist_${n}`];
      if (item && item.trim()) checklist.push({ item: item.trim(), standard: (r[`checklist_${n}_standard`] || "").trim() });
    }
    if (!checklist.length) checklist.push({ item: r.description, standard: r.standard || "" });

    const code = (r.task_code || "").trim() || nextPmTaskCode();
    if (findByCode("pm_tasks", code)) { errors.push(`Row ${i + 2}: task code "${code}" already exists — skipped.`); return; }

    insert("pm_tasks", {
      code, asset_id: asset.id, description: r.description, department: (r.department || "").trim(),
      maintenance_type_id: mtype.id, frequency_id: freq.id,
      standard: r.standard || "", method: r.method || "", safety: r.safety || "",
      est_duration: Number(r.est_duration) || 30, manpower: Number(r.manpower) || 1,
      spare_part_id: sparePart ? sparePart.id : null, qty: r.qty || "", unit: r.unit || "",
      est_cost: 0, tools: r.tools || "", measurement_param: "", acceptance_criteria: "",
      checklist
    });
    count++;
  });
  return { count, errors };
}

function importPmPlansFromCSV(rows) {
  if (!can("PM Plan", "Create")) return { count: 0, errors: ["Your current role can't import PM plans."] };
  const errors = []; let count = 0;
  rows.forEach((r, i) => {
    const asset = findByCode("assets", r.asset_code);
    if (!asset) { errors.push(`Row ${i + 2}: asset code "${r.asset_code}" not found — skipped.`); return; }
    const task = findByCode("pm_tasks", r.task_code);
    if (!task) { errors.push(`Row ${i + 2}: PM Task code "${r.task_code}" not found (import PM Tasks first) — skipped.`); return; }
    const freq = findFrequencyByName(r.frequency) || find("frequencies", task.frequency_id);
    if (!r.start_date) { errors.push(`Row ${i + 2}: start_date is required — skipped.`); return; }
    insert("pm_plans", {
      asset_id: asset.id, pm_task_id: task.id, frequency_id: freq.id,
      start_date: r.start_date, active: true, last_generated: null
    });
    count++;
  });
  return { count, errors };
}

function importBreakdownsFromCSV(rows) {
  if (!can("Breakdown", "Create")) return { count: 0, errors: ["Your current role can't import breakdowns."] };
  const errors = []; let count = 0;
  rows.forEach((r, i) => {
    const asset = findByCode("assets", r.asset_code);
    if (!asset) { errors.push(`Row ${i + 2}: asset code "${r.asset_code}" not found — skipped.`); return; }
    if (!r.date || !r.failure) { errors.push(`Row ${i + 2}: date and failure description are required — skipped.`); return; }
    const tech = findOrCreateTechnician(r.technician_name);
    const sparePart = r.spare_part_code ? findByCode("spare_parts", r.spare_part_code) : null;
    if (r.spare_part_code && !sparePart) errors.push(`Row ${i + 2}: spare part code "${r.spare_part_code}" not found — breakdown saved without spare part cost.`);
    const qty = Number(r.qty) || 0;
    const spareCost = sparePart ? qty * sparePart.unit_cost : 0;

    const bd = insert("breakdowns", {
      asset_id: asset.id, date: r.date, failure: r.failure,
      failure_mode: r.failure_mode || "Other", cause: r.cause || "Unknown",
      downtime_hours: Number(r.downtime_hours) || 0, repair_duration: Number(r.repair_duration) || 0,
      technician_id: tech ? tech.id : null, spare_part_id: sparePart ? sparePart.id : null,
      spare_cost: spareCost, action: r.action || "", status: r.status || "Closed"
    });
    if (spareCost > 0) {
      insert("maintenance_costs", { work_order_id: null, breakdown_id: bd.id, type: "Spare Part", amount: spareCost, date: bd.date });
    }
    count++;
  });
  return { count, errors };
}

// Historical PM records: each row becomes a real Work Order + PM Execution
// (and an Abnormality if marked Abnormal), built through the same engine
// functions the UI uses — this is what safely backfills Analytics/Reports
// with a custom dataset instead of hand-clicking through the checklist UI
// once per historical record. Where a matching PM Plan exists, a proper
// pm_schedule row is created/linked (status -> Completed) so Dashboard PM
// Compliance reflects this data too, and so plan.last_generated is moved
// forward — otherwise a later "Generate Schedule" click would regenerate
// these same historical dates and mark them Overdue (never completed),
// even though a completed Work Order already exists for that date.
function importPmRecordsFromCSV(rows) {
  if (!can("Work Order", "Create")) return { count: 0, errors: ["Your current role can't import historical PM records."] };
  const errors = []; let count = 0;
  rows.forEach((r, i) => {
    const asset = findByCode("assets", r.asset_code);
    if (!asset) { errors.push(`Row ${i + 2}: asset code "${r.asset_code}" not found — skipped.`); return; }
    const task = findByCode("pm_tasks", r.task_code);
    if (!task) { errors.push(`Row ${i + 2}: PM Task code "${r.task_code}" not found — skipped.`); return; }
    if (!r.date) { errors.push(`Row ${i + 2}: date is required — skipped.`); return; }
    const tech = findOrCreateTechnician(r.technician_name);
    const isAbnormal = (r.result || "").trim().toLowerCase() === "abnormal";

    const plan = DB.pm_plans.find(p => p.pm_task_id === task.id);
    let sched = null;
    if (plan) {
      sched = DB.pm_schedules.find(s => s.pm_plan_id === plan.id && s.due_date === r.date);
      if (!sched) {
        insertScheduleRow(plan, r.date);
        sched = DB.pm_schedules.find(s => s.pm_plan_id === plan.id && s.due_date === r.date);
      }
    }

    const wo = sched
      ? createWorkOrderFromSchedule(sched.id, tech ? tech.id : null, "Medium")
      : createAdHocWorkOrder({ asset_id: asset.id, pm_task_id: task.id, type: "Preventive", scheduled_date: r.date, technician_id: tech ? tech.id : null, priority: "Medium" });

    const checklist = (task.checklist || []).map((c, idx) => ({
      task: c.item,
      result: (isAbnormal && idx === 0) ? "Abnormal" : "Normal",
      note: (isAbnormal && idx === 0) ? (r.finding || "Imported historical finding") : ""
    }));

    const sparePart = r.spare_part_code ? findByCode("spare_parts", r.spare_part_code) : null;
    const qty = Number(r.qty) || 0;
    const spareUsage = sparePart && qty > 0 ? [{ spare_part_id: sparePart.id, qty, cost: qty * sparePart.unit_cost }] : [];

    _submitExecutionRaw(wo.id, {
      date: r.date, start_time: "08:00", end_time: "08:30", technician_id: tech ? tech.id : null,
      checklist,
      finding: isAbnormal ? (r.finding || "Imported historical finding") : "",
      severity: isAbnormal ? (r.severity || "Medium") : "",
      action: isAbnormal ? (r.action || "") : "",
      spareUsage, man_hours: Number(r.man_hours) || 0.5
    });
    _closeWorkOrderRaw(wo.id);

    if (plan && (!plan.last_generated || r.date > plan.last_generated)) {
      plan.last_generated = r.date;
    }
    count++;
  });
  save();
  return { count, errors };
}

/* ---------------------------------------------------------------------------
   LICENSE SYSTEM — Blueprint section 31
   "DEMO: limited number of assets, number of transactions, export
   limitation, feature limitation. PREMIUM: full functionality. VIP: full
   functionality, no expiry." — kept fully separate from RBAC: RBAC governs
   what an operational ROLE can do; this governs what the PRODUCT TIER
   allows regardless of role. An Administrator on a DEMO license still
   hits these caps.
--------------------------------------------------------------------------- */
/* ---------------------------------------------------------------------------
   LICENSE SYSTEM — Blueprint section 31
   DEMO is open access with limits (see LICENSE_PLANS below). PREMIUM and
   VIP require a signed license file issued by the seller and imported via
   Settings → License → Import License — license_type is never freely
   editable in the UI anymore; it is only ever DERIVED from a verified file.

   HOW THE SIGNING WORKS (read this before assuming it's uncrackable):
   License files are signed with ECDSA P-256. The app embeds only the
   PUBLIC key below — the private signing key lives exclusively in
   /seller-tools (a separate deliverable, never shipped to a customer).
   This means a customer cannot self-issue a valid PREMIUM/VIP file no
   matter how much of this shipped source they read, because signing
   requires the private key and only verification requires the public
   one. What this does NOT do: stop someone from patching the running
   JS to skip the verify() call entirely, or from sharing a valid file
   with someone else — there is no server this app can phone home to on
   an offline product to prevent either of those. Treat this as
   equivalent to a typical offline desktop license key: it stops casual
   copying and self-service upgrades, not a determined crack.
--------------------------------------------------------------------------- */
const LICENSE_PUBLIC_KEY_JWK = {
  key_ops: ["verify"], ext: true, kty: "EC",
  x: "oqeQN0oH8RBWfUApytGDpk0QxDaOZ4A9STE2uxW0-Ts",
  y: "tcIZhMIwcKN3l_6wMwmZHDCWQdzoPc8tBVfNU2199mA",
  crv: "P-256"
};

async function verifyLicenseSignature(license) {
  const { signature, ...payload } = license;
  if (!signature) return false;
  try {
    const key = await crypto.subtle.importKey(
      "jwk", LICENSE_PUBLIC_KEY_JWK, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]
    );
    const data = new TextEncoder().encode(JSON.stringify(payload));
    const sigBytes = Uint8Array.from(atob(signature), c => c.charCodeAt(0));
    return await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, sigBytes, data);
  } catch (e) {
    console.warn("PMMS: license signature check failed to run.", e);
    return false;
  }
}

// Shared by both delivery forms below (file and compact code): validates
// required fields, verifies the ECDSA signature, checks expiry, and
// (same as any other Settings change) requires Settings:Edit.
async function applyVerifiedLicense(license) {
  const required = ["license_id", "customer_name", "license_type", "issued_date", "signature"];
  if (!license || typeof license !== "object" || !required.every(k => k in license) || !["PREMIUM", "VIP"].includes(license.license_type)) {
    return { ok: false, error: "This license is missing required fields." };
  }
  const validSignature = await verifyLicenseSignature(license);
  if (!validSignature) {
    return { ok: false, error: "This license's signature doesn't check out — it may be corrupted or altered." };
  }
  if (license.expiry_date && license.expiry_date < today()) {
    return { ok: false, error: `This license expired on ${license.expiry_date}. Contact the seller for a renewal.` };
  }
  if (!can("Settings", "Edit")) return { ok: false, error: "Your current role can't manage the license." };

  DB.settings.active_license = license;
  DB.settings.license_type = license.license_type;
  save();
  return { ok: true, license };
}

async function importLicenseFile(fileText) {
  let license;
  try { license = JSON.parse(fileText); }
  catch { return { ok: false, error: "This file isn't valid — it doesn't look like a PMMS license file." }; }
  return applyVerifiedLicense(license);
}

/* ---------------------------------------------------------------------------
   COMPACT ACCESS CODE — Catatan Perbaikan 9, poin #1
   The signed .pmlic file above already keeps the private signing key out
   of the shipped app — that requirement was already met. What was
   missing was a form of it short enough to paste into an email or a
   WhatsApp message instead of attaching a file. This is NOT a separate,
   weaker license mechanism: it is the exact same signed JSON payload,
   just base64url-encoded onto one line with a short recognizable prefix.
   Verification reuses applyVerifiedLicense() above unchanged — a code
   with a tampered payload fails ECDSA verification exactly like a
   tampered file would. The seller's issuing tool needs a small addition
   to also print this string alongside the .pmlic file it already
   generates; the signing key itself doesn't change.
--------------------------------------------------------------------------- */
const LICENSE_CODE_PREFIX = "PMMS-LIC-";

function encodeLicenseCode(license) {
  const json = JSON.stringify(license);
  const b64 = btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return LICENSE_CODE_PREFIX + b64;
}

async function importLicenseCode(codeText) {
  const cleaned = (codeText || "").trim().replace(/\s+/g, "");
  if (!cleaned) return { ok: false, error: "Paste the access code first." };
  const body = cleaned.startsWith(LICENSE_CODE_PREFIX) ? cleaned.slice(LICENSE_CODE_PREFIX.length) : cleaned;
  let json;
  try {
    let b64 = body.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    json = decodeURIComponent(escape(atob(b64)));
  } catch {
    return { ok: false, error: "This access code isn't formatted correctly — check that it was copied in full." };
  }
  let license;
  try { license = JSON.parse(json); }
  catch { return { ok: false, error: "This access code isn't a valid PMMS license." }; }
  return applyVerifiedLicense(license);
}

function removeLicense() {
  if (!can("Settings", "Edit")) return { ok: false, error: "Your current role can't manage the license." };
  DB.settings.active_license = null;
  DB.settings.license_type = "DEMO";
  save();
  return { ok: true };
}

// Re-checked on every load(): a PREMIUM license that has quietly expired
// since the app was last opened should fall back to DEMO rather than keep
// granting access past its date.
function reviewLicenseExpiry() {
  const lic = DB.settings.active_license;
  if (lic && lic.expiry_date && lic.expiry_date < today() && DB.settings.license_type !== "DEMO") {
    DB.settings.license_type = "DEMO";
    save();
    return true; // signals "just expired" so the UI can say so once
  }
  return false;
}

const LICENSE_PLANS = {
  DEMO: { max_assets: 10, max_work_orders_per_month: 20, exportEnabled: false, rcaEnabled: false },
  PREMIUM: { max_assets: Infinity, max_work_orders_per_month: Infinity, exportEnabled: true, rcaEnabled: true },
  VIP: { max_assets: Infinity, max_work_orders_per_month: Infinity, exportEnabled: true, rcaEnabled: true }
};

/* ---------------------------------------------------------------------------
   PURCHASE CONTACT — public demo deployment only.
   Edit LICENSE_CONTACT_WHATSAPP below to change the number shown on every
   "Upgrade to PREMIUM/VIP" prompt across the app. Number is in international
   format with no leading + or spaces (e.g. "62812xxxxxxx").
--------------------------------------------------------------------------- */
const LICENSE_CONTACT_WHATSAPP = "6281283277360";
function licenseContactUrl(context) {
  const msg = encodeURIComponent(`Halo, saya tertarik upgrade PMMS ke PREMIUM/VIP${context ? ` (${context})` : ""}.`);
  return `https://wa.me/${LICENSE_CONTACT_WHATSAPP}?text=${msg}`;
}
function licenseUpgradeLinkHtml(context, label) {
  return `<a href="${licenseContactUrl(context)}" target="_blank" rel="noopener" class="button" style="text-decoration:none">${label || "💬 Beli Lisensi via WhatsApp"}</a>`;
}

function licenseType() {
  return (DB.settings && DB.settings.license_type) || "DEMO";
}
function licenseLimits() {
  return LICENSE_PLANS[licenseType()] || LICENSE_PLANS.DEMO;
}
function assetUsage() {
  const limit = licenseLimits().max_assets;
  const count = DB.assets.length;
  return { count, limit, atLimit: count >= limit, unlimited: !isFinite(limit) };
}
function workOrderMonthUsage() {
  const limit = licenseLimits().max_work_orders_per_month;
  const ym = today().slice(0, 7);
  const count = DB.work_orders.filter(w => (w.created_at || "").slice(0, 7) === ym).length;
  return { count, limit, atLimit: count >= limit, unlimited: !isFinite(limit) };
}
function canExport() {
  return licenseLimits().exportEnabled;
}
function canUseRca() {
  return licenseLimits().rcaEnabled;
}

/* ---------------------------------------------------------------------------
   BACKUP / RESTORE — Blueprint section 26
--------------------------------------------------------------------------- */
function backupToFile() {
  if (!can("Settings", "Approve")) { if (typeof toast === "function") toast("Your current role can't create backups.", "error"); return; }
  _backupToFileRaw(false);
}
// Unguarded core, reused by the automatic-backup scheduler below — an
// automatic backup is a system-protective action taken on the data
// itself, not a privileged action by whoever happens to be logged in, so
// it isn't gated by that person's role the way a manual click is.
function _backupToFileRaw(auto) {
  const payload = JSON.stringify(DB, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = today();
  a.href = url;
  a.download = auto ? `PMMS_AutoBackup_${stamp}.json` : `PMMS_Backup_${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  DB.backups.unshift({ id: nextId("backups"), created_at: new Date().toISOString(), filename: a.download, auto: !!auto });
  save();
}

/* ---------------------------------------------------------------------------
   AUTOMATIC BACKUP — Catatan Perbaikan 9, poin #10
   auto_backup ("off"/"daily"/"weekly") existed in the schema since early
   builds but nothing ever read it — no scheduler, no UI. This makes it
   real: checkAutoBackup() runs once per sign-in (see app.js) and, if the
   configured interval has elapsed since the last automatic backup,
   triggers a real download the same way the manual "Backup Now" button
   does, then records the timestamp.

   Honest limit: a plain webpage has no way to run code while the browser
   is closed or the tab isn't open — there is no background service here.
   "Daily" and "Weekly" mean "the first time someone signs in on or after
   that interval has elapsed," not a guarantee it runs at a fixed clock
   time every day. For an offline single-PC tool that's opened during
   the workday, that is a reasonable, honest reading of "automatic" — a
   true unattended scheduler needs a server or a desktop wrapper, which
   is out of scope for this browser-only build.
--------------------------------------------------------------------------- */
function checkAutoBackup() {
  const mode = DB.settings.auto_backup;
  if (!mode || mode === "off") return false;
  const intervalDays = mode === "weekly" ? 7 : 1;
  const last = DB.settings.last_auto_backup;
  const due = !last || (Date.now() - new Date(last).getTime()) >= intervalDays * 24 * 60 * 60 * 1000;
  if (!due) return false;
  _backupToFileRaw(true);
  DB.settings.last_auto_backup = new Date().toISOString();
  save();
  return true;
}

function restoreFromFile(file, cb) {
  if (!can("Settings", "Approve")) { cb(new Error("Your current role can't restore backups.")); return; }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed.assets || !parsed._seq) throw new Error("Not a valid PMMS backup file.");
      DB = parsed;
      if (!Array.isArray(DB.users)) DB.users = [];
      save();
      // The restored database may not contain the account currently
      // logged in on this tab — fall back to the login screen rather
      // than continue running as a "ghost" session.
      if (!currentUser()) { sessionStorage.removeItem(SESSION_KEY); }
      cb(null);
    } catch (e) {
      cb(e);
    }
  };
  reader.onerror = () => cb(new Error("Could not read file."));
  reader.readAsText(file);
}

function resetDatabase() {
  if (!can("Settings", "Approve")) { if (typeof toast === "function") toast("Your current role can't reset the database.", "error"); return; }
  DB = EMPTY_DB();
  seed();
  save();
  sessionStorage.removeItem(SESSION_KEY); // demo admin credentials are reset too — force a fresh login
}

// True clean slate for loading a real dataset — no demo assets, tasks,
// plans, work orders, breakdowns, or RCA cases. Foundational lookups
// (Maintenance Types, Frequencies) are kept, since every CSV importer
// matches against those by name and an import should have something to
// match against, not an empty list to fail against.
function startEmpty() {
  if (!can("Settings", "Approve")) { if (typeof toast === "function") toast("Your current role can't do this.", "error"); return; }
  DB = EMPTY_DB();
  seedReferenceData();
  save();
  sessionStorage.removeItem(SESSION_KEY); // demo admin credentials are reset too — force a fresh login
}

/* ---------------------------------------------------------------------------
   SEED DATA — enough to demonstrate every blueprint workflow end to end
--------------------------------------------------------------------------- */
function seed() {
  seedReferenceData();
  seedDemoContent();
}

// Foundational lookups every installation needs regardless of whether it's
// running the demo scenario or a real customer's own dataset — Maintenance
// Types and Frequencies in particular are referenced by name from every
// CSV importer (PM Tasks, PM Plans), so "Start Empty" keeps these instead
// of leaving a customer's import with nothing to match against.
function seedReferenceData() {
  DB.plants.push({ id: nextId("plants"), name: "Plant A" });
  DB.areas.push({ id: nextId("areas"), plant_id: 1, name: "Injection Area" });
  DB.areas.push({ id: nextId("areas"), plant_id: 1, name: "Utility Area" });
  DB.production_lines.push({ id: nextId("production_lines"), area_id: 1, name: "Injection Line 01" });
  DB.production_lines.push({ id: nextId("production_lines"), area_id: 2, name: "Utility Line" });

  DB.maintenance_types.push(
    { id: nextId("maintenance_types"), name: "Preventive" },
    { id: nextId("maintenance_types"), name: "Predictive" },
    { id: nextId("maintenance_types"), name: "Corrective" },
    { id: nextId("maintenance_types"), name: "Inspection" },
    { id: nextId("maintenance_types"), name: "Calibration" },
    { id: nextId("maintenance_types"), name: "Lubrication" },
    { id: nextId("maintenance_types"), name: "Cleaning" }
  );

  DB.frequencies.push(
    { id: nextId("frequencies"), name: "Daily", days: 1 },
    { id: nextId("frequencies"), name: "Weekly", days: 7 },
    { id: nextId("frequencies"), name: "Biweekly", days: 14 },
    { id: nextId("frequencies"), name: "Monthly", days: 30 },
    { id: nextId("frequencies"), name: "Quarterly", days: 90 },
    { id: nextId("frequencies"), name: "Semi Annual", days: 182 },
    { id: nextId("frequencies"), name: "Annual", days: 365 }
  );

  // Default Administrator account for a fresh install. Password is
  // "admin123" — hashed here with the same PBKDF2-SHA256 scheme
  // hashPassword() uses at runtime (precomputed offline so seeding stays
  // synchronous; salt/hash below are just data, not a shortcut around
  // the hashing itself). must_change_password prompts a change on first
  // login rather than leaving a well-known default password in place.
  DB.users.push({
    id: nextId("users"), username: "admin", name: "Administrator", role: "Administrator",
    active: true, password_salt: "246b66e38b5ab623576a18dca296cb7b",
    password_hash: "aeea13d0197899a0b894a929d56734ce05c104bc10428384b9a7d8ef6ca29ad2",
    must_change_password: true, created_at: new Date().toISOString(), last_login: null
  });
}

// The demo scenario's actual business content — assets, tasks, plans, and
// (via seedDemoHistory) the transactional history. Reset Database includes
// this; Start Empty deliberately does not.
function seedDemoContent() {
  DB.technicians.push(
    { id: nextId("technicians"), name: "Technician A", department: "Maintenance", skill: "Mechanical", certification: "-", status: "Active" },
    { id: nextId("technicians"), name: "Technician B", department: "Maintenance", skill: "Electrical", certification: "-", status: "Active" }
  );

  DB.spare_parts.push(
    { id: nextId("spare_parts"), code: "SP-001", name: "Hydraulic Oil", unit: "Liter", unit_cost: 85000 },
    { id: nextId("spare_parts"), code: "SP-002", name: "Hydraulic Hose", unit: "Pcs", unit_cost: 350000 }
  );

  DB.assets.push(
    { id: nextId("assets"), code: "M-001", name: "Injection Machine 01", category: "Injection", manufacturer: "-", model: "-", serial: "-", install_date: "2020-01-10", commission_date: "2020-02-01", location: "Injection Area", line_id: 1, criticality: "A", operating_hours: 0, operating_hours_per_day: 24, status: "Running", department: "Production", notes: "" },
    { id: nextId("assets"), code: "M-002", name: "Injection Machine 02", category: "Injection", manufacturer: "-", model: "-", serial: "-", install_date: "2020-03-10", commission_date: "2020-04-01", location: "Injection Area", line_id: 1, criticality: "A", operating_hours: 0, operating_hours_per_day: 24, status: "Running", department: "Production", notes: "" },
    { id: nextId("assets"), code: "M-003", name: "Cooling Tower 01", category: "Utility", manufacturer: "-", model: "-", serial: "-", install_date: "2019-06-01", commission_date: "2019-07-01", location: "Utility Area", line_id: 2, criticality: "B", operating_hours: 0, operating_hours_per_day: 24, status: "Running", department: "Utility", notes: "" },
    { id: nextId("assets"), code: "M-004", name: "Air Compressor 01", category: "Utility", manufacturer: "-", model: "-", serial: "-", install_date: "2019-06-01", commission_date: "2019-07-01", location: "Utility Area", line_id: 2, criticality: "A", operating_hours: 0, operating_hours_per_day: 24, status: "Running", department: "Utility", notes: "" },
    { id: nextId("assets"), code: "M-005", name: "Conveyor Line 01", category: "Material Handling", manufacturer: "-", model: "-", serial: "-", install_date: "2021-01-01", commission_date: "2021-02-01", location: "Injection Area", line_id: 1, criticality: "B", operating_hours: 0, operating_hours_per_day: 16, status: "Standby", department: "Production", notes: "" }
  );

  const t1 = insert("pm_tasks", {
    code: "PMT-001", asset_id: 1, description: "Hydraulic system inspection",
    maintenance_type_id: 1, frequency_id: 2,
    standard: "Pressure 100-120 bar, no leakage", method: "Visual + gauge reading",
    safety: "LOTO not required, visual only", est_duration: 30, manpower: 1,
    spare_part_id: null, qty: 0, unit: "", est_cost: 0,
    tools: "Pressure gauge", measurement_param: "Pressure (bar)",
    acceptance_criteria: "100-120 bar",
    checklist: [
      { item: "Check oil level", standard: "Within mark" },
      { item: "Check leakage", standard: "No leakage" },
      { item: "Check pressure", standard: "100-120 bar" }
    ]
  });

  const t2 = insert("pm_tasks", {
    code: "PMT-002", asset_id: 4, description: "Air compressor lubrication",
    maintenance_type_id: 6, frequency_id: 4,
    standard: "Per manufacturer spec", method: "Manual lubrication",
    safety: "Machine stopped, LOTO applied", est_duration: 20, manpower: 1,
    spare_part_id: 1, qty: 2, unit: "Liter", est_cost: 170000,
    tools: "Grease gun", measurement_param: "-", acceptance_criteria: "-",
    checklist: [
      { item: "Check lubricant level", standard: "Within mark" },
      { item: "Apply lubricant", standard: "Per spec" },
      { item: "Check for abnormal noise", standard: "No abnormal noise" }
    ]
  });

  const start = addDays(today(), -150);
  insert("pm_plans", { asset_id: 1, pm_task_id: t1.id, frequency_id: 2, start_date: start, active: true, last_generated: null });
  insert("pm_plans", { asset_id: 4, pm_task_id: t2.id, frequency_id: 4, start_date: start, active: true, last_generated: null });

  generateSchedule(30); // builds the full ~5-month history plus 30 days ahead
  seedDemoHistory();
}

/* ---------------------------------------------------------------------------
   DEMO HISTORY — so a fresh DEMO install shows a populated Dashboard,
   Analytics and RCA & Improvement instead of empty states. Everything
   below is built by calling the same functions the UI uses (submitExecution,
   createCorrectiveWorkOrder, progressRcaCase, etc.) so the resulting data
   is exactly as internally consistent as data created by a real user.
--------------------------------------------------------------------------- */
function seedDemoHistory() {
  const techIds = DB.technicians.map(t => t.id);
  const pastSchedules = [...DB.pm_schedules]
    .filter(s => s.due_date < today())
    .sort((a, b) => a.due_date.localeCompare(b.due_date));

  pastSchedules.forEach((sched, i) => {
    if (i % 7 === 6) return; // leave ~1 in 7 un-actioned so Overdue is realistically non-zero
    const tech = techIds[i % techIds.length];
    const wo = createWorkOrderFromSchedule(sched.id, tech, "Medium");
    const task = find("pm_tasks", sched.pm_task_id);
    const isAbnormal = i % 6 === 3;
    const checklist = (task.checklist || []).map((c, idx) => ({
      task: c.item,
      result: (isAbnormal && idx === 0) ? "Abnormal" : "Normal",
      note: (isAbnormal && idx === 0) ? "Found during routine check" : ""
    }));
    const spareUsage = (i % 5 === 0 && task.spare_part_id)
      ? [{ spare_part_id: task.spare_part_id, qty: task.qty || 1, cost: find("spare_parts", task.spare_part_id).unit_cost * (task.qty || 1) }]
      : [];

    _submitExecutionRaw(wo.id, {
      date: sched.due_date, start_time: "08:00", end_time: "08:30", technician_id: tech,
      checklist,
      finding: isAbnormal ? "Minor leakage observed at fitting during routine check." : "",
      severity: isAbnormal ? "Medium" : "",
      action: isAbnormal ? "Monitor and schedule seal replacement." : "",
      spareUsage, man_hours: 0.5
    });
    _closeWorkOrderRaw(wo.id);
  });

  // A couple of upcoming (future) schedules get rescheduled, so Reschedule
  // Analysis on the PM Analysis tab has something real to show.
  DB.pm_schedules.filter(s => s.due_date >= today()).slice(0, 2).forEach(s => {
    rescheduleSchedule(s.id, addDays(s.due_date, 4), "Production line still running — moved to next planned stop.");
  });

  // Breakdown history spread across ~5 months, feeding Breakdown Pareto,
  // Recurring Failures, Reliability trend, and Cost Analysis.
  const breakdownSeeds = [
    { assetIdx: 0, daysAgo: 140, mode: "Leakage", cause: "Fatigue / Age", failure: "Hydraulic hose leakage", downtime: 3, repair: 1.5 },
    { assetIdx: 3, daysAgo: 118, mode: "Overheating", cause: "Lack of Lubrication", failure: "Compressor overheating", downtime: 4, repair: 2 },
    { assetIdx: 0, daysAgo: 95, mode: "Leakage", cause: "Fatigue / Age", failure: "Hydraulic hose leakage (recurrence)", downtime: 2.5, repair: 1 },
    { assetIdx: 2, daysAgo: 80, mode: "Mechanical Wear", cause: "Inadequate Maintenance", failure: "Cooling tower fan bearing worn", downtime: 5, repair: 2.5 },
    { assetIdx: 4, daysAgo: 55, mode: "Electrical Fault", cause: "Unknown", failure: "Conveyor motor tripped", downtime: 1.5, repair: 0.5 },
    { assetIdx: 0, daysAgo: 30, mode: "Leakage", cause: "Fatigue / Age", failure: "Hydraulic hose leakage (3rd occurrence)", downtime: 3, repair: 1.5 },
    { assetIdx: 3, daysAgo: 12, mode: "Overheating", cause: "Lack of Lubrication", failure: "Compressor overheating (recurrence)", downtime: 2, repair: 1 }
  ];
  const bdIds = breakdownSeeds.map((b, i) => {
    const asset = DB.assets[b.assetIdx];
    const tech = techIds[i % techIds.length];
    const bd = insert("breakdowns", {
      asset_id: asset.id, date: addDays(today(), -b.daysAgo), failure: b.failure,
      failure_mode: b.mode, cause: b.cause, downtime_hours: b.downtime, repair_duration: b.repair,
      technician_id: tech, spare_part_id: 2, spare_cost: 0, action: "Repaired / replaced part.", status: "Closed"
    });
    const cost = find("spare_parts", 2).unit_cost;
    insert("maintenance_costs", { work_order_id: null, breakdown_id: bd.id, type: "Spare Part", amount: cost, date: bd.date });
    update("breakdowns", bd.id, { spare_cost: cost });
    return bd.id;
  });

  // RCA Case 1 — fully closed, showing the complete loop including its
  // supporting 5 Why / Fishbone / FMEA entries.
  const rca1 = createRcaCase({
    title: "Recurring Hydraulic Hose Leakage — M-001",
    asset_id: DB.assets[0].id,
    problem_statement: "Hydraulic hose on Injection Machine 01 has leaked three times in the last 5 months, causing repeated unplanned stops.",
    source_type: "Breakdown", source_id: bdIds[0]
  });
  addWhy(rca1.id, "Hose leaked at the fitting.");
  addWhy(rca1.id, "Seal material degraded faster than expected.");
  addWhy(rca1.id, "Operating temperature exceeds the seal's rated spec.");
  addWhy(rca1.id, "Wrong seal material was specified when the hose was last replaced.");
  addFishboneCause(rca1.id, "Machine", "Seal material rated below actual operating temperature");
  addFishboneCause(rca1.id, "Method", "No spec verification step during procurement/replacement");
  addFmeaRow(rca1.id, { failure_mode: "Hose seal failure", effect: "Unplanned downtime, oil spill risk", cause: "Seal spec mismatch", severity: 8, occurrence: 7, detection: 3 });
  progressRcaCase(rca1.id, "Investigation", { investigation_notes: "Inspected hose routing and seal; confirmed abrasion and heat degradation beyond spec." });
  progressRcaCase(rca1.id, "Root Cause", { root_cause: "Incorrect seal material specified for the machine's operating temperature range." });
  progressRcaCase(rca1.id, "Action Plan", { action_plan: "Replace all hydraulic seals on M-001 and M-002 with high-temperature-rated equivalents; update the spare part spec." });
  progressRcaCase(rca1.id, "Implementation", { implementation_notes: "Replaced seals on both injection machines with OEM high-temp seals.", implementation_date: addDays(today(), -10) });
  progressRcaCase(rca1.id, "Effectiveness Check", { effectiveness_result: "Effective", effectiveness_notes: "No recurrence after 10 days of monitoring." });
  progressRcaCase(rca1.id, "Standardization", { standardization_notes: "Updated PM Task spare part spec to require high-temp seal; added a spec check to incoming spare part inspection." });

  // RCA Case 2 — left in progress, so the module also shows an active,
  // partially-locked timeline rather than only a finished example.
  const rca2 = createRcaCase({
    title: "Compressor Overheating — M-004",
    asset_id: DB.assets[3].id,
    problem_statement: "Air Compressor 01 has overheated twice in the last 4 months, tripping on thermal protection.",
    source_type: "Breakdown", source_id: bdIds[1]
  });
  progressRcaCase(rca2.id, "Investigation", { investigation_notes: "Checked lubrication schedule and airflow clearance; found the lubrication interval was being missed intermittently." });
  addWhy(rca2.id, "Compressor overheated and tripped on thermal protection.");
  addWhy(rca2.id, "Internal friction increased from insufficient lubrication.");

  // Abnormalities generated above: drive one through the full corrective
  // loop to Closed (realistic history), leave another live at Corrective
  // Action (an actionable item waiting on a technician) so the module
  // isn't shown either fully empty or fully finished.
  const openAbnormalities = DB.abnormalities.filter(a => a.status === "Open");
  if (openAbnormalities[0]) {
    createCorrectiveWorkOrder(openAbnormalities[0].id, techIds[0], "High");
    // left at "Corrective Action" on purpose — an open, actionable item.
  }
  if (openAbnormalities[1]) {
    const { wo } = createCorrectiveWorkOrder(openAbnormalities[1].id, techIds[1], "Medium");
    _closeWorkOrderRaw(wo.id);
    progressAbnormality(openAbnormalities[1].id); // -> Repair
    progressAbnormality(openAbnormalities[1].id, "Re-inspected after repair; no further leakage after one week."); // -> Verification
    progressAbnormality(openAbnormalities[1].id); // -> Closed
  }

  refreshOverdueStatuses();
  save();
}

load();
