# Syllabus Ingest Format

Use this format for real syllabus content ingestion with:

```bash
npm run ingest:syllabus -- <path-to-documents.json>
```

The input file must be a JSON array.

## Required fields per document

- `board`
- `grade`
- `subject`
- `title`
- `sourceName`
- `sourceType`
- `content`

## Optional fields

- `chapter`
- `topic`
- `contentFile` (path to UTF-8 text file, relative to the JSON file)

## Exact JSON shape

```json
[
  {
    "board": "NEB",
    "grade": "Class 11",
    "subject": "Physics",
    "chapter": "Current Electricity",
    "topic": "Ohm's Law",
    "title": "NEB Class 11 Physics - Current Electricity",
    "sourceName": "Official syllabus or textbook source",
    "sourceType": "pdf",
    "content": "Full clean text extracted from the real syllabus or official textbook chapter."
  }
]
```

## Notes

- Use real extracted text only.
- Keep one document object per syllabus unit or source file.
- `content` should be plain text, not binary PDF data.
- You can use either inline `content` or `contentFile`.
- The ingestion script will chunk the text and generate Gemini embeddings automatically.
- Because the app now uses Gemini embeddings, old knowledge chunks created with OpenAI embeddings should be replaced by re-ingesting the source content with Gemini.

## Useful flags

- `--validate-only`: validate manifest and source files without writing DB rows.
- `--replace-scope`: delete existing `knowledge_documents` in each `(board, grade, subject)` scope before ingesting.
- `--strict-class11-core`: enforce NEB Class 11 has all four subjects: English, Physics, Chemistry, Mathematics.

## Recommended source prep

1. Extract text from the official PDF or DOCX.
2. Clean headers, page numbers, and repeated footer text.
3. Preserve academic structure in the text where possible.
4. Split large sources into meaningful units by subject or chapter.
