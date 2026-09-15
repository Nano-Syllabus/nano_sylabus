import { afterEach, describe, expect, it, vi } from "vitest";
import { isKatexReady, renderMarkdown, renderMathText } from "@/lib/markdown";

/**
 * Challenge lessons, worked solutions and exam prompts arrive from the tenant
 * API with LaTeX embedded in ordinary sentences, and they used to be printed
 * verbatim — students read `$\frac{p}{q}$` instead of the fraction.
 *
 * KaTeX is bundled on the server and fetched on demand in the browser, so
 * there are two states to hold to: the server (and any loaded client) renders
 * real KaTeX, and a browser that does not have the chunk yet still shows
 * readable, correctly escaped text rather than raw delimiters.
 */
describe("renderMathText with KaTeX available", () => {
  it("is ready without awaiting anything on the server", () => {
    expect(isKatexReady()).toBe(true);
  });

  it("renders inline math as KaTeX markup", () => {
    const html = renderMathText(String.raw`A fraction $\frac{p}{q}$ where $q \neq 0$.`);
    expect(html).toContain('class="katex"');
    expect(html).toContain("A fraction");
    expect(html).not.toContain("$");
  });

  it("renders display math delimited by double dollars", () => {
    const html = renderMathText(String.raw`Result: $$\int_0^1 x^2 dx = \frac{1}{3}$$`);
    expect(html).toContain("katex");
    expect(html).toContain("Result:");
  });

  it("keeps comparison operators intact inside math", () => {
    // The renderer escapes the whole source before parsing, so `<` reaches
    // KaTeX as `&lt;`. Without unescaping it rendered the literal "&lt;".
    const html = renderMathText(String.raw`Given $a < b$ and $c > d$.`);
    expect(html).not.toContain("&amp;lt;");
    expect(html).toContain("katex");
  });

  it("escapes HTML in the surrounding prose", () => {
    const html = renderMathText('<script>alert("x")</script> and $x$');
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("leaves prose without math untouched", () => {
    const html = renderMathText("Just a sentence with no formulas.");
    expect(html).not.toContain("katex");
    expect(html).toBe("Just a sentence with no formulas.");
  });

  it("emits no block-level tags, so it can nest inside a paragraph", () => {
    const html = renderMathText(String.raw`Inline $x^2$ only.`);
    expect(html).not.toMatch(/<p[\s>]/);
    expect(html).not.toMatch(/<div[\s>]/);
  });

  it("still renders full markdown documents with math", () => {
    const html = renderMarkdown(String.raw`# Title\n\nEnergy is $E = mc^2$.`);
    expect(html).toContain("katex");
  });
});

describe("renderMathText before the KaTeX chunk arrives", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  /**
   * Reloads the renderer as a browser sees it. The module only pulls KaTeX in
   * eagerly when `window` is undefined, so defining one reproduces the state a
   * real browser is in until the async chunk lands.
   */
  async function loadAsBrowser() {
    vi.resetModules();
    vi.stubGlobal("window", {});
    return import("@/lib/markdown");
  }

  it("shows readable text rather than raw delimiters", async () => {
    const { renderMathText: render, isKatexReady: ready } = await loadAsBrowser();
    expect(ready()).toBe(false);
    const html = render(String.raw`A fraction $\frac{p}{q}$ here.`);
    expect(html).toContain('<span class="math-inline">');
    expect(html).toContain("A fraction");
    expect(html).not.toContain("$");
  });

  it("still escapes HTML in the fallback path", async () => {
    const { renderMathText: render } = await loadAsBrowser();
    const html = render("$a < b$ and <b>bold</b>");
    expect(html).not.toContain("<b>bold</b>");
    expect(html).toContain("&lt;b&gt;");
  });

  it("upgrades to real KaTeX once the chunk resolves", async () => {
    const { renderMathText: render, loadKatex, isKatexReady: ready } = await loadAsBrowser();
    expect(ready()).toBe(false);
    await loadKatex();
    expect(ready()).toBe(true);
    expect(render(String.raw`$\frac{p}{q}$`)).toContain("katex");
  });
});

/**
 * Course notes are OCR'd PDFs and they do not balance their dollar signs. A
 * stray `$` used to pair with the next one several sentences away, and KaTeX —
 * which ignores whitespace in maths mode — handed back the paragraph as one
 * unreadable word. Both the challenge lesson and the revision docs render
 * through `applyInlineStyles`, so these guard both.
 */
describe("a lost delimiter never turns a sentence into an equation", () => {
  // The paragraph this was reported for, verbatim in shape: a `$` opens, the
  // next one is four clauses away, and a real equation follows right after it.
  const REPORTED = String.raw`position i.e. $F(x) = -kx where k is force constant. or, m\frac{d^2x}{dt^2} = -kx or, \frac{d^2x}{dt^2} + \omega^2x = 0 where $\omega = \sqrt{\frac{k}{m}}$ is angular frequency`;

  it("leaves the prose readable instead of stripping its spaces", () => {
    const html = renderMarkdown(REPORTED);
    expect(html).toContain("where k is force constant");
    // The old rendering: KaTeX ate the sentence and returned "kxwherekis…".
    expect(html).not.toContain("forceconstant");
  });

  it("still renders the equation that follows the rejected span", () => {
    // A regex consumes the closing delimiter of what it rejects, which is the
    // opening delimiter of this one. Rejecting must cost one character, not two.
    for (const html of [renderMarkdown(REPORTED), renderMathText(REPORTED)]) {
      expect(html).toContain("katex");
      // The raw source, not KaTeX's own `mord sqrt` class.
      expect(html).not.toContain(String.raw`\sqrt{`);
    }
  });

  it("does not read prices as maths", () => {
    const html = renderMathText("It costs $5 and $7 each, so budget for the term.");
    expect(html).not.toContain("katex");
    expect(html).toContain("$5");
  });

  it("keeps deliberate prose inside \\text{} as maths", () => {
    const html = renderMathText(String.raw`Then $\text{force} = ma \text{ where } m \text{ is mass}$ holds.`);
    expect(html).toContain("katex");
    expect(html).not.toContain("$");
  });

  it("renders ordinary inline maths untouched", () => {
    for (const source of [
      String.raw`The law is $V = IR$ here.`,
      String.raw`With $R_{eq}$ and $\frac{p}{q}$.`,
      String.raw`Angular frequency $\omega = \sqrt{\frac{k}{m}}$ follows.`,
    ]) {
      const html = renderMathText(source);
      expect(html).toContain("katex");
      expect(html).not.toContain("$");
    }
  });

  it("does not leave stray dollars around display maths inside a sentence", () => {
    const html = renderMarkdown(String.raw`Given $$\frac{d^2x}{dt^2} + \omega^2 x = 0$$ we solve.`);
    expect(html).toContain("katex-display");
    expect(html).not.toContain("$");
  });
});
