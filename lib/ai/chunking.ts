export interface ChunkedText {
  chunkIndex: number;
  content: string;
}

const CHUNK_TARGET_LENGTH = 1200;
const CHUNK_MIN_LENGTH = 350;

function splitLongParagraph(paragraph: string) {
  const pieces: string[] = [];
  let remaining = paragraph.trim();

  while (remaining.length > CHUNK_TARGET_LENGTH) {
    const boundary =
      remaining.lastIndexOf(". ", CHUNK_TARGET_LENGTH) > CHUNK_MIN_LENGTH
        ? remaining.lastIndexOf(". ", CHUNK_TARGET_LENGTH) + 1
        : remaining.lastIndexOf(" ", CHUNK_TARGET_LENGTH) > CHUNK_MIN_LENGTH
          ? remaining.lastIndexOf(" ", CHUNK_TARGET_LENGTH)
          : CHUNK_TARGET_LENGTH;

    pieces.push(remaining.slice(0, boundary).trim());
    remaining = remaining.slice(boundary).trim();
  }

  if (remaining) pieces.push(remaining);
  return pieces.filter(Boolean);
}

export function chunkDocumentContent(rawContent: string) {
  const normalized = rawContent.replace(/\r/g, "").trim();
  if (!normalized) return [] as ChunkedText[];

  const paragraphs = normalized
    .split(/\n\s*\n/)
    .flatMap((paragraph) => splitLongParagraph(paragraph))
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const chunks: ChunkedText[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (next.length <= CHUNK_TARGET_LENGTH || current.length < CHUNK_MIN_LENGTH) {
      current = next;
      continue;
    }

    chunks.push({
      chunkIndex: chunks.length,
      content: current,
    });
    current = paragraph;
  }

  if (current) {
    chunks.push({
      chunkIndex: chunks.length,
      content: current,
    });
  }

  return chunks;
}
