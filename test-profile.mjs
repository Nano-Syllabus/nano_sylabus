import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1];
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1];
const supabase = createClient(url, key);
const { data } = await supabase.from("student_profiles").select("*").limit(5);
console.log(data);
