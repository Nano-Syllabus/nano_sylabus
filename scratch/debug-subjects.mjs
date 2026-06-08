import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { count, error } = await supabase
    .from("knowledge_chunks")
    .select("*", { count: 'exact', head: true })
    .eq("subject", "Engineering Physics");
    
  console.log("Error:", error);
  console.log("Total Engineering Physics chunks:", count);
}

main();
