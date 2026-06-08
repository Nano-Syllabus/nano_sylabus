// Quick test for the normalizeBoard fix
function compactWhitespace(value) {
  return value.trim().replace(/\s+/g, " ");
}

function capitalizeWord(word) {
  if (!word) return word;
  if (/^[A-Z0-9]+$/.test(word)) return word;
  return `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`;
}

function normalizeBoard(value) {
  const compact = compactWhitespace(value);
  if (!compact) return "";
  const upper = compact.toUpperCase();
  const acronyms = ["NEB", "TU", "PU", "KU", "CTEVT"];
  if (acronyms.includes(upper)) return upper;
  return compact.split(" ").map((word) => capitalizeWord(word)).join(" ");
}

console.log("=== normalizeBoard Tests ===");
console.log(`"NEB" → "${normalizeBoard("NEB")}"`);           // Should be "NEB"
console.log(`"neb" → "${normalizeBoard("neb")}"`);           // Should be "NEB"
console.log(`"Engineering" → "${normalizeBoard("Engineering")}"`); // Should be "Engineering"
console.log(`"engineering" → "${normalizeBoard("engineering")}"`); // Should be "Engineering"
console.log(`"ENGINEERING" → "${normalizeBoard("ENGINEERING")}"`); // Should be "Engineering"
console.log(`"TU" → "${normalizeBoard("TU")}"`);             // Should be "TU"
console.log(`"CTEVT" → "${normalizeBoard("CTEVT")}"`);       // Should be "CTEVT"
