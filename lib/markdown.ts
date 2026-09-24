import type katexNamespace from "katex";

/**
 * KaTeX is 260kB of JavaScript, and a static import put all of it in the
 * client bundle of every screen that can reach a Markdown component — 75kB
 * over the wire, competing with the code needed to paint the page, on screens
 * that render no math at all.
 *
 * So it loads on demand instead. Until it arrives, `renderMath` falls back to
 * the same plain-text markup it has always used when KaTeX throws, which is
 * already styled by `.math-inline` / `.math-block`. That keeps server output
 * and the client's first render identical — both run without KaTeX — so
 * hydration matches, and the formatted version swaps in once the chunk lands.
 */
let katex: typeof katexNamespace | null = null;
let katexLoad: Promise<void> | null = null;

/**
 * On the server KaTeX is loaded up front, synchronously.
 *
 * Server weight is not the problem this split is solving, and rendering the
 * real maths into the HTML matters: challenge and exam content is
 * server-rendered, so the very first paint shows proper formulas instead of
 * `$\frac{p}{q}$` waiting to be replaced. React does not re-check the contents
 * of `dangerouslySetInnerHTML` while hydrating, so that markup simply stays
 * until the client re-renders with an identical result.
 *
 * Next replaces `typeof window` at build time, so this whole branch — and the
 * `require` inside it — is dead code in the browser bundle and gets dropped.
 * `tests/lib/math-rendering.test.ts` covers both states, and the production
 * build is checked for KaTeX leaking into client chunks.
 */
if (typeof window === "undefined") {
  try {
    katex = require("katex") as typeof katexNamespace;
  } catch {
    // Left null; every render path already handles KaTeX being unavailable.
  }
}

export function isKatexReady() {
  return katex !== null;
}

export function loadKatex() {
  if (katex) return Promise.resolve();
  if (!katexLoad) {
    katexLoad = import("katex")
      .then((module) => {
        katex = module.default ?? (module as unknown as typeof katexNamespace);
      })
      .catch(() => {
        // Leave `katex` null; math keeps rendering in the plain-text fallback.
        katexLoad = null;
      });
  }
  return katexLoad;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[char]!);
}

/**
 * Undoes the document-wide escaping for a math payload.
 *
 * `renderMd` escapes the whole source before parsing, so by the time an
 * expression reaches here its `<`, `>` and `&` are HTML entities. KaTeX wants
 * the real characters — without this, `$a < b$` renders the literal text
 * "a &lt; b", and any comparison or interval in a formula comes out wrong.
 * `&amp;` is undone last so an escaped entity does not get unescaped twice.
 */
function unescapeHtml(value: string) {
  return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

/**
 * Arguments nothing below may rewrite: `\text{…}` and its kin hold prose on
 * purpose, and `\begin{aligned}`, `\mathbb{R}`, `\color{red}` hold names — an
 * environment written `\begin{\text{aligned}}` is a KaTeX error.
 */
const TEXT_COMMAND =
  /\\(?:text|textrm|textbf|textit|textsf|texttt|mathrm|mathbf|mathit|mathsf|mathtt|mathbb|mathcal|mathfrak|mathscr|operatorname|begin|end|color|textcolor|label|tag)\s*\{[^}]*\}/g;

/** Runs `rewrite` over `math` with every `\text{…}` held aside. */
function outsideTextCommands(math: string, rewrite: (value: string) => string) {
  const held: string[] = [];
  const masked = math.replace(TEXT_COMMAND, (match) => {
    held.push(match);
    return `\u0000${held.length - 1}\u0000`;
  });
  return rewrite(masked).replace(/\u0000(\d+)\u0000/g, (_, index) => held[Number(index)] ?? "");
}

/**
 * The two ways model-written maths reads as broken once typeset.
 *
 * `N_last` is N-subscript-l followed by "ast": LaTeX subscripts one character
 * unless told otherwise, and a writer naming a quantity — `d_load`, `R_eq`,
 * `N_first` — means the whole word. A standalone letter subscripted by a run of
 * letters, or a run of digits, is braced; `x_1`, `V_{in}` and `\omega_n` are
 * already what they mean and are left alone.
 *
 * `*` is the asterisk operator ∗ in LaTeX, which nobody writing `(1 + e) * (R/r)`
 * means. It becomes ×, except as a superscript or subscript (`x^*`, `z_*`).
 */
