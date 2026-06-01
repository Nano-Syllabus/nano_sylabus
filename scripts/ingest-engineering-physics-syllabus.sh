#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

DOC_JSON="data/syllabus/prepared/documents.engineering.physics-sh402-syllabus.json"
DOC_TITLE="Engineering Physics SH 402 Syllabus (BE ECE)"

echo "Validating manifest..."
npm run ingest:syllabus -- "$DOC_JSON" --validate-only

echo "Removing previous SH402 syllabus document (if any)..."
node --env-file=.env.local - <<'NODE'
const { createClient } = require("@supabase/supabase-js");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const title = "Engineering Physics SH 402 Syllabus (BE ECE)";
  const { error } = await sb
    .from("knowledge_documents")
    .delete()
    .eq("title", title)
    .eq("board", "Engineering")
    .eq("grade", "Bachelor")
    .eq("subject", "Engineering Physics");
  if (error) throw error;
  console.log("previous syllabus docs cleared");
})();
NODE

echo "Ingesting syllabus (chunks + embeddings)..."
node --env-file=.env.local scripts/ingest-syllabus.mjs "$DOC_JSON"

echo "Linking new document to Engineering Physics notebook..."
node --env-file=.env.local - <<'NODE'
const { createClient } = require("@supabase/supabase-js");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const title = "Engineering Physics SH 402 Syllabus (BE ECE)";
  const { data: notebook, error: nErr } = await sb
    .from("knowledge_notebooks")
    .select("id")
    .eq("board", "Engineering")
    .eq("level", "Bachelor")
    .eq("subject", "Engineering Physics")
    .limit(1)
    .maybeSingle();

  if (nErr) throw nErr;
  if (!notebook?.id) throw new Error("Engineering Physics notebook not found.");

  const { error: uErr } = await sb
    .from("knowledge_documents")
    .update({ notebook_id: notebook.id })
    .eq("title", title)
    .eq("board", "Engineering")
    .eq("grade", "Bachelor")
    .eq("subject", "Engineering Physics");

  if (uErr) throw uErr;

  const { data: docs, error: dErr } = await sb
    .from("knowledge_documents")
    .select("id,title,notebook_id,uploaded_at")
    .eq("title", title)
    .order("uploaded_at", { ascending: false })
    .limit(1);

  if (dErr) throw dErr;
  const doc = docs?.[0];
  if (!doc) throw new Error("Inserted document not found.");

  const { count, error: cErr } = await sb
    .from("knowledge_chunks")
    .select("*", { count: "exact", head: true })
    .eq("document_id", doc.id);

  if (cErr) throw cErr;
  console.log(JSON.stringify({ ok: true, documentId: doc.id, chunkCount: count || 0, notebookId: doc.notebook_id }, null, 2));
})();
NODE

echo "Done."
