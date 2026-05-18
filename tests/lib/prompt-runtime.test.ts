import { describe, expect, it } from "vitest";
import { getActivePromptContent, renderPromptTemplate, type PromptTemplateMap } from "@/lib/prompt-runtime";

describe("prompt runtime helpers", () => {
  it("renders placeholder tokens with runtime values", () => {
    const rendered = renderPromptTemplate("Hello {{STUDENT_NAME}} from {{STUDENT_BOARD}}", {
      STUDENT_NAME: "Aarav",
      STUDENT_BOARD: "NEB",
    });

    expect(rendered).toBe("Hello Aarav from NEB");
  });

  it("returns null when no active prompt exists for a purpose/language pair", () => {
    const map: PromptTemplateMap = {};
    expect(getActivePromptContent(map, "system", "EN")).toBeNull();
  });
});
