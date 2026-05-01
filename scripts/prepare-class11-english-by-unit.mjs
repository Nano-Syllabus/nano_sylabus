import fs from "node:fs/promises";
import path from "node:path";

const INPUT_PATH = "data/syllabus/prepared/neb-grade-11-compulsory-english-book.txt";
const OUTPUT_PATH = "data/syllabus/prepared/documents.class11.english.by-unit.json";

function normalizeWhitespace(value) {
  return value.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function detectUnitBlocks(text) {
  const unitPattern = /(^|\n)\s*(Unit\s+(?:\d+|One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|Eleven|Twelve)[^\n]*)/gi;
  const matches = [];
  let match;
  while ((match = unitPattern.exec(text)) !== null) {
    matches.push({
      index: match.index + (match[1] ? match[1].length : 0),
      heading: match[2].trim(),
    });
  }

  if (matches.length < 2) {
    return [];
  }

  const blocks = [];
  for (let i = 0; i < matches.length; i += 1) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const content = text.slice(start, end).trim();
    if (content.length > 500) {
      blocks.push({
        heading: matches[i].heading,
        content,
      });
    }
  }
  return blocks;
}

async function main() {
  const inputAbs = path.resolve(process.cwd(), INPUT_PATH);
  const outputAbs = path.resolve(process.cwd(), OUTPUT_PATH);
  const raw = await fs.readFile(inputAbs, "utf8");
  const text = normalizeWhitespace(raw);
  const unitBlocks = detectUnitBlocks(text);

  const docs =
    unitBlocks.length > 0
      ? unitBlocks.map((block) => ({
          board: "NEB",
          grade: "Class 11",
          subject: "English",
          chapter: block.heading,
          topic: "All Topics",
          title: `NEB Grade 11 Compulsory English - ${block.heading}`,
          sourceName: "NEB Grade 11 Compulsory English Book PDF",
          sourceType: "pdf",
          content: block.content,
        }))
      : [
          {
            board: "NEB",
            grade: "Class 11",
            subject: "English",
            chapter: "Full Book",
            topic: "All Units",
            title: "NEB Grade 11 Compulsory English Book",
            sourceName: "NEB Grade 11 Compulsory English Book PDF",
            sourceType: "pdf",
            content: text,
          },
        ];

  await fs.writeFile(outputAbs, JSON.stringify(docs, null, 2), "utf8");
  console.log(`Prepared ${docs.length} document(s): ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
