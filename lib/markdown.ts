function escapeHtml(value: string) {
  return value.replace(/[&<>]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[char]!);
}

function applyInlineStyles(value: string): string {
  const tokens: string[] = [];
  const masked = value.replace(/`([^`]+)`|\$([^$\n]+)\$/g, (match, codeContent, mathContent) => {
    if (codeContent) {
      tokens.push(`<code>${codeContent}</code>`);
    } else {
      tokens.push(`<span class="math-inline">${mathContent}</span>`);
    }
    return `@@TOKEN_${tokens.length - 1}@@`;
  });

  const withFormatting = masked
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");

  return withFormatting.replace(/@@TOKEN_(\d+)@@/g, (_, index) => tokens[Number(index)] ?? "");
}

function renderMd(source: string): string {
  const lines = escapeHtml(source).split("\n");
  let output = "";
  let listType: "ol" | "ul" | null = null;
  let inCodeBlock = false;
  let codeLines: string[] = [];
  let inMathBlock = false;
  let mathLines: string[] = [];

  const flush = () => {
    if (listType) {
      output += `</${listType}>`;
      listType = null;
    }
  };

  const flushCodeBlock = () => {
    if (!inCodeBlock) return;
    output += `<pre><code>${codeLines.join("\n")}</code></pre>`;
    inCodeBlock = false;
    codeLines = [];
  };

  const flushMathBlock = () => {
    if (!inMathBlock) return;
    output += `<div class="math-block">${mathLines.join("<br />")}</div>`;
    inMathBlock = false;
    mathLines = [];
  };

  for (const raw of lines) {
    if (raw.trimStart().startsWith("```")) {
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

  flush();
  flushCodeBlock();
  flushMathBlock();
  return output;
}

export function renderMarkdown(source: string) {
  return renderMd(source);
}
