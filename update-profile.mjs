import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1];
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1];
const supabase = createClient(url, key);
const { data, error } = await supabase
  .from("student_profiles")
  .update({ board: 'IOE', grade: 'Undergraduate', subjects: [] })
  .neq('user_id', '00000000-0000-0000-0000-000000000000');
console.log(error || "Success");
