import postgres from "postgres";
import { readFileSync } from "fs";
import { join } from "path";

const sql = postgres(process.env.DATABASE_URL!, { ssl: "require", max: 1 });

const migration = readFileSync(
  join(import.meta.dir, "../../../../supabase/migrations/001_initial_schema.sql"),
  "utf8"
);

console.log("Running migration…");
await sql.unsafe(migration);
console.log("✅ Schema applied successfully");

await sql.end();
