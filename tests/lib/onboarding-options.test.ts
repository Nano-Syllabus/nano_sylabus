import { describe, expect, it } from "vitest";
import {
  defaultBoardOptions,
  defaultGradeOptions,
  defaultProgramOptions,
  mergeDropdownOptions,
} from "@/lib/onboarding-options";

describe("onboarding options", () => {
  it("provides stable board and grade fallbacks", () => {
    expect(defaultBoardOptions()).toEqual(["IOE"]);
    expect(defaultGradeOptions()).toContain("Bachelor");
    expect(defaultGradeOptions("IOE")).toEqual(["Bachelor"]);
    expect(defaultProgramOptions("IOE", "Bachelor")).toEqual([
      "Electronics (NEW 075-079)",
    ]);
  });

  it("merges catalog + fallback + current value without duplicates", () => {
    const options = mergeDropdownOptions({
      catalogValues: ["IOE", "KU", "IOE"],
      fallbackValues: ["TU", "KU"],
      includeValue: "Custom Board",
    });

    expect(options).toEqual(["Custom Board", "IOE", "KU", "TU"]);
  });
});
