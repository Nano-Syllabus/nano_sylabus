#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/sumangiri/Desktop/padhai"
cd "$ROOT"

PDF="/Users/sumangiri/Desktop/Measurement Systems Application Design.pdf"
OUT="data/syllabus/prepared/measurement-systems-application-design.fullocr.txt"
CACHE="data/syllabus/prepared/measurement-systems-application-design.pages.json"
MANIFEST="data/syllabus/prepared/documents.engineering.measurement-systems.fullocr.json"
TITLE="Measurement Systems Application and Design (Doebelin)"

npm run extract:scanned:pdf -- \
  --pdf="$PDF" \
  --out="$OUT" \
  --pageCache="$CACHE" \
  --renderWidth=980 \
  --retries=4 \
  --timeoutMs=30000

cat > "$MANIFEST" <<'JSON'
[
  {
    "board": "Engineering",
    "grade": "Bachelor",
    "subject": "Measurement Systems",
    "chapter": "Measurement Systems Application and Design",
    "topic": "Full OCR Text",
    "title": "Measurement Systems Application and Design (Doebelin)",
    "sourceName": "Measurement Systems Application Design.pdf",
    "sourceType": "pdf",
    "contentFile": "measurement-systems-application-design.fullocr.txt"
  }
]
JSON

node --env-file=.env.local - <<'NODE'
const { createClient } = require('@supabase/supabase-js');
(async()=>{
  const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
  const title='Measurement Systems Application and Design (Doebelin)';
  const {data,error}=await sb.from('knowledge_documents').select('id').eq('title',title);
  if(error) throw new Error(error.message);
  for(const doc of data||[]){
    await sb.from('knowledge_chunks').delete().eq('document_id',doc.id);
    await sb.from('knowledge_documents').delete().eq('id',doc.id);
  }
  console.log('Cleared prior document rows:', (data||[]).length);
})();
NODE

INGEST_CHUNK_SIZE=2600 \
INGEST_CHUNK_OVERLAP=260 \
GEMINI_EMBEDDING_MODEL=gemini-embedding-2 \
GEMINI_EMBED_DELAY_MS=700 \
GEMINI_EMBED_RETRIES=8 \
GEMINI_EMBED_RETRY_DELAY_MS=800 \
node --env-file=.env.local scripts/ingest-syllabus.mjs "$MANIFEST"

node --env-file=.env.local - <<'NODE'
const { createClient } = require('@supabase/supabase-js');
(async()=>{
  const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
  const title='Measurement Systems Application and Design (Doebelin)';
  const { data: docs, error: dErr } = await sb.from('knowledge_documents').select('id').eq('title', title).limit(1);
  if (dErr) throw new Error(dErr.message);
  if (!docs?.length) throw new Error('Document not found after ingest');
  const docId = docs[0].id;

  const notebookTitle='Measurement Systems Application and Design';
  let notebookId=null;
  const {data:nb,error:nErr}=await sb.from('knowledge_notebooks').select('id').eq('title',notebookTitle).limit(1);
  if(nErr) throw new Error(nErr.message);
  if(nb?.length){ notebookId=nb[0].id; }
  else {
    const {data:newNb,error:cErr}=await sb.from('knowledge_notebooks').insert({
      title:notebookTitle,
      board:'Engineering',
      level:'Bachelor',
      faculty:'Instrumentation',
      subject:'Measurement Systems',
      curriculum:'Measurement Systems Application and Design',
      description:'Full OCR ingest from Measurement Systems Application Design.pdf',
    }).select('id').single();
    if(cErr || !newNb) throw new Error(cErr?.message || 'Notebook create failed');
    notebookId=newNb.id;
  }

  const {count, error:countErr}=await sb.from('knowledge_chunks').select('*',{count:'exact',head:true}).eq('document_id',docId);
  if(countErr) throw new Error(countErr.message);

  await sb.from('knowledge_documents').update({
    notebook_id:notebookId,
    board:'Engineering',
    grade:'Bachelor',
    faculty:'Instrumentation',
    curriculum:'Measurement Systems Application and Design',
    subject:'Measurement Systems',
    chapter:'Measurement Systems Application and Design',
    chunk_count:count||0,
    processing_status:'ready',
    processing_error:null,
    updated_at:new Date().toISOString(),
  }).eq('id',docId);

  await sb.from('knowledge_chunks').update({
    board:'Engineering',
    grade:'Bachelor',
    subject:'Measurement Systems',
    chapter:'Measurement Systems Application and Design',
  }).eq('document_id',docId);

  console.log(JSON.stringify({ok:true,docId,notebookId,chunkCount:count||0},null,2));
})();
NODE

echo "PIPELINE_DONE"
