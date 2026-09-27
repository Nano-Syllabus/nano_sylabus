import { describe, expect, it } from "vitest";
import { delimitBareMath } from "@/lib/markdown";

describe("delimitBareMath", () => {
  it("wraps a formula-shaped option whole", () => {
    expect(delimitBareMath("4 \\Omega")).toBe("$4 \\Omega$");
    expect(delimitBareMath("0.25 \\Omega")).toBe("$0.25 \\Omega$");
    expect(delimitBareMath("50.5 \\text{ V}")).toBe("$50.5 \\text{ V}$");
    expect(delimitBareMath("\\frac{V}{I}")).toBe("$\\frac{V}{I}$");
  });

  it("leaves delimited and plain options alone", () => {
    expect(delimitBareMath("$4\\,\\Omega$")).toBe("$4\\,\\Omega$");
    expect(delimitBareMath("Ohm's law")).toBe("Ohm's law");
    expect(delimitBareMath("x^2 only")).toBe("x^2 only");
  });

  it("wraps only the command runs inside a sentence", () => {
    expect(delimitBareMath("The resistance becomes 4 \\Omega when the wire is doubled")).toBe(
      "The resistance becomes $4 \\Omega$ when the wire is doubled",
    );
  });
});
