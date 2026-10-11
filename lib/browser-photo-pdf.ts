/** Assemble already-compressed phone JPEGs without loading them all into one
 * large ArrayBuffer. Blob parts keep memory bounded on mobile Safari. */
export function photoPagesToPdf(pages: { blob: Blob; width: number; height: number }[]) {
  if (!pages.length || pages.length > 50) throw new Error("Choose between 1 and 50 pages.");
  const parts: BlobPart[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (part: string | Blob) => {
    if (typeof part === "string") {
      const bytes = Uint8Array.from(part, (letter) => letter.charCodeAt(0));
      parts.push(bytes);
      length += bytes.length;
    } else {
      parts.push(part);
      length += part.size;
    }
  };
  const object = (id: number, body: () => void) => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
    body();
    push("\nendobj\n");
  };
  const width = 595.28;
  const pageIds = pages.map((_, index) => 3 + index * 3);
  push("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n");
  object(1, () => push("<< /Type /Catalog /Pages 2 0 R >>"));
  object(2, () =>
    push(
      `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`,
    ),
  );
  pages.forEach((page, index) => {
    if (
      !page.blob.size ||
      page.blob.type !== "image/jpeg" ||
      !Number.isInteger(page.width) ||
      !Number.isInteger(page.height) ||
      page.width < 1 ||
      page.height < 1 ||
      page.width > 2000 ||
      page.height > 2000
    )
      throw new Error("One of the pages could not be prepared.");
    const height = (width * page.height) / page.width;
    const pageId = pageIds[index],
      imageId = pageId + 1,
      contentId = pageId + 2;
    const draw = `q ${width.toFixed(2)} 0 0 ${height.toFixed(2)} 0 0 cm /Im0 Do Q`;
    object(pageId, () =>
      push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width.toFixed(2)} ${height.toFixed(2)}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`,
      ),
    );
    object(imageId, () => {
      push(
        `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.blob.size} >>\nstream\n`,
      );
      push(page.blob);
      push("\nendstream");
    });
    object(contentId, () => push(`<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`));
  });
  const count = 3 + pages.length * 3,
    xref = length;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let id = 1; id < count; id++) push(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts, { type: "application/pdf" });
}
