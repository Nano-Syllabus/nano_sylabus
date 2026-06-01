import fs from "node:fs/promises";
import path from "node:path";
import { PDFParse } from "pdf-parse";

async function loadEnvFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (key && !(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch {
    // ignore missing env files
  }
}

function parseArgs(argv) {
  const args = {};
  for (const item of argv) {
    if (!item.startsWith("--")) continue;
    const eq = item.indexOf("=");
    if (eq === -1) {
      args[item.slice(2)] = true;
      continue;
    }
    args[item.slice(2, eq)] = item.slice(eq + 1);
  }
  return args;
}

function normalizeText(input) {
  return input
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function extractErrorMessage(payload, fallback) {
  return payload?.error?.message?.trim() || fallback;
}

function extractText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .map((part) => (typeof part?.text === "string" ? part.text.trim() : ""))
    .filter(Boolean)
    .join("\n");
  return normalizeText(text);
}

function isRetryableStatus(status) {
  return [429, 500, 502, 503, 504].includes(status);
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function ocrPage({ apiKey, modelOrder, apiBase, imageBase64, pageNumber, timeoutMs, retries }) {
  const prompt = [
    "OCR this textbook page.",
    "Return only extracted plain text.",
    "Do not summarize or explain.",
    "Preserve formulas and symbols where possible.",
    "If the page is blank, return an empty string.",
  ].join(" ");

  for (const model of modelOrder) {
    for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
      try {
        const response = await fetch(`${apiBase}/${model}:generateContent?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompt },
                  { inlineData: { mimeType: "image/png", data: imageBase64 } },
                ],
              },
            ],
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });

        const payload = await response.json();
        if (!response.ok) {
          const message = extractErrorMessage(payload, `HTTP ${response.status}`);
          if (isRetryableStatus(response.status) && attempt <= retries) {
            await sleep(500 * 2 ** (attempt - 1));
            continue;
          }
          break;
        }

        return {
          model,
          text: extractText(payload),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const retryable =
          message.toLowerCase().includes("timeout") ||
          message.toLowerCase().includes("network") ||
          message.toLowerCase().includes("aborted") ||
          message.toLowerCase().includes("fetch failed");

        if (retryable && attempt <= retries) {
          await sleep(500 * 2 ** (attempt - 1));
          continue;
        }

        break;
      }
    }
  }

  throw new Error(`OCR failed for page ${pageNumber}`);
}

async function main() {
  await loadEnvFile(".env.local");
  await loadEnvFile(".env");

  const args = parseArgs(process.argv.slice(2));
  const pdfPath = args.pdf || "/Users/sumangiri/Desktop/ENGG. PHYSICS BhadraPokhrel.pdf";
  const outputTextPath = args.out || "data/syllabus/prepared/engg-physics-bhadrapokhrel.txt";
  const outputPageJsonPath =
    args.pageCache || "data/syllabus/prepared/engg-physics-bhadrapokhrel.pages.json";

  const timeoutMs = Number.parseInt(args.timeoutMs || "30000", 10);
  const retries = Number.parseInt(args.retries || "3", 10);
  const renderWidth = Number.parseInt(args.renderWidth || "980", 10);

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY");
  }

  const apiBase = process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com/v1beta";
  const modelOrder = (process.env.GEMINI_OCR_MODELS || "models/gemini-3.1-flash-lite,models/gemini-2.5-flash,models/gemini-2.5-pro")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const parser = new PDFParse({ data: await fs.readFile(pdfPath) });
  const info = await parser.getInfo({ parsePageInfo: true });
  const totalPages = info.total;

  let cachedPages = [];
  try {
    const raw = await fs.readFile(outputPageJsonPath, "utf8");
    cachedPages = JSON.parse(raw);
    if (!Array.isArray(cachedPages)) cachedPages = [];
  } catch {
    cachedPages = [];
  }

  const byPage = new Map(cachedPages.map((item) => [item.pageNumber, item]));

  console.log(`PDF: ${pdfPath}`);
  console.log(`Total pages: ${totalPages}`);
  console.log(`Render width: ${renderWidth}`);
  console.log(`OCR models: ${modelOrder.join(" -> ")}`);

  let processed = 0;
  let skipped = 0;

  for (let page = 1; page <= totalPages; page += 1) {
    if (byPage.has(page)) {
      skipped += 1;
      if (page % 10 === 0) {
        console.log(`OCR progress page ${page}/${totalPages} (skip=${skipped}, done=${processed})`);
      }
      continue;
    }

    const shot = await parser.getScreenshot({
      partial: [page],
      desiredWidth: renderWidth,
      imageDataUrl: false,
      imageBuffer: true,
    });

    const bytes = shot.pages?.[0]?.data;
    if (!bytes) {
      throw new Error(`Could not render page ${page}`);
    }

    const imageBase64 = Buffer.from(bytes).toString("base64");
    const ocr = await ocrPage({
      apiKey,
      modelOrder,
      apiBase,
      imageBase64,
      pageNumber: page,
      timeoutMs,
      retries,
    });

    byPage.set(page, {
      pageNumber: page,
      text: ocr.text,
      textLength: ocr.text.length,
      model: ocr.model,
      updatedAt: new Date().toISOString(),
    });

    processed += 1;

    if (processed % 5 === 0 || page === totalPages) {
      const sorted = [...byPage.values()].sort((a, b) => a.pageNumber - b.pageNumber);
      await fs.mkdir(path.dirname(outputPageJsonPath), { recursive: true });
      await fs.writeFile(outputPageJsonPath, JSON.stringify(sorted, null, 2), "utf8");
      console.log(`OCR progress page ${page}/${totalPages} (skip=${skipped}, done=${processed})`);
    }
  }

  await parser.destroy();

  const sortedPages = [...byPage.values()].sort((a, b) => a.pageNumber - b.pageNumber);
  const combined = sortedPages
    .map((item) => `\n\n[Page ${item.pageNumber}]\n${normalizeText(item.text)}`)
    .join("\n")
    .trim();

  await fs.mkdir(path.dirname(outputPageJsonPath), { recursive: true });
  await fs.writeFile(outputPageJsonPath, JSON.stringify(sortedPages, null, 2), "utf8");
  await fs.mkdir(path.dirname(outputTextPath), { recursive: true });
  await fs.writeFile(outputTextPath, `${combined}\n`, "utf8");

  console.log("OCR extraction complete.");
  console.log(
    JSON.stringify(
      {
        totalPages,
        processed,
        skipped,
        outputTextPath,
        outputPageJsonPath,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("Extraction failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
