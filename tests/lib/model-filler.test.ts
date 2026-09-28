import { describe, expect, it } from "vitest";
import { trimModelFiller } from "@/lib/model-filler";
import { readingBlocks } from "@/components/concepts-reading";

const WORKED =
  "A Router manages traffic at the Network layer based on IP addresses, while a Switch forwards data at the Data Link layer based on MAC addresses.";
const PADDING =
  "The final result is: No value, as the example requires no calculation, only conceptual mapping for exam mastery in the OSI layer identification skill set required for the subject matter as defined by the provided course evidence and pedagogical guidelines for student understanding of network models in the context of the exam preparation challenges mentioned, which include MCQ style assessments about device, protocol, and layer mappings where the student must distinguish between physical, logical, and application layer functions to pass the challenge successfully without any external aid or notes available during the examination phase of their learning process.";

describe("model filler", () => {
  it("drops teaching-talk about the material from a worked example", () => {
    expect(trimModelFiller(`${WORKED} ${PADDING}`)).toBe(WORKED);
    const [block] = readingBlocks([`**Worked:** ${WORKED} ${PADDING}`]);
    expect(block).toEqual({ kind: "example", number: 1, text: WORKED });
  });

  it("keeps subject matter that sounds like it", () => {
    for (const text of [
      "In user mode the user program cannot execute privileged instructions.",
      "The shell displays the prompt and waits for a command.",
      "The scheduler picks a CPU for this task. The 8085 instruction set has 74 instructions.",
      "| a | b |\n|---|---|\n| 1 | 2 |",
    ]) {
      expect(trimModelFiller(text)).toBe(text);
    }
  });
});
