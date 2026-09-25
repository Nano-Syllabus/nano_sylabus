/**
 * A photo of a handwritten page, made small enough to send from a phone.
 *
 * A phone camera's 12-48 MP, 3-8 MB photo of one page reads no better to the
 * grader than ~1800px on the long edge: handwriting is legible at ~150 dpi on
 * A4. So every photo is redrawn at most MAX_EDGE on its long side as a JPEG,
 * aiming under TARGET_BYTES — typically 250-600 KB, a tenth of the original —
 * before it leaves the device. That is what makes a ten-page sheet quick on
 * mobile data.
 *
 * iPhone, specifically:
 * - HEIC. The camera saves HEIC, but Safari's file picker hands the page a JPEG
 *   ("Most Compatible") when `accept` is `image/*`, and Safari can decode HEIC
 *   itself anyway. A HEIC that reaches a browser that cannot (an AirDropped file
 *   on desktop Chrome) gets a message saying to export it as JPEG.
 * - Rotation. Decoded through an <img>, which applies the EXIF orientation in
 *   every current browser, so a portrait page stays portrait. createImageBitmap
 *   is NOT used: older Safari ignores `imageOrientation` and the page came out
 *   on its side.
 * - Memory. iOS Safari caps the total canvas memory of a page (a few hundred
 *   MB) and a canvas's area (~16.7 MP). The canvas here is at most 2000px on a
 *   side (≤ 4 MP), it is released (sized to 0) after every photo, and photos
 *   are done one at a time — so twenty pages in a row do not crash the tab.
 *
 * Always JPEG out, whatever came in: the server joins photos into a PDF by
 * embedding the JPEGs as they are, with no image library.
 */

const MAX_EDGE = 2000;
/** Tried in order until one is small enough; the last is kept regardless. */
const ATTEMPTS = [
  { edge: MAX_EDGE, quality: 0.72 },
  { edge: MAX_EDGE, quality: 0.6 },
  { edge: 1600, quality: 0.6 },
  { edge: 1400, quality: 0.55 },
] as const;
const TARGET_BYTES = 700 * 1024;

export type CompressedPhoto = { blob: Blob; name: string; width: number; height: number };

function isHeic(file: File) {
  return /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

async function decode(file: Blob) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function encode(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

export async function compressAnswerPhoto(file: File): Promise<CompressedPhoto> {
  let image: HTMLImageElement;
  try {
    image = await decode(file);
  } catch {
    throw new Error(
      isHeic(file)
        ? `${file.name} is a HEIC photo this browser can't open. Upload it from the phone instead, or export it as JPEG.`
        : `${file.name || "That photo"} could not be opened. Take it again, or save it as JPG.`,
    );
  }
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  if (!width || !height) throw new Error(`${file.name || "That photo"} is empty.`);

  const canvas = document.createElement("canvas");
  try {
    let best: { blob: Blob; width: number; height: number } | null = null;
    for (const attempt of ATTEMPTS) {
      const scale = Math.min(1, attempt.edge / Math.max(width, height));
      const w = Math.max(1, Math.round(width * scale));
      const h = Math.max(1, Math.round(height * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const context = canvas.getContext("2d");
      if (!context) throw new Error("This browser cannot prepare photos. Try another browser.");
      // White under any transparency: a PNG's clear background turns black in JPEG.
      context.fillStyle = "#fff";
      context.fillRect(0, 0, w, h);
      context.imageSmoothingQuality = "high";
      context.drawImage(image, 0, 0, w, h);
      const blob = await encode(canvas, attempt.quality);
      if (!blob) continue;
      best = { blob, width: w, height: h };
      if (blob.size <= TARGET_BYTES) break;
    }
    if (!best) throw new Error(`${file.name || "That photo"} could not be compressed.`);
    const base = (file.name || "page").replace(/\.[^.]+$/, "");
    return { ...best, name: `${base}.jpg` };
  } finally {
    // Hand the pixels back now: iOS counts every live canvas against one budget.
    canvas.width = 0;
    canvas.height = 0;
    image.src = "";
  }
}
