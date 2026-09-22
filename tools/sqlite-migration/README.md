# PMMS → SQLite migration tool

Converts a PMMS "Backup Now" JSON file into a real, queryable SQLite
database file. See `PMMS_SQLite_Migration_Guide.docx` for the full
explanation, the reasoning behind the design choices this script makes,
and what it does *not* do (it is a data-format conversion, not a
rewrite of PMMS itself into a SQLite-backed app).

## Setup (one time)

```bash
cd tools/sqlite-migration
npm install
```

## Usage

```bash
node backup-to-sqlite.js path/to/PMMS_Backup_2026-09-18.json [output.sqlite]
```

If you omit the output path, it writes next to the input file with a
`.sqlite` extension. Open the result with any standard SQLite tool —
the `sqlite3` command-line client, DB Browser for SQLite, DBeaver, etc.
