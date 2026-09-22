#!/usr/bin/env node
/**
 * PMMS backup-to-SQLite converter
 * -------------------------------
 * Converts a PMMS "Backup Now" JSON file into a real SQLite database file
 * (.sqlite), so the data can be opened, queried, and eventually built upon
 * outside the browser — with any standard SQLite tool (DB Browser for
 * SQLite, the `sqlite3` CLI, DBeaver, etc.) or from a future desktop
 * rewrite of PMMS itself.
 *
 * Usage:
 *   node backup-to-sqlite.js PMMS_Backup_2026-09-18.json [output.sqlite]
 *
 * Design notes (read this before treating the output as a "real" schema):
 *
 * - This is a GENERIC converter, not a hand-normalized relational design.
 *   Each top-level array in the backup (assets, work_orders, breakdowns,
 *   ...) becomes one SQLite table with the same name. Columns are
 *   inferred from the union of keys seen across that table's rows, so
 *   every table stays close to what PMMS itself already stores.
 *
 * - A few PMMS fields are themselves nested JSON (an array or object) —
 *   e.g. pm_tasks.checklist, abnormalities.effectiveness_log. Rather than
 *   inventing a separate child table + foreign key for each one (which
 *   would need per-table hand-tuning, not a generic script), those
 *   columns are stored as TEXT containing the original JSON. SQLite's
 *   built-in json_extract()/json_each() functions can query them
 *   directly without a schema change:
 *       SELECT id, json_extract(checklist, '$[0].item') FROM pm_tasks;
 *   Treat this as a reasonable, working starting point — a hand-designed
 *   schema that splits these into real child tables is the natural next
 *   step for a proper desktop rewrite, not something this generic script
 *   can safely guess on your behalf.
 *
 * - `settings` (a single object, not an array of rows) becomes a
 *   one-row `settings` table. `_seq` (PMMS's internal ID counters) is
 *   carried over as-is into a `_seq` table so a future importer can keep
 *   assigning IDs without collisions if it ever needs to.
 *
 * - Column typing is intentionally simple: INTEGER if every non-null
 *   value seen for that column is a whole number, REAL if every value is
 *   numeric but at least one has a decimal, otherwise TEXT (this also
 *   covers the JSON-nested columns described above, and plain strings).
 *   This mirrors how PMMS itself has no fixed schema today (it's a
 *   loosely-typed JSON document store) — moving to strict typed columns
 *   is, again, a good next step for a hand-designed schema, not something
 *   a generic converter should force.
 */

const fs = require("fs");
const path = require("path");
const initSqlJs = require("sql.js");

function inferColumnType(values) {
  const nonNull = values.filter(v => v !== null && v !== undefined);
  if (nonNull.length === 0) return "TEXT";
  const allNumeric = nonNull.every(v => typeof v === "number" || (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v)) && typeof v !== "boolean"));
  if (nonNull.every(v => typeof v === "boolean")) return "INTEGER"; // booleans stored as 0/1
  if (allNumeric && nonNull.every(v => typeof v === "number")) {
    return nonNull.every(v => Number.isInteger(v)) ? "INTEGER" : "REAL";
  }
  return "TEXT";
}

function normalizeValue(v) {
  if (v === undefined) return null;
  if (v === null) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "object") return JSON.stringify(v); // nested array/object -> JSON text column
  return v;
}

function quoteIdent(name) {
  return `"${name.replace(/"/g, '""')}"`;
}

function createTableFromRows(db, tableName, rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    console.log(`  - ${tableName}: 0 rows, skipped (no columns to infer)`);
    return;
  }
  const columns = [...new Set(rows.flatMap(r => Object.keys(r)))];
  const columnTypes = {};
  columns.forEach(col => {
    columnTypes[col] = inferColumnType(rows.map(r => r[col]));
  });

  const colDefs = columns.map(c => `${quoteIdent(c)} ${columnTypes[c]}`).join(", ");
  db.run(`DROP TABLE IF EXISTS ${quoteIdent(tableName)};`);
  db.run(`CREATE TABLE ${quoteIdent(tableName)} (${colDefs});`);

  const placeholders = columns.map(() => "?").join(", ");
  const insertSql = `INSERT INTO ${quoteIdent(tableName)} (${columns.map(quoteIdent).join(", ")}) VALUES (${placeholders});`;
  const stmt = db.prepare(insertSql);
  rows.forEach(row => {
    stmt.run(columns.map(c => normalizeValue(row[c])));
  });
  stmt.free();
  console.log(`  - ${tableName}: ${rows.length} row(s), ${columns.length} column(s)`);
}

function createSettingsTable(db, settings) {
  if (!settings || typeof settings !== "object") return;
  createTableFromRows(db, "settings", [settings]);
}

function createSeqTable(db, seq) {
  if (!seq || typeof seq !== "object") return;
  const rows = Object.entries(seq).map(([table_name, last_id]) => ({ table_name, last_id }));
  createTableFromRows(db, "_seq", rows);
}

async function main() {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3] || inputPath.replace(/\.json$/i, "") + ".sqlite";

  if (!inputPath) {
    console.error("Usage: node backup-to-sqlite.js <PMMS backup .json> [output.sqlite]");
    process.exit(1);
  }
  if (!fs.existsSync(inputPath)) {
    console.error(`File not found: ${inputPath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(inputPath, "utf-8");
  let backup;
  try {
    backup = JSON.parse(raw);
  } catch (e) {
    console.error("This doesn't look like valid JSON:", e.message);
    process.exit(1);
  }
  if (!backup.assets || !backup._seq) {
    console.error("This doesn't look like a PMMS backup file (missing 'assets' or '_seq').");
    process.exit(1);
  }

  const SQL = await initSqlJs();
  const db = new SQL.Database();

  console.log(`Converting ${inputPath} ...`);
  Object.entries(backup).forEach(([key, value]) => {
    if (key === "settings") { createSettingsTable(db, value); return; }
    if (key === "_seq") { createSeqTable(db, value); return; }
    if (key === "version") { return; } // schema version number, not a table
    if (Array.isArray(value)) { createTableFromRows(db, key, value); return; }
    console.log(`  - ${key}: skipped (not an array, object, or recognized special key)`);
  });

  const data = db.export();
  fs.writeFileSync(outputPath, Buffer.from(data));
  console.log(`\nDone. Wrote ${outputPath} (${(data.length / 1024).toFixed(1)} KB).`);
  console.log(`Open it with any SQLite tool, e.g.: sqlite3 ${path.basename(outputPath)}`);
}

main();
