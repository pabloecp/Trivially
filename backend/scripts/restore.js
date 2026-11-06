// Brings one table back from a copy made with scripts/backup.js: every row of the copy is written again (by its primary
// key), so rows that were deleted or changed since come back as they were. Rows added after the copy are left alone:
// nothing is deleted. Without --confirmar it only says what it would do.
//
//   npm run db:restore --prefix backend -- <carpeta de la copia> <tabla>              (solo revisa)
//   npm run db:restore --prefix backend -- <carpeta de la copia> <tabla> --confirmar  (escribe en Supabase)
//
// Stop the server first (Railway) when restoring `users`: a running server keeps its own accounts in memory and would
// write over the restored ones.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const { getSupabase, supabaseEnabled } = await import("../src/db/store.js");
const { BACKUP_TABLES, BACKUPS_DIR } = await import("./backupTables.js");

const [folder, table] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const confirmed = process.argv.includes("--confirmar");
const spec = BACKUP_TABLES.find((t) => t.table === table);
if (!folder || !spec) {
  console.error(`Uso: npm run db:restore --prefix backend -- <carpeta> <tabla> [--confirmar]\nTablas: ${BACKUP_TABLES.map((t) => t.table).join(", ")}`);
  process.exit(1);
}
const dir = fs.existsSync(folder) ? folder : path.join(BACKUPS_DIR, folder);
const file = path.join(dir, `${table}.json`);
if (!fs.existsSync(file)) {
  console.error(`No existe ${file}.`);
  process.exit(1);
}
// Before the accounts had their own columns, users.role and users.username were generated from `data` and Supabase
// rejects writing them: a table like that gets the rows without them (they come back from `data` by themselves).
const GENERATED = { users: ["role", "username"] };
let rows = JSON.parse(fs.readFileSync(file, "utf8"));
const withoutGenerated = (list) => list.map((row) => {
  const copy = { ...row };
  for (const column of GENERATED[table] || []) delete copy[column];
  return copy;
});
console.log(`${rows.length} filas de ${table} en la copia ${path.basename(dir)}.`);
if (!confirmed) {
  console.log("Solo revisé el archivo. Para escribirlas en Supabase, repite el comando con --confirmar.");
  process.exit(0);
}
if (!supabaseEnabled()) {
  console.error("Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en backend/.env.");
  process.exit(1);
}
const db = getSupabase();
for (let i = 0; i < rows.length; i += 500) {
  let { error } = await db.from(table).upsert(rows.slice(i, i + 500), { onConflict: spec.key.join(",") });
  if (error && GENERATED[table] && /generated|non-DEFAULT/i.test(error.message)) {
    rows = withoutGenerated(rows);
    ({ error } = await db.from(table).upsert(rows.slice(i, i + 500), { onConflict: spec.key.join(",") }));
  }
  if (error) {
    console.error(`Falló en las filas ${i + 1}-${Math.min(i + 500, rows.length)}: ${error.message}`);
    process.exit(1);
  }
}
console.log(`${rows.length} filas escritas en ${table}.`);
