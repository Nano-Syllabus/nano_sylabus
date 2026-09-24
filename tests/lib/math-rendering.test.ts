import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isKatexReady,
  isWordFormula,
  normalizeTex,
  renderMarkdown,
  renderMathText,
  proseToText,
  underscoredNamesToText,
  loadKatex,
} from "@/lib/markdown";

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
    const html = renderMathText(
      String.raw`Then $\text{force} = ma \text{ where } m \text{ is mass}$ holds.`,
    );
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

/**
 * The Concepts reading for a machines topic, as it was reported: a formula
 * written in words printed with its dollar signs showing and its `*` eaten as
 * italics, `N_last` subscripted one letter, and a worked line whose two
 * multiplications became one italic run.
 */
describe("model-written maths reads as maths", () => {
  const visible = (html: string) => html.replace(/<[^>]+>/g, "");

  it("typesets a formula written in words instead of printing it raw", () => {
    for (const formula of [
      String.raw`$Efficiency = (W * d_load) / (P * d_effort)$`,
      String.raw`$e = (Product of radii of drivers) / (Product of radii of followers)$`,
    ]) {
      const html = renderMarkdown(`- ${formula}`);
      expect(html, formula).toContain('class="katex"');
      expect(html, formula).not.toContain("$");
      expect(html, formula).not.toContain("<em>");
    }
    expect(proseToText("Efficiency = (W * d_load) / (P * d_effort)")).toBe(
      String.raw`\text{Efficiency} = (W * d_load) / (P * d_effort)`,
    );
    expect(proseToText("e = (Product of radii of drivers) / (Product of radii of followers)")).toBe(
      String.raw`e = (\text{Product of radii of drivers}) / (\text{Product of radii of followers})`,
    );
  });

  it("sets words as words in display maths too, with room between two formulas", () => {
    const html = renderMarkdown(
      "$$\nEfficiency = (L * d_load) / (P * d_effort), Mechanical Advantage = L / P\n$$",
    );
    expect(html).toContain("katex-display");
    // "Mechanical Advantage" keeps its space; KaTeX would otherwise run it together.
    expect(proseToText("Mechanical Advantage = L / P")).toBe(
      String.raw`\text{Mechanical Advantage} = L / P`,
    );
    expect(html).not.toContain("MechanicalAdvantage");
  });

  it("breaks a displayed formula that would run off the page, aligned on its equals", () => {
    const chain = renderMarkdown(
      "$$\ne = (N_last) / (N_first) = (Product of radii of drivers) / (Product of radii of followers)\n$$",
    );
    expect(chain).toContain("mtable"); // KaTeX's aligned rows
    const pair = renderMarkdown(
      "$$\nEfficiency = (L * d_load) / (P * d_effort), Mechanical Advantage = L / P\n$$",
    );
    expect(pair).toContain("mtable");
    // A short formula stays one line, and one already laid out is left alone.
    expect(renderMarkdown("$$\nP = (1 + e)R/r + P_0\n$$")).not.toContain("mtable");
    const aligned = String.raw`$$\begin{aligned} a &= b \\ &= c \end{aligned}$$`;
    expect(renderMarkdown(aligned)).toContain("katex-display");
  });

  it("subscripts a quantity named in prose without its dollars", () => {
    expect(renderMarkdown("The constant P_0 is the no-load effort; R_eq and x_1 too.")).toBe(
      "<p>The constant P<sub>0</sub> is the no-load effort; R<sub>eq</sub> and x<sub>1</sub> too.</p>",
    );
    // Identifiers are not quantities.
    expect(renderMarkdown("Open file_name and my_long_var.")).toBe(
      "<p>Open file_name and my_long_var.</p>",
    );
  });

  it("leaves real maths tokens alone", () => {
    for (const math of [
      String.raw`\frac{dx}{dt}`,
      "9.8 kg",
      String.raw`\sin\theta + \omega_n t`,
      "P = (1 + e)R/r + P_0",
      // Environment, font and colour names are names, not prose.
      String.raw`\begin{aligned} a &= b \end{aligned}`,
      String.raw`x \in \mathbb{R}`,
      String.raw`\color{red}{y}`,
    ]) {
      expect(proseToText(math)).toBe(math);
    }
  });

  it("still refuses a sentence that lost its delimiter", () => {
    expect(isWordFormula("F(x) = -kx where k is force constant. or, 0 where")).toBe(false);
    expect(isWordFormula("5 and ")).toBe(false);
    expect(isWordFormula("the value we want is large")).toBe(false);
  });

  it("subscripts the whole word, and multiplies with ×", () => {
    expect(normalizeTex("e = (N_last)/(N_first)")).toBe(
      String.raw`e = (N_{\mathrm{last}})/(N_{\mathrm{first}})`,
    );
    expect(normalizeTex("P = (1 + e) * (R/r) + P_0")).toBe(
      String.raw`P = (1 + e) \times  (R/r) + P_0`,
    );
    // Already meant: left alone.
    for (const math of [
      String.raw`x_1 + V_{in} + \omega_n`,
      "x^* + z_*",
      String.raw`\text{d_load}`,
    ]) {
      expect(normalizeTex(math)).toBe(math);
    }
  });

  it("sets an underscored name as one subscript, never a double subscript", () => {
    // The Roman Nepali reading of Digital Logic printed this in red, as source:
    // `V_logic` was braced and `_0` left as V's second subscript.
    expect(normalizeTex("V_logic_0 < V_transition_region < V_logic_1")).toBe(
      String.raw`V_{\mathrm{logic\ 0}} < V_{\mathrm{transition\ region}} < V_{\mathrm{logic\ 1}}`,
    );
    // Written already braced, the two subscripts are merged into one.
    expect(normalizeTex(String.raw`V_{\mathrm{logic}}_0 < V_{\mathrm{transition}}_region`)).toBe(
      String.raw`V_{\mathrm{logic}\,0} < V_{\mathrm{transition}\,\mathrm{region}}`,
    );
    expect(normalizeTex("V_{logic}_{0}")).toBe(String.raw`V_{logic\,0}`);
    // Real maths is left alone: a subscript then a superscript, a nested one.
    for (const math of ["x_1^2 + a_i", String.raw`x_{a_b}`, String.raw`\_x`]) {
      expect(normalizeTex(math)).toBe(math);
    }
    const html = renderMathText("$$V_logic_0 < V_transition_region < V_logic_1$$");
    expect(html).toContain('class="katex"');
    expect(html).not.toContain("katex-error");
  });

  it("shows a formula KaTeX cannot parse as its written text, not red source", () => {
    const html = renderMathText(String.raw`$$x = \frac{1}{$$`);
    expect(html).not.toContain("katex-error");
    expect(html).toContain('<div class="math-block">x = \\frac{1}{</div>');
  });

  it("keeps a worked line's multiplication, and its words upright", () => {
    const html = renderMarkdown(
      "**Worked:** P = (1 + 0.2) * (1120 / 25) + 10 = 1.2 * 44.8 + 10 = 63.76 lbs, or (1 + 0.2)*(1120 / 25).",
    );
    expect(html).not.toContain("<em>");
    expect(html).toContain("<strong>Worked:</strong>");
    expect(visible(html)).toContain("(1 + 0.2) × (1120 / 25) + 10 = 1.2 × 44.8 + 10");
    expect(visible(html)).toContain("(1 + 0.2)×(1120 / 25)");
  });

  it("still sets real emphasis", () => {
    expect(renderMarkdown("An *important* point and a **bold** one.")).toBe(
      "<p>An <em>important</em> point and a <strong>bold</strong> one.</p>",
    );
    expect(renderMarkdown("**Given.** Load 3V.")).toContain("<strong>Given.</strong> Load 3V.");
  });
});

