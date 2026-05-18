const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

type SupportedUploadKind = "pdf" | "docx" | "text";

export interface UploadedKnowledgeContent {
  rawContent: string;
  sourceType: string;
  sourceName: string;
  suggestedTitle: string;
}

function normalizeExtractedText(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function deriveKnowledgeTitleFromFilename(filename: string) {
  const base = filename.trim().replace(/\.[^.]+$/, "");
  const cleaned = base.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return cleaned || "Untitled document";
}

export function detectKnowledgeUploadKind(filename: string, mimeType: string) {
  const lowerFilename = filename.trim().toLowerCase();
  const lowerMime = mimeType.trim().toLowerCase();

  if (lowerFilename.endsWith(".pdf") || lowerMime === "application/pdf") {
    return {
      kind: "pdf" as SupportedUploadKind,
      sourceType: "pdf",
    };
  }

  if (
    lowerFilename.endsWith(".docx") ||
    lowerMime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return {
      kind: "docx" as SupportedUploadKind,
      sourceType: "docx",
    };
  }

  if (
    lowerFilename.endsWith(".txt") ||
    lowerFilename.endsWith(".md") ||
    lowerFilename.endsWith(".markdown") ||
    lowerMime.startsWith("text/")
  ) {
    return {
      kind: "text" as SupportedUploadKind,
      sourceType: lowerFilename.endsWith(".md") || lowerFilename.endsWith(".markdown") ? "markdown" : "text",
    };
  }

  throw new Error("Unsupported file type. Upload PDF, DOCX, TXT, or Markdown files.");
}

export async function extractKnowledgeFileContent(file: File): Promise<UploadedKnowledgeContent> {
  if (!file.name.trim()) {
    throw new Error("Uploaded file is missing a filename.");
  }

  if (file.size <= 0) {
    throw new Error("Uploaded file is empty.");
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("Uploaded file is too large. Keep files under 15 MB.");
  }

  const { kind, sourceType } = detectKnowledgeUploadKind(file.name, file.type);
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  let rawContent = "";

  if (kind === "pdf") {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      rawContent = result.text;
    } finally {
      await parser.destroy();
    }
  } else if (kind === "docx") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    rawContent = result.value;
  } else {
    rawContent = new TextDecoder("utf-8").decode(arrayBuffer);
  }

  const normalized = normalizeExtractedText(rawContent);
  if (!normalized) {
    throw new Error("No readable text could be extracted from this file.");
  }

  return {
    rawContent: normalized,
    sourceType,
    sourceName: file.name.trim(),
    suggestedTitle: deriveKnowledgeTitleFromFilename(file.name),
  };
}
