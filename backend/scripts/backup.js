// A copy of every Supabase table on this computer, because Supabase's free plan keeps no backups. Each run makes a
// folder backend/private/backups/<fecha>/ (git-ignored: it has accounts, emails and Trivia's private questions, and the
// repo is public) with one <tabla>.json per table and a resumen.json with how many rows each one had. It only reads:
// nothing in Supabase changes. Bring a table back with scripts/restore.js.
//
//   npm run db:backup --prefix backend
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const { getSupabase, supabaseEnabled } = await import("../src/db/store.js");
const { BACKUP_TABLES, BACKUPS_DIR } = await import("./backupTables.js");

if (!supabaseEnabled()) {
  console.error("Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en backend/.env.");
  process.exit(1);
}

const db = getSupabase();
const stamp = new Date().toISOString().slice(0, 16).replace("T", "_").replace(":", "-");
const dir = path.join(BACKUPS_DIR, stamp);
fs.mkdirSync(dir, { recursive: true });

const summary = { hecha: new Date().toISOString(), tablas: {} };
let failed = false;
for (const { table, key } of BACKUP_TABLES) {
  const rows = [];
  try {
    for (let from = 0; ; from += 1000) {
      let query = db.from(table).select("*");
      for (const column of key) query = query.order(column);
      const { data, error } = await query.range(from, from + 999);
      if (error) throw new Error(error.message);
      rows.push(...data);
      if (data.length < 1000) break;
    }
  } catch (err) {
    console.error(`  ${table}: no se pudo copiar (${err.message})`);
    summary.tablas[table] = { error: err.message };
    failed = true;
    continue;
  }
  fs.writeFileSync(path.join(dir, `${table}.json`), JSON.stringify(rows));
  summary.tablas[table] = { filas: rows.length };
  console.log(`  ${table}: ${rows.length} filas`);
}
fs.writeFileSync(path.join(dir, "resumen.json"), JSON.stringify(summary, null, 2));
console.log(`\nCopia guardada en ${path.relative(process.cwd(), dir)}${failed ? " (con tablas que fallaron, mira arriba)" : ""}.`);
process.exit(failed ? 1 : 0);
