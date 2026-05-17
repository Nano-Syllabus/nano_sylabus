## Real Syllabus Drop Zone

Place only official source material here for RAG ingestion.

Recommended structure:

- `raw/` for original PDFs or DOCX files
- `prepared/` for cleaned JSON files that match the ingest format

Quick NEB Class 11/12 starter:

- Copy template:
  - `data/syllabus/prepared/neb-11-12-documents.template.json`
- Replace every `REPLACE_WITH_CLEAN_EXTRACTED_TEXT` with real extracted text from official PDFs.
- Save as:
  - `data/syllabus/prepared/documents.json`

Then run ingestion:

```bash
npm run ingest:syllabus -- data/syllabus/prepared/documents.json
```

Class 11 core (English + Physics + Chemistry + Mathematics):

1. Put extracted plain-text files in `data/syllabus/prepared/`:
   - `neb-grade-11-compulsory-english-book.txt`
   - `neb-grade-11-physics-book.txt`
   - `neb-grade-11-chemistry-book.txt`
   - `neb-grade-11-mathematics-book.txt`
2. Validate the full manifest:
   - `npm run validate:class11:core:manifest`
3. Ingest with scope replacement:
   - `npm run ingest:class11:core`

Rules:

- Use only real official syllabus or textbook material.
- Do not place mock content here.
- Keep one JSON document per meaningful syllabus unit or chapter where possible.
- Do not ingest the template file directly without replacing placeholder content.
