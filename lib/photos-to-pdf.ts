/** Width, height and colour components from a JPEG's frame header. */
export function jpegInfo(jpeg: Buffer) {
  if (jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error("not a JPEG");
  let offset = 2;
  while (offset + 9 < jpeg.length) {
    if (jpeg[offset] !== 0xff) throw new Error("corrupt JPEG");
    const marker = jpeg[offset + 1];
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    const length = jpeg.readUInt16BE(offset + 2);
    // SOF0-SOF15, except DHT (C4), JPG (C8) and DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return {
        height: jpeg.readUInt16BE(offset + 5),
        width: jpeg.readUInt16BE(offset + 7),
        components: jpeg[offset + 9],
      };
    }
    offset += 2 + length;
  }
  throw new Error("JPEG has no frame header");
}

export function jpegsToPdf(jpegs: Buffer[]) {
  const PAGE_WIDTH = 595.28; // A4, in points
  const chunks: Buffer[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (part: Buffer | string) => {
    const buffer = typeof part === "string" ? Buffer.from(part, "latin1") : part;
    chunks.push(buffer);
    length += buffer.length;
  };
  const object = (id: number, body: () => void) => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
    body();
    push("\nendobj\n");
  };

  // 1 catalog, 2 pages, then per photo: page, image, contents.
  const pageIds = jpegs.map((_, index) => 3 + index * 3);
  push("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n");
  object(1, () => push("<< /Type /Catalog /Pages 2 0 R >>"));
  object(2, () =>
    push(
      `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${jpegs.length} >>`,
    ),
  );
  jpegs.forEach((jpeg, index) => {
    const { width, height, components } = jpegInfo(jpeg);
    const colour =
      components === 1 ? "/DeviceGray" : components === 4 ? "/DeviceCMYK" : "/DeviceRGB";
    const pageHeight = (PAGE_WIDTH * height) / width;
    const [pageId, imageId, contentId] = [pageIds[index], pageIds[index] + 1, pageIds[index] + 2];
    const draw = `q ${PAGE_WIDTH.toFixed(2)} 0 0 ${pageHeight.toFixed(2)} 0 0 cm /Im0 Do Q`;
    object(pageId, () =>
      push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH.toFixed(2)} ${pageHeight.toFixed(2)}] ` +
          `/Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`,
      ),
    );
    object(imageId, () => {
      push(
        `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace ${colour} ` +
          `/BitsPerComponent 8 /Filter /DCTDecode${components === 4 ? " /Decode [1 0 1 0 1 0 1 0]" : ""} /Length ${jpeg.length} >>\nstream\n`,
      );
      push(jpeg);
      push("\nendstream");
    });
    object(contentId, () => push(`<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`));
  });
  const count = 3 + jpegs.length * 3;
  const xref = length;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let id = 1; id < count; id += 1) push(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return Buffer.concat(chunks);
}
