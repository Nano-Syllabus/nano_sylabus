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

function renderMath(value: string, displayMode: boolean) {
  const math = unescapeHtml(value).trim();
  if (!math) return "";

  if (!katex) return plainMath(math, displayMode);

  try {
    return katex.renderToString(math, {
      displayMode,
      output: "html",
      strict: "ignore",
      throwOnError: false,
      trust: false,
    });
  } catch {
    return plainMath(math, displayMode);
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
  if (/^\/(?!\/)/.test(url)) return url;          // root-relative, not protocol-relative
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

function applyInlineStyles(value: string): string {
  const tokens: string[] = [];
  const masked = value.replace(/`([^`]+)`|\$([^$\n]+)\$/g, (match, codeContent, mathContent) => {
    if (codeContent) {
      tokens.push(`<code>${codeContent}</code>`);
    } else {
      tokens.push(renderMath(mathContent, false));
    }
    return `@@TOKEN_${tokens.length - 1}@@`;
  });

  // After code and math are masked out, so a `![x](y)` inside a code span stays
  // the literal text it was written as, and before the emphasis pass, so an
  // underscore or asterisk in a URL is never read as formatting.
  const withMedia = applyMedia(masked, tokens);

  const withFormatting = withMedia
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");

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
      const cells = headers.map((_, index) => `<td>${applyInlineStyles(row[index] ?? "")}</td>`).join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  return `<table><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`;
}

function renderMd(source: string): string {
  const lines = escapeHtml(source).split("\n");
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
