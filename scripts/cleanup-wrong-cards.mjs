import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanup() {
  // Delete all non-Physics topic cards that were wrongly inserted
  const { data, error } = await supabase
    .from("topic_cards")
    .delete()
    .neq("subject", "Engineering Physics")
    .select("id, subject, topic");

  if (error) {
    console.error("Delete error:", error);
  } else {
    console.log(`Deleted ${data.length} wrong cards (non-Physics).`);
    data.forEach(c => console.log(`  - [${c.subject}] ${c.topic}`));
  }
}

cleanup();
