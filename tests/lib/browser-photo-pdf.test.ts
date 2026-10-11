import { describe, expect, it } from "vitest";
import { photoPagesToPdf } from "@/lib/browser-photo-pdf";

const page = (text: string, width = 600, height = 800) => ({
  blob: new Blob([text], { type: "image/jpeg" }),
  width,
  height,
});
describe("phone PDF assembly", () => {
  it("embeds compressed JPEGs in the selected order and writes correct binary cross references", async () => {
    const pdf = photoPagesToPdf([page("JPEG-second-\xff\x00"), page("JPEG-first")]);
    const bytes = Buffer.from(await pdf.arrayBuffer());
    const text = bytes.toString("latin1");
    expect(pdf.type).toBe("application/pdf");
    expect(text).toContain("/Count 2");
    expect(text.indexOf("JPEG-second")).toBeLessThan(text.indexOf("JPEG-first"));
    const xref = Number(text.match(/startxref\n(\d+)/)![1]);
    expect(bytes.subarray(xref, xref + 4).toString()).toBe("xref");
    const rows = text.slice(xref).split("\n");
    const count = Number(rows[1].split(" ")[1]);
    for (let id = 1; id < count; id++) {
      const offset = Number(rows[2 + id].split(" ")[0]);
      expect(bytes.subarray(offset, offset + `${id} 0 obj`.length).toString()).toBe(`${id} 0 obj`);
    }
    expect(text).toContain("/MediaBox [0 0 595.28 793.71]");
    expect(text.endsWith("%%EOF\n")).toBe(true);
  });
  it("supports all fifty pages while keeping the page-count manifest readable", async () => {
    const pdf = photoPagesToPdf(Array.from({ length: 50 }, () => page("JPEG")));
    const text = Buffer.from(await pdf.arrayBuffer()).toString("latin1");
    expect(text.slice(0, 2048)).toContain("/Count 50");
    expect(text.match(/\/Subtype \/Image/g)).toHaveLength(50);
  });
  it("rejects missing pages, uncompressed formats and invalid dimensions", () => {
    expect(() => photoPagesToPdf([])).toThrow();
    expect(() => photoPagesToPdf(Array.from({ length: 51 }, () => page("JPG")))).toThrow();
    for (const dimension of [0, 2001, NaN, Infinity, 1.2])
      expect(() => photoPagesToPdf([page("JPG", dimension)])).toThrow();
    expect(() =>
      photoPagesToPdf([{ ...page("PNG"), blob: new Blob(["PNG"], { type: "image/png" }) }]),
    ).toThrow();
  });
});
