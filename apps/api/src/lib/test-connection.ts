import { supabase } from "./supabase";

const { error } = await supabase.rpc("version");

if (error && error.code !== "42883") {
  console.error("❌ Connection failed:", error.message);
  process.exit(1);
}

console.log("✅ Supabase connected —", process.env.SUPABASE_URL);
