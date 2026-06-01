import { describe, expect, it } from "vitest";
import {
  defaultBoardOptions,
  defaultGradeOptions,
  mergeDropdownOptions,
} from "@/lib/onboarding-options";

describe("onboarding options", () => {
  it("provides stable board and grade fallbacks", () => {
    expect(defaultBoardOptions()).toContain("Engineering");
    expect(defaultGradeOptions()).toContain("Bachelor Year I");
  });

  it("merges catalog + fallback + current value without duplicates", () => {
    const options = mergeDropdownOptions({
      catalogValues: ["Engineering", "NEB", "Engineering"],
      fallbackValues: ["TU", "NEB"],
      includeValue: "Custom Board",
    });

    expect(options).toEqual(["Custom Board", "Engineering", "NEB", "TU"]);
  });
});
