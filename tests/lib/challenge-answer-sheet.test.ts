import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({}) }));

import { jpegInfo, jpegsToPdf } from "@/lib/data/challenge-answer-sheet";

const jpeg = (width: number, height: number, options: { progressive?: boolean; gray?: boolean } = {}) => {
  let image = sharp({ create: { width, height, channels: 3, background: "#f4efe1" } });
  if (options.gray) image = image.toColourspace("b-w");
  return image.jpeg({ quality: 70, progressive: options.progressive }).toBuffer();
};

describe("answer sheet photos → one PDF", () => {
  it("reads a JPEG's size and colour from its frame header, baseline or progressive", async () => {
    expect(jpegInfo(await jpeg(1500, 2000))).toEqual({ width: 1500, height: 2000, components: 3 });
    expect(jpegInfo(await jpeg(2000, 1400, { progressive: true }))).toMatchObject({ width: 2000, height: 1400 });
    expect(jpegInfo(await jpeg(800, 1000, { gray: true })).components).toBe(1);
  });

  it("refuses something that is not a JPEG", () => {
    expect(() => jpegInfo(Buffer.from("%PDF-1.4"))).toThrow();
  });

  it("makes one A4-wide page per photo, in order, with a valid cross-reference table", async () => {
    const photos = [await jpeg(1500, 2000), await jpeg(2000, 1400, { progressive: true })];
    const pdf = jpegsToPdf(photos);
    const text = pdf.toString("latin1");
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("/Count 2");
    expect(text).toContain("/MediaBox [0 0 595.28 793.71]");
    expect(text).toContain("/MediaBox [0 0 595.28 416.70]");
    // Every xref offset points at the object it names.
    const xref = text.slice(text.lastIndexOf("xref"));
    const offsets = [...xref.matchAll(/^(\d{10}) 00000 n $/gm)].map((match) => Number(match[1]));
    offsets.forEach((offset, index) => expect(text.slice(offset).startsWith(`${index + 1} 0 obj`)).toBe(true));
    // The photos are embedded byte for byte, not re-encoded.
    for (const photo of photos) expect(pdf.includes(photo)).toBe(true);
  });
});