describe("names written with underscores for spaces", () => {
  it("sets a multi-word underscored name as one piece of text", () => {
    expect(underscoredNamesToText("\\frac{Number_of_Frames_in_Window}{Round_Trip_Time}")).toBe(
      "\\frac{\\text{Number of Frames in Window}}{\\text{Round Trip Time}}",
    );
    expect(underscoredNamesToText("Round\\_Trip\\_Time")).toBe("\\text{Round Trip Time}");
  });

  it("leaves symbols with labels, commands and short tokens alone", () => {
    expect(underscoredNamesToText("V_logic_0 + d_load")).toBe("V_logic_0 + d_load");
    expect(underscoredNamesToText("\\Delta_x + dx_1")).toBe("\\Delta_x + dx_1");
    expect(underscoredNamesToText("\\text{Round_Trip}")).toBe("\\text{Round_Trip}");
  });

  it("renders the throughput formula without subscripts", async () => {
    await loadKatex();
    const html = renderMarkdown(
      "$$\\text{Throughput} = \\frac{Number\\_of\\_Frames\\_in\\_Window}{Round\\_Trip\\_Time}$$",
    );
    expect(html).not.toContain("msupsub");
    expect(html).not.toContain("katex-error");
    const text = html.replace(/<annotation[\s\S]*?<\/annotation>/g, "").replace(/<[^>]+>/g, "").replace(/&nbsp;|\u00a0/g, " ");
    expect(text).toContain("Number of Frames in Window");
  });
});