export function normalizeTex(math: string) {
  return outsideTextCommands(math, (value) =>
    mergeRepeatedScripts(
      value
        // `V_logic_0`, `V_transition_region`: one name, underscored — not V
        // subscripted twice, which KaTeX refuses and prints as red source.
        .replace(
          /(?<![\\A-Za-z])([A-Za-z])_([A-Za-z0-9]+(?:_[A-Za-z0-9]+)+)(?![A-Za-z0-9{])/g,
          (_, base: string, chain: string) => `${base}_{\\mathrm{${chain.split("_").join("\\ ")}}}`,
        )
        .replace(
          /(?<![\\A-Za-z])([A-Za-z])_([A-Za-z]{2,}|\d{2,})(?![A-Za-z0-9{])/g,
          (_, base: string, sub: string) => `${base}_{\\mathrm{${sub}}}`,
        )
        .replace(/(?<![\^_{\\])\*/g, "\\times "),
    ),
  );
}

/** Where the argument of a `_` or `^` starting at `start` ends: a braced group,
 *  a command name, a held-aside `\text{…}`, or one character. -1 if none. */
function scriptArgumentEnd(tex: string, start: number) {
  const first = tex[start];
  if (first === undefined || /[\s_^}]/.test(first)) return -1;
  if (first === "{") {
    let depth = 0;
    for (let index = start; index < tex.length; index += 1) {
      if (tex[index] === "{") depth += 1;
      else if (tex[index] === "}" && --depth === 0) return index + 1;
    }
    return -1;
  }
  if (first === "\u0000") {
    const close = tex.indexOf("\u0000", start + 1);
    return close < 0 ? -1 : close + 1;
  }
  if (first === "\\") {
    const command = /^\\(?:[A-Za-z]+|.)/.exec(tex.slice(start));
    return command ? start + command[0].length : -1;
  }
  return start + 1;
}

/**
 * `V_{logic}_0` — a subscript on a subscript's heels — is a "double subscript"
 * to KaTeX, and the whole formula comes out as red source. Its writer means one
 * subscript, so the two are set as one, a thin space apart. The same for `^`.
 */
function mergeRepeatedScripts(tex: string) {
  let out = "";
  let index = 0;
  while (index < tex.length) {
    const char = tex[index];
    if ((char !== "_" && char !== "^") || tex[index - 1] === "\\") {
      out += char;
      index += 1;
      continue;
    }
    const args: string[] = [];
    let end = index;
    while (tex[end] === char) {
      // A repeat is already past what LaTeX means, so `}_region` is taken as
      // the word its writer typed, not `_r` followed by "egion".
      const word = args.length ? /^[A-Za-z0-9]{2,}/.exec(tex.slice(end + 1))?.[0] : undefined;
      const argumentEnd = word ? end + 1 + word.length : scriptArgumentEnd(tex, end + 1);
      if (argumentEnd < 0) break;
      const argument = tex.slice(end + 1, argumentEnd);
      args.push(
        word && /[A-Za-z]{2,}/.test(word)
          ? `\\mathrm{${word}}`
          : argument.startsWith("{")
            ? argument.slice(1, -1)
            : argument,
      );
      end = argumentEnd;
    }
    if (args.length > 1) {
      out += `${char}{${args.join("\\,")}}`;
      index = end;
    } else {
      out += char;
      index += 1;
    }
  }
  return out;
}

/**
 * A formula written in words, like `$Efficiency = (W * d_load) / (P * d_effort)$`
 * or `$e = (Product of radii of drivers) / (Product of radii of followers)$`.
 *
 * `isInlineMath` refuses these — three real words look like a sentence that lost
 * a delimiter — and they printed with their dollar signs showing, their `*`
 * eaten as emphasis. They are not that failure: a lost delimiter swallows a
 * sentence, with its full stops and commas and "where"s, while a word formula is
 * short, states an equality, and carries no sentence punctuation. Those three
 * tests keep the OCR paragraph `isInlineMath` exists for out.
 */
export function isWordFormula(candidate: string) {
  if (!candidate || /^\s|\s$/.test(candidate) || candidate.includes("\n")) return false;
  if (candidate.length > 160 || !candidate.includes("=")) return false;
  // Sentence punctuation: a full stop, comma, semicolon, colon, question or
  // exclamation mark followed by a space or the end — but not a decimal point.
  if (/[.,;:!?](?:\s|$)/.test(candidate)) return false;
  return (candidate.match(/[A-Za-z]{2,}/g) ?? []).length <= 14;
}

/**
 * Words inside maths, set as words.
 *
 * KaTeX sets letters as italic variables and drops the spaces between them, so
 * `Mechanical Advantage = L / P` prints as "MechanicalAdvantage" and a formula
 * written in words becomes a row of run-together italics. A run of words that
 * holds at least one real word (three letters or more) becomes `\text{…}`;
 * variables stay maths, and so do the short tokens real maths is made of —
 * `dx`, `dt`, `kg`. Never a subscript (`d_load` is `normalizeTex`'s), never a
 * command's name, never inside `\text{…}` already.
 */
export function proseToText(math: string) {
  return outsideTextCommands(math, (value) =>
    value.replace(/(?<![_\\A-Za-z])[A-Za-z]{2,}(?:\s+[A-Za-z]{2,})*(?![A-Za-z])/g, (words) =>
      /[A-Za-z]{3,}/.test(words) ? `\\text{${words}}` : words,
    ),
  );
}

/** Splits `math` at `separator` wherever it stands outside every `{…}` group. */
function splitOutsideBraces(math: string, separator: RegExp) {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < math.length; index += 1) {
    const char = math[index];
    if (char === "{") depth += 1;
    else if (char === "}") depth = Math.max(0, depth - 1);
    else if (depth === 0) {
      const match = separator.exec(math.slice(index));
      if (match?.index === 0) {
        parts.push(math.slice(start, index));
        start = index + match[0].length;
        index = start - 1;
      }
    }
  }
  parts.push(math.slice(start));
  return parts.map((part) => part.trim()).filter(Boolean);
}

/**
 * A displayed formula that will not fit, set the way a textbook sets it.
 *
 * KaTeX never wraps a displayed line. `A = …, B = …` — two named formulas on one
 * line — and a chain like `e = (N_last)/(N_first) = (Product of radii of
 * drivers)/(…)` ran off the right edge of the reading, and off a phone entirely.
 * So two formulas sharing a line get a line each, and a long chain breaks
 * before each further `=`, aligned on it. Short formulas are left exactly as
 * they are; the math block still scrolls for anything that cannot break.
 */
function breakDisplayedLines(tex: string, written: string) {
  // Already laid out by its writer.
  if (/\\\\|\\begin\{/.test(tex)) return tex;
  // `(A) / (B)` on its own line is a fraction, and set as one it is half as
  // wide — which is what keeps `(Product of radii of drivers) / (…)` on a phone.
  const math = tex.replace(/\(([^()]+)\)\s*\/\s*\(([^()]+)\)/g, "\\dfrac{$1}{$2}");
  const formulas = splitOutsideBraces(math, /^,\s+(?=\\text\{)/);
  const long = written.length > 48;
  if (formulas.length < 2 && !long) return math;

  const rows = formulas.flatMap((formula) => {
    const sides = long ? splitOutsideBraces(formula, /^\s=\s/) : [formula];
    if (sides.length < 2)
      return [formula.includes("=") ? formula.replace("=", "&=") : `&${formula}`];
    const [lhs, ...rest] = sides;
    return rest.map((rhs, index) => `${index === 0 ? lhs : ""} &= ${rhs}`);
  });
  if (rows.length < 2) return math;
  return `\\begin{aligned}${rows.join(" \\\\ ")}\\end{aligned}`;
}

function renderMath(value: string, displayMode: boolean) {
  const written = unescapeHtml(value).trim();
  if (!written) return "";
  // The plain-text fallback shows what was written, never the `\text{…}` and
  // `\mathrm{…}` added for KaTeX below.
  if (!katex) return plainMath(written, displayMode);

  let math = normalizeTex(proseToText(written));
  if (displayMode) math = breakDisplayedLines(math, written);

  try {
    const html = katex.renderToString(math, {
      displayMode,
      output: "html",
      strict: "ignore",
      throwOnError: false,
      trust: false,
    });
    // A formula KaTeX could not parse at all comes back as its TeX source in
    // red — the `\mathrm{…}` added above included. The written text reads
    // better. (An unknown command alone is only reddened in place, the rest
    // still typeset, and is kept.)
    return html.startsWith('<span class="katex-error"') ? plainMath(written, displayMode) : html;
  } catch {
    return plainMath(written, displayMode);
  }
}

/** The expression as readable text, for before KaTeX loads or when it fails. */
function plainMath(math: string, displayMode: boolean) {
  const tag = displayMode ? "div" : "span";
  const className = displayMode ? "math-block" : "math-inline";
  return `<${tag} class="${className}">${escapeHtml(math)}</${tag}>`;
}

/**
 * Quotes an already-escaped string for use inside an HTML attribute.
 *
 * `escapeHtml` deliberately leaves quotes alone — it exists to keep `<` and `&`
 * out of TEXT, and a bare `"` in prose is not a problem there. In an attribute
 * it is the whole problem, so anything that becomes an `href` or a `src` is
 * quoted here as well.
 */
function escapeAttribute(value: string) {
  return value.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * The URLs a model-written answer is allowed to point at.
 *
 * Answers are generated text, and generated text is not a place to trust a URL
 * scheme: `javascript:` and `data:` in an `href` are script execution, and
 * neither has an honest use in a study answer. So this is an allowlist —
 * root-relative paths (which is what the backend's own figures are:
 * `/api/figure/<sha>.png`), plus http(s) and mailto for ordinary citations.
 *
 * Leading whitespace and control characters are stripped first, because
 * `java\nscript:` is the oldest way past a check like this one.
 */
function safeUrl(value: string): string | null {
  const url = value.trim().replace(/[\u0000-\u001f\u007f]/g, "");
  if (!url) return null;
  if (/^\/(?!\/)/.test(url)) return url; // root-relative, not protocol-relative
  if (/^https?:\/\//i.test(url)) return url;
  if (/^mailto:/i.test(url)) return url;
  return null;
}

/**
 * Images and links, which the answer surface could not render at all until now.
 *
 * This matters more than it sounds. The backend draws figures itself and
 * splices them into the answer as ordinary markdown images —
 * `![Diagram](/api/figure/<sha>.png)`, `![...](/api/media/<sha>/poster.png)` —
 * so every server-rendered diagram, circuit and animation poster in the product
 * was reaching this renderer and being printed as its own literal source text.
 *
 * Images are matched before links because `![alt](src)` contains `[alt](src)`;
 * the other order turns every figure into a link named `!`.
 *
 * An image's `src` is checked with `safeUrl` like an `href` is, and a rejected
 * one falls back to the alt text rather than emitting a broken `<img>` — the
 * alt text is a description of the figure, which is a better answer than an
 * empty frame.
 */
function applyMedia(value: string, tokens: string[]): string {
  const push = (html: string) => {
    tokens.push(html);
    return `@@TOKEN_${tokens.length - 1}@@`;
  };

  return value
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (match, alt: string, src: string) => {
      const href = safeUrl(src);
      if (!href) return alt || match;
      // `loading="lazy"` because a long transcript can hold a dozen figures and
      // the reader is looking at one of them; `decoding="async"` keeps a large
      // PNG off the main thread while the rest of the answer streams in.
      return push(
        `<img src="${escapeAttribute(href)}" alt="${escapeAttribute(alt)}" ` +
          `loading="lazy" decoding="async" class="answer-figure" />`,
      );
    })
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, text: string, target: string) => {
      const href = safeUrl(target);
      if (!href) return match;
      const external = /^https?:\/\//i.test(href);
      // `noopener` severs the new tab's handle on this window; `noreferrer`
      // keeps a student's session URL out of a third party's logs.
      const rel = external ? ' target="_blank" rel="noopener noreferrer"' : "";
      // The two tags are tokenised and the LABEL is left in the stream between
      // them, rather than the whole anchor being tokenised as one unit. That is
      // what lets `[**Ohm's law**](...)` come out bold: emphasis runs after this
      // pass and can still see the text. Tokenising the anchor whole would hide
      // the label from it — and would leave any placeholder already inside the
      // label unresolved, since the final substitution is a single pass and does
      // not re-scan what it has just inserted.
      return `${push(`<a href="${escapeAttribute(href)}"${rel}>`)}${text}${push("</a>")}`;
    });
}

/**
 * Whether a `$…$` candidate is really maths.
 *
 * THE FAILURE THIS EXISTS TO STOP
 * -------------------------------
 * Course notes are OCR'd PDFs, and they do not balance their dollar signs. One
 * stray `$` pairs with the next one several sentences away, and everything
 * between is handed to KaTeX — which ignores whitespace in maths mode, so a
 * paragraph comes back as a single unreadable word:
 *
 *   $F(x) = -kx where k is force constant. or, \frac{d^2x}{dt^2} = 0 where $
 *   ->  F(x)=−kxwherekisforceconstant.or,dt2d2x=0where
 *
 * The backend already knows this shape — `_solve_prompt` in routers/challenge.py
 * warns the model that "a renderer strips the spaces inside $...$ and the student
 * is shown 'Ohm′sLaw'" — but a prompt cannot govern text lifted verbatim out of a
 * teacher's notes, so the renderer has to refuse it.
 *
 * TWO RULES, BOTH CONSERVATIVE
 * ----------------------------
 * The first is Pandoc's, and it is what every serious Markdown-plus-maths
 * implementation uses: an opening `$` is not followed by whitespace and a closing
 * `$` is not preceded by it. `costs $5 and $7 each` stops being an equation.
 *
 * The second is that maths is not prose. Real inline maths — `$V = IR$`,
 * `$R_{eq}$`, `$\frac{d^2x}{dt^2} + \omega^2 x = 0$` — contains almost no
 * ordinary words once commands and `\text{…}` are set aside, because its words
 * ARE symbols. A span carrying three or more real words is a sentence somebody
 * lost a delimiter in.
 *
 * A rejected span stays exactly as it was typed. Visible dollar signs around a
 * readable sentence is a small, obvious blemish; a paragraph rendered as one
 * 90-character word is unreadable and looks like the product is broken.
 */
export function isInlineMath(candidate: string) {
  if (!candidate || /^\s|\s$/.test(candidate)) return false;

  const symbolic = candidate
    // The source is HTML-escaped before it is scanned, so a matrix's column
    // separators arrive as `&amp;` — six of them in a 3×3 determinant, which
    // counted as six prose words and printed the whole matrix as raw LaTeX.
    .replace(/&(?:amp|lt|gt|quot|#39);/g, " ")
    // An environment's name is not prose either: `\begin{vmatrix}`.
    .replace(/\\(?:begin|end)\s*\{[a-zA-Z*]+\}/g, " ")
    // `\text{...}` and friends hold prose ON PURPOSE. It is not evidence of a
    // lost delimiter, so it is not counted as prose.
    .replace(/\\(?:text|textrm|textbf|textit|mathrm|mathbf|mathit|operatorname)\s*\{[^}]*\}/g, " ")
    // Command names are not words a reader reads: `\omega` is one symbol.
    .replace(/\\[a-zA-Z]+/g, " ");
  const words = symbolic.match(/[A-Za-z]{3,}/g) ?? [];
  return words.length < 3;
}

/**
 * Pulls code spans and maths out of a run of prose, leaving placeholders.
 *
 * A SCANNER RATHER THAN A REGEX, FOR ONE REASON: BACKTRACKING.
 *
 * `String.replace` consumes whatever it matched. So when a `$…$` span turns out
 * to be a sentence and is rejected, a regex has already eaten its CLOSING dollar
 * — and that dollar is very often the opening one of the real equation that
 * follows. On the paragraph this was reported for, rejecting
 *
 *     $F(x) = -kx where k is force constant. … 0 where $
 *
 * also destroyed the perfectly good `$\omega = \sqrt{\frac{k}{m}}$` immediately
 * after it, which then printed as raw LaTeX.
 *
 * Scanning by hand means a rejected opener costs exactly one character: the `$`
 * is emitted as itself and the walk resumes from the very next character, so
 * every later delimiter is still available to open a span that IS maths.
 */
const BLOCK_ENVIRONMENT = /\\begin\s*\{(?:[pbBvV]?matrix|cases|aligned|align\*?|array|gathered|split)\}/;

function maskCodeAndMath(value: string, tokens: string[]): string {
  const push = (html: string) => {
    tokens.push(html);
    return `@@TOKEN_${tokens.length - 1}@@`;
  };
  let out = "";
  let index = 0;

  while (index < value.length) {
    const char = value[index];

    if (char === "`") {
      const close = value.indexOf("`", index + 1);
      if (close > index + 1) {
        out += push(`<code>${value.slice(index + 1, close)}</code>`);
        index = close + 1;
        continue;
      }
    }

    if (char === "$") {
      // `$$…$$` first: the single-dollar rule below would read it as an empty
      // expression and leave a stray dollar either side of the result.
      if (value[index + 1] === "$") {
        const close = value.indexOf("$$", index + 2);
        if (close > index + 1) {
          out += push(renderMath(value.slice(index + 2, close), true));
          index = close + 2;
          continue;
        }
      }
      const line = value.indexOf("\n", index + 1);
      const close = value.indexOf("$", index + 1);
      if (close > index + 1 && (line === -1 || close < line)) {
        const inner = value.slice(index + 1, close);
        if (isInlineMath(inner)) {
          // A matrix, cases or aligned block written between single dollars is
          // still a block: set inline, a 3×3 determinant is squeezed to the
          // height of one line of text.
          out += push(renderMath(inner, BLOCK_ENVIRONMENT.test(inner)));
          index = close + 1;
          continue;
        }
        if (isWordFormula(inner)) {
          out += push(renderMath(inner, false));
          index = close + 1;
          continue;
        }
      }
      // Not maths: the dollar is literal and the scan resumes AFTER it, never
      // after the candidate's closing delimiter.
      out += "$";
      index += 1;
      continue;
    }

    out += char;
    index += 1;
  }
  return out;
}

function applyInlineStyles(value: string): string {
  const tokens: string[] = [];
  const masked = maskCodeAndMath(value, tokens);

  // After code and math are masked out, so a `![x](y)` inside a code span stays
  // the literal text it was written as, and before the emphasis pass, so an
  // underscore or asterisk in a URL is never read as formatting.
  const withMedia = applyMedia(masked, tokens);

  // Emphasis only where the stars hug their text, as CommonMark has it: `*word*`
  // is emphasis, `1.2 * 44.8` and `(1 + 0.2)*(1120 / 25)` are arithmetic. The
  // old `\*([^*]+)\*` took anything between two stars, so a worked line with two
  // multiplications lost both signs and set the middle in italics.
  const withFormatting = withMedia
    .replace(/(^|[^\w*])\*\*(?!\s)([^*\n]+?)(?<!\s)\*\*(?![\w*])/g, "$1<strong>$2</strong>")
    .replace(/(^|[^\w*])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![\w*])/g, "$1<em>$2</em>")
    // What is left of the stars is multiplication, and reads as ×.
    .replace(/(?<=[\w)\]]) \* (?=[\w(\[])/g, " × ")
    .replace(/(?<=[\d)\]])\*(?=[\d(\[])/g, "×")
    // A quantity named in prose without its dollars — "the constant P_0" — is
    // subscripted. Narrowly: one standalone letter, then digits or at most three
    // letters, so `file_name` and `@@TOKEN_3@@` are never touched.
    .replace(/(?<![\w@])([A-Za-z])_(\d{1,2}|[A-Za-z]{1,3})(?![\w@])/g, "$1<sub>$2</sub>");

  return withFormatting.replace(/@@TOKEN_(\d+)@@/g, (_, index) => tokens[Number(index)] ?? "");
}

function isTableRow(value: string) {
  const trimmed = value.trim();
  return trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.split("|").length > 2;
}

function parseTableCells(value: string) {
  return value
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isTableSeparator(value: string) {
  const cells = parseTableCells(value);
  return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell));
}

function renderTable(rows: string[]) {
  if (rows.length < 2 || !isTableSeparator(rows[1])) {
    return rows.map((row) => `<p>${applyInlineStyles(row)}</p>`).join("");
  }

  const headers = parseTableCells(rows[0]);
  const bodyRows = rows.slice(2).filter(isTableRow).map(parseTableCells);
  if (headers.length === 0 || bodyRows.length === 0) {
    return rows.map((row) => `<p>${applyInlineStyles(row)}</p>`).join("");
  }

  const headerHtml = headers.map((cell) => `<th>${applyInlineStyles(cell)}</th>`).join("");
  const bodyHtml = bodyRows
    .map((row) => {
      const cells = headers
        .map((_, index) => `<td>${applyInlineStyles(row[index] ?? "")}</td>`)
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  return `<table><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`;
}

/**
 * A determinant a scanned paper flattened — `|a^2+1, ab; ab, b^2+1|` — set back
 * as a grid. Stored questions and answers carry it that way, inside `$…$` and
 * outside; KaTeX would otherwise print the run of entries, or not typeset it
 * at all. Only a real grid: two or more rows, each with the same number (two or
 * more) of entries, so a table row or `|x|` is never touched.
 */
const FLAT_GRID = /\|([^|$\n]{3,600}?;[^|$\n]{1,600}?)\|(\s*=\s*[^.,;:?!\n$]*[^.,;:?!\n$\s])?/g;

export function rebuildFlatGrids(source: string) {
  if (!source.includes(";") || !source.includes("|")) return source;
  return source.replace(FLAT_GRID, (match, grid: string, rhs: string | undefined, offset: number) => {
    const rows = grid.split(";").map((row) => row.split(",").map((entry) => entry.trim()));
    const width = rows[0].length;
    if (rows.length < 2 || width < 2 || rows.some((row) => row.length !== width || row.some((entry) => !entry))) {
      return match;
    }
    const matrix = `\\begin{vmatrix} ${rows.map((row) => row.join(" & ")).join(" \\\\ ")} \\end{vmatrix}`;
    const lineStart = source.lastIndexOf("\n", offset) + 1;
    const insideMath = ((source.slice(lineStart, offset).match(/(?<!\\)\$/g) ?? []).length) % 2 === 1;
    return insideMath ? `${matrix}${rhs ?? ""}` : `$${matrix}${rhs ? ` ${rhs.trim()}` : ""}$`;
  });
}

function renderMd(source: string): string {
  const lines = escapeHtml(rebuildFlatGrids(source)).split("\n");
  let output = "";
  let listType: "ol" | "ul" | null = null;
  let inCodeBlock = false;
  let codeLines: string[] = [];
  let inMathBlock = false;
  let mathLines: string[] = [];
  let tableLines: string[] = [];

  const flush = () => {
    if (listType) {
      output += `</${listType}>`;
      listType = null;
    }
  };

  const flushTable = () => {
    if (tableLines.length === 0) return;
    output += renderTable(tableLines);
    tableLines = [];
  };

  const flushCodeBlock = () => {
    if (!inCodeBlock) return;
    output += `<pre><code>${codeLines.join("\n")}</code></pre>`;
    inCodeBlock = false;
    codeLines = [];
  };

  const flushMathBlock = () => {
    if (!inMathBlock) return;
    output += `<div class="math-block">${renderMath(mathLines.join("\n"), true)}</div>`;
    inMathBlock = false;
    mathLines = [];
  };

  for (const raw of lines) {
    const singleLineMathMatch = raw.match(/^\s*\$\$(.+)\$\$\s*$/);
    if (singleLineMathMatch && !inCodeBlock && !inMathBlock) {
      flushTable();
      flush();
      output += `<div class="math-block">${renderMath(singleLineMathMatch[1], true)}</div>`;
      continue;
    }

    if (raw.trimStart().startsWith("```")) {
      flushTable();
      flush();
      flushMathBlock();
      if (inCodeBlock) {
        flushCodeBlock();
      } else {
        inCodeBlock = true;
        codeLines = [];
      }
      continue;
    }

    if (raw.trim() === "$$") {
      flushTable();
      flush();
      flushCodeBlock();
      if (inMathBlock) {
        flushMathBlock();
      } else {
        inMathBlock = true;
        mathLines = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(raw);
      continue;
    }

    if (inMathBlock) {
      mathLines.push(raw);
      continue;
    }

    if (isTableRow(raw)) {
      flush();
      tableLines.push(raw);
      continue;
    }

    flushTable();

    const headingMatch = raw.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flush();
      const level = headingMatch[1].length;
      output += `<h${level}>${applyInlineStyles(headingMatch[2])}</h${level}>`;
      continue;
    }

    if (/^\s*\d+\.\s+/.test(raw)) {
      if (listType !== "ol") {
        flush();
        output += "<ol>";
        listType = "ol";
      }
      output += `<li>${applyInlineStyles(raw.replace(/^\s*\d+\.\s+/, ""))}</li>`;
    } else if (/^\s*[-*]\s+/.test(raw)) {
      if (listType !== "ul") {
        flush();
        output += "<ul>";
        listType = "ul";
      }
      output += `<li>${applyInlineStyles(raw.replace(/^\s*[-*]\s+/, ""))}</li>`;
    } else if (raw.trim() === "") {
      flush();
    } else {
      flush();
      output += `<p>${applyInlineStyles(raw)}</p>`;
    }
  }

  flushTable();
  flush();
  flushCodeBlock();
  flushMathBlock();
  return output;
}

export function renderMarkdown(source: string) {
  return renderMd(source);
}

/**
 * Renders a single run of prose that may contain LaTeX, as inline-safe HTML.
 *
 * Challenge lessons, worked solutions and exam questions arrive as plain
 * strings that carry `$...$` and `$$...$$` inside otherwise ordinary sentences,
 * and they are rendered inside existing `<p>` elements. `renderMarkdown` is the
 * wrong tool there: it emits block-level markup, and a `<p>` inside a `<p>` is
 * invalid HTML that the browser silently restructures.
 *
 * So this does the text-level part only — escape, then math, code and emphasis
 * — and emits nothing block-level. Newlines are left alone for the caller's
 * `whitespace-pre-wrap` to handle, so line breaks survive without `<br>` tags
 * fighting the CSS.
 */
export function renderMathText(source: string) {
  const escaped = escapeHtml(source);

  // Display math first: `$$…$$` would otherwise be eaten as two empty inline
  // expressions by the single-dollar rule.
  const blocks: string[] = [];
  const withBlocks = escaped.replace(/\$\$([\s\S]+?)\$\$/g, (_match, math: string) => {
    blocks.push(renderMath(math, true));
    return `@@MATHBLOCK_${blocks.length - 1}@@`;
  });

  return applyInlineStyles(withBlocks).replace(
    /@@MATHBLOCK_(\d+)@@/g,
    (_, index) => blocks[Number(index)] ?? "",
  );
}

/**
 * A streaming answer, cut back to what can already be drawn.
 *
 * Tokens arrive mid-formula: `$\frac{V_{in}` lands a frame before `}{R}$`, and
 * in between the reader sees raw LaTeX that then snaps into a formula — the
 * answer looks broken for as long as the formula takes to arrive. So an
 * unclosed `$$` block, or an unclosed `$` on the line being written, is held
 * back until its closing delimiter streams in. Inline maths never spans lines,
 * so a lone `$` (a price, say) is held for at most the rest of its line.
 */
export function streamSafeMarkdown(text: string) {
  if (!text.includes("$")) return text;
  // Fenced code shows dollars as themselves; count only outside it.
  const fences = text.match(/^\s*```/gm)?.length ?? 0;
  if (fences % 2 === 1) return text;
  const outsideCode = text.replace(/```[\s\S]*?```/g, (block) => " ".repeat(block.length));

  const blocks = [...outsideCode.matchAll(/\$\$/g)];
  if (blocks.length % 2 === 1) return text.slice(0, blocks[blocks.length - 1].index).trimEnd();

  const lineStart = outsideCode.lastIndexOf("\n") + 1;
  const line = outsideCode.slice(lineStart).replace(/\$\$/g, "  ").replace(/`[^`]*`/g, (span) => " ".repeat(span.length));
  const singles = [...line.matchAll(/(?<!\\)\$/g)];
  if (singles.length % 2 === 1) return text.slice(0, lineStart + singles[singles.length - 1].index!).trimEnd();
  return text;
}
