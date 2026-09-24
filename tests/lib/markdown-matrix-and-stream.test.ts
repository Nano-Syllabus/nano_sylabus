import { beforeAll, describe, expect, it } from "vitest";
import { loadKatex, renderMarkdown, streamSafeMarkdown } from "@/lib/markdown";

beforeAll(async () => {
  await loadKatex();
});

describe("a determinant between single dollars", () => {
  // Stored on a real worked example (2026-09-24): it printed as raw LaTeX.
  const GIVEN =
    "**Given.** Let $\\Delta = \\begin{vmatrix} (b+c)^2 & a^2 & a^2 \\\\ b^2 & (c+a)^2 & b^2 \\\\ c^2 & c^2 & (a+b)^2 \\end{vmatrix}$";

  it("is typeset, as a displayed grid", () => {
    const html = renderMarkdown(GIVEN);
    expect(html).toContain("katex-display");
    expect(html).not.toContain("$\\Delta");
    expect(html).not.toContain("\\begin{vmatrix}");
  });

  it("still refuses a sentence that lost its delimiters", () => {
    expect(renderMarkdown("costs $5 and the other costs more than you think $")).toContain("$5");
  });
});

describe("a streaming answer", () => {
  it("holds back a formula until its closing dollar arrives", () => {
    expect(streamSafeMarkdown("Ohm's law gives $V = I")).toBe("Ohm's law gives");
    expect(streamSafeMarkdown("Ohm's law gives $V = IR$ so")).toBe("Ohm's law gives $V = IR$ so");
  });

  it("holds back an open display block, whatever lines it has reached", () => {
    const partial = "Then\n\n$$\n\\begin{vmatrix} a & b \\\\";
    expect(streamSafeMarkdown(partial)).toBe("Then");
    expect(streamSafeMarkdown(`${partial} c & d \\end{vmatrix}\n$$`)).toBe(`${partial} c & d \\end{vmatrix}\n$$`);
  });

  it("releases a lone dollar once its line is finished, and ignores code", () => {
    expect(streamSafeMarkdown("It costs $5\nNext")).toBe("It costs $5\nNext");
    expect(streamSafeMarkdown("```sh\necho $HOME")).toBe("```sh\necho $HOME");
  });
});

describe("a determinant the paper flattened", () => {
  it("is set back as a grid, outside and inside dollars", async () => {
    const { rebuildFlatGrids } = await import("@/lib/markdown");
    expect(rebuildFlatGrids("prove that: |(a+b)^2, c^2; a^2, (b+c)^2| = 2abc(a+b+c)^3. Show steps.")).toBe(
      "prove that: $\\begin{vmatrix} (a+b)^2 & c^2 \\\\ a^2 & (b+c)^2 \\end{vmatrix} = 2abc(a+b+c)^3$. Show steps.",
    );
    expect(rebuildFlatGrids("prove: $|a^2+1, ab; ab, b^2+1| = 1+a^2+b^2$")).toBe(
      "prove: $\\begin{vmatrix} a^2+1 & ab \\\\ ab & b^2+1 \\end{vmatrix} = 1+a^2+b^2$",
    );
    expect(renderMarkdown("Show that |a^2+1, ab, ac; ab, b^2+1, bc; ac, bc, c^2+1| = 1+a^2+b^2+c^2.")).toContain("katex-display");
  });

  it("leaves tables, absolute values and ragged runs alone", async () => {
    const { rebuildFlatGrids } = await import("@/lib/markdown");
    for (const text of ["| A | B |\n|---|---|", "Find |x| when x = -3; explain.", "|a, b; c|"]) {
      expect(rebuildFlatGrids(text)).toBe(text);
    }
  });
});
