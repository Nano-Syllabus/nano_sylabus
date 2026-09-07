import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { MathText } from "@/components/math-text";

describe("MathText server rendering", () => {
  it("emits real KaTeX markup in the server HTML, not the fallback", () => {
    const html = renderToStaticMarkup(
      React.createElement(MathText, {
        as: "div",
        text: String.raw`A fraction $\frac{p}{q}$ where $q \neq 0$.`,
        className: "text-sm",
      }),
    );
    expect(html).toContain('class="katex"');
    expect(html).not.toContain("math-inline");
    expect(html).not.toContain("$");
    expect(html).toContain('class="text-sm"');
  });
});
