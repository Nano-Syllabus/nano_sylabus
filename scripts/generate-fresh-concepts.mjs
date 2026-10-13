// Generate and verify a real lesson through the configured generation service.
// node --env-file=.env scripts/generate-fresh-concepts.mjs <reset-backup-directory>
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import https from "node:https";
import http from "node:http";
import { createClient } from "@supabase/supabase-js";
import { CONCEPT_READING_VERSION } from "../lib/concept-reading-version.ts";
import { parseConceptActivity } from "../lib/concept-activities.ts";

const directory = process.argv[2];
if (!directory) throw new Error("Pass the reset backup directory.");
const topics = JSON.parse(await readFile(path.join(directory, "topics.json"), "utf8"));
const topic = topics.find((r) => /number systems/i.test(r.topic_title)) || topics[0];
if (!topic) throw new Error("No previously cached topic was found.");
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const { data: teacher, error } = await db
  .from("teachers")
  .select("collection_sk")
  .eq("id", topic.teacher_id)
  .single();
if (error || !teacher?.collection_sk) throw new Error("The topic's collection key is unavailable.");
const url = new URL("/v1/collection/challenge/learn", process.env.TENANT_API_BASE_URL);
const bytes = Buffer.from(
  JSON.stringify({ subject: topic.subject_name, topics: [topic.topic_key] }),
);
console.log(JSON.stringify({ generating: topic.topic_title, subject: topic.subject_name }));
const response = await new Promise((resolve, reject) => {
  const req = (url.protocol === "https:" ? https : http).request(
    url,
    {
      method: "POST",
      agent: false,
      rejectUnauthorized: process.env.TENANT_API_REJECT_UNAUTHORIZED === "1",
      headers: {
        Authorization: `Bearer ${teacher.collection_sk}`,
        "Content-Type": "application/json",
        "Content-Length": bytes.length,
      },
    },
    (res) => {
      const chunks = [];
      res.on("data", (part) => chunks.push(part));
      res.on("end", () => {
        if (res.statusCode >= 400)
          return reject(new Error(`Generation returned HTTP ${res.statusCode}`));
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString()));
        } catch {
          reject(new Error("Invalid generation response"));
        }
      });
    },
  );
  req.setTimeout(240000, () => req.destroy(new Error("Generation timed out")));
  req.on("error", reject);
  req.end(bytes);
});
await writeFile(path.join(directory, "fresh-reading.json"), JSON.stringify(response), {
  mode: 0o600,
});
const reading = response.reading;
const payloads = [
  ...String(reading?.content || "").matchAll(/```concept-activity\s*\n([\s\S]*?)\n```/g),
];
const activities = payloads.map((match) => parseConceptActivity(match[1]));
if (
  reading?.content_version !== CONCEPT_READING_VERSION ||
  !activities.length ||
  activities.some((a) => !a)
)
  throw new Error("The new reading did not pass the native activity contract.");
console.log(
  JSON.stringify({
    version: reading.content_version,
    servedFrom: response.served_from,
    sections: reading.steps?.length,
    activities: activities.map((a) => a.kind),
    output: path.join(directory, "fresh-reading.json"),
  }),
);
