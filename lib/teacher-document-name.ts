/**
 * Renaming a creator's document: what it is called, never where it lives.
 *
 * The collection API keeps every document at the path it was uploaded to — its
 * id, its chunks, its embeddings and the collection index are all keyed on that
 * path — and records a rename beside it instead, so nothing is re-indexed. These
 * are the rules it applies to a new name, mirrored here so the workspace can
 * refuse a bad name without a round trip and show the name the API will store
 * the moment the creator presses Enter. The API stays the authority: whatever
 * name it answers with is the one the workspace keeps.
 *
 * Keep in step with `clean_document_name` in the backend's
 * `rag_service/document_names.py`.
 */

export const TEACHER_DOCUMENT_NAME_MAX = 150;

// C0, DEL and C1 — Python's "Cc" category, which the API refuses.
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F-\u009F]/;
// Characters that reorder how a name is DISPLAYED ("notes<RLO>fdp.exe" reads as a
// PDF). Not every format character: Devanagari spells conjuncts with the zero-width
// joiners, and a Nepali title has to be nameable.
const BIDI_CONTROLS = /[\u202A-\u202E\u2066-\u2069]/;

/** ".pdf" for "Unit 1.pdf"; "" for a name with no extension or only a leading dot. */
export function documentExtension(name: string) {
  const base = name.split("/").pop() || "";
  const dot = base.lastIndexOf(".");
  return dot > 0 && dot < base.length - 1 ? base.slice(dot) : "";
}

/** The part of a name a creator edits — everything before the extension. */
export function documentStem(name: string) {
  const extension = documentExtension(name);
  return extension ? name.slice(0, -extension.length) : name;
}

export type DocumentNameResult =
  | { name: string; error?: undefined }
  | { name?: undefined; error: string };

/**
 * The name a file will be shown under, from what a creator typed.
 *
 * Whitespace runs collapse and the ends are trimmed. The file keeps its own
 * extension whatever was typed — for a `.pdf`, "Unit 1 notes" and
 * "Unit 1 notes.PDF" both become "Unit 1 notes.pdf" — because the preview, the
 * download and every type guess downstream go by it. `currentName` is where the
 * extension comes from; pass "" when it is not known and the API will add it.
 */
export function cleanDocumentName(typed: unknown, currentName: string): DocumentNameResult {
  if (typeof typed !== "string") return { error: "Enter a name for the file." };
  const name = typed.split(/\s+/).filter(Boolean).join(" ");
  if (/[\\/]/.test(name) || CONTROL_CHARACTERS.test(name) || BIDI_CONTROLS.test(name)) {
    return { error: "A file name cannot contain slashes or control characters." };
  }
  const extension = documentExtension(currentName);
  const stem =
    extension && name.toLowerCase().endsWith(extension.toLowerCase())
      ? name.slice(0, -extension.length).trimEnd()
      : name;
  if (!stem.replace(/^[ .]+|[ .]+$/g, "")) return { error: "Enter a name for the file." };
  const cleaned = `${stem}${extension}`;
  // Code points, not UTF-16 units, so the limit is the one the API counts.
  if ([...cleaned].length > TEACHER_DOCUMENT_NAME_MAX) {
    return { error: `Keep the name to ${TEACHER_DOCUMENT_NAME_MAX} characters or fewer.` };
  }
  return { name: cleaned };
}

type RenamableWorkspace = {
  documents: { path: string; name: string }[];
  sourceTree: Record<string, unknown>;
};

/**
 * The workspace with one file shown under a new name — in the document list and
 * in the source tree, the two places it is named.
 *
 * A write patches what is already on screen rather than asking for the
 * workspace again (the cache-first rule): the rename's own response says
 * everything there is to know, and a refetch would only be told it.
 */
export function withRenamedDocument<W extends RenamableWorkspace>(
  workspace: W,
  path: string,
  name: string,
): W {
  const rename = (node: unknown): unknown => {
    if (!node || typeof node !== "object") return node;
    const record = node as Record<string, unknown>;
    if (record.type === "file") return record.path === path ? { ...record, name } : record;
    return Array.isArray(record.children)
      ? { ...record, children: record.children.map(rename) }
      : record;
  };
  const tree = workspace.sourceTree.tree;
  return {
    ...workspace,
    documents: workspace.documents.map((document) =>
      document.path === path ? { ...document, name } : document,
    ),
    sourceTree: Array.isArray(tree)
      ? { ...workspace.sourceTree, tree: tree.map(rename) }
      : workspace.sourceTree,
  };
}
