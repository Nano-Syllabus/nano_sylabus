import katex from "katex";

function escapeHtml(value: string) {
  return value.replace(/[&<>]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[char]!);
}

function renderMath(value: string, displayMode: boolean) {
  const math = value.trim();
  if (!math) return "";

  try {
    return katex.renderToString(math, {
      displayMode,
      output: "html",
      strict: "ignore",
      throwOnError: false,
      trust: false,
    });
  } catch {
    const tag = displayMode ? "div" : "span";
    const className = displayMode ? "math-block" : "math-inline";
    return `<${tag} class="${className}">${escapeHtml(math)}</${tag}>`;
  }
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

  const withFormatting = masked
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
