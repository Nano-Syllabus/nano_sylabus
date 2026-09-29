import { describe, expect, it } from "vitest";
import { stripUnitNumber } from "@/lib/syllabus-unit-title";

describe("unit titles lose the syllabus's own numbering", () => {
  it.each([
    ["1.4 Semiconductor Devices", "Semiconductor Devices"],
    ["1.1 Basic Concept", "Basic Concept"],
    ["Unit 2: Network Theorems", "Network Theorems"],
    ["Chapter IV - Optics", "Optics"],
    ["3. Control Memory", "Control Memory"],
    ["IV. Transformers", "Transformers"],
  ])("%s", (input, output) => expect(stripUnitNumber(input)).toBe(output));

  it.each(["Civil Engineering Materials", "Introduction", "C Programming", "2", "Mix and Match"])(
    "keeps %s",
    (input) => expect(stripUnitNumber(input)).toBe(input),
  );
});
