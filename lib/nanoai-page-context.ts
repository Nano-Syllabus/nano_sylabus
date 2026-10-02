"use client";

/**
 * WHAT THE STUDENT IS LOOKING AT, FOR ASK AI.
 *
 * The Revision page and a challenge mark the parts of the screen worth asking
 * about with `data-nanoai-context` — the topic's page, a challenge's column,
 * the Concepts sheet when it is open. When a question is sent from the bubble
 * their text is read off the page as it is drawn right now: the language the
 * student switched to, the MCQ page they are on, the sheet they opened. No
 * page has to hand its data to the chat, and nothing is read that isn't shown.
 *
 * Maths is set by KaTeX, whose text is the formula drawn twice; each formula
 * is put back as its TeX source between dollars instead.
 */
const MAX_CHARS = 14_000;

function readable(element: Element) {
  const copy = element.cloneNode(true) as Element;
  copy.querySelectorAll(".katex").forEach((math) => {
    const tex = math.querySelector('annotation[encoding="application/x-tex"]')?.textContent?.trim();
    const display = math.closest(".katex-display");
    math.replaceWith(tex ? (display ? `\n$$${tex}$$\n` : `$${tex}$`) : (math.textContent ?? ""));
  });
  // Controls and decoration are not content.
  copy
    .querySelectorAll("button, select, input, textarea, svg, img, video, [aria-hidden='true'], script, style")
    .forEach((node) => node.remove());
  // Block ends become line breaks, so paragraphs and list items stay apart.
  copy.querySelectorAll("p, li, h1, h2, h3, h4, h5, h6, div, br, tr").forEach((node) => node.append("\n"));
  return (copy.textContent ?? "")
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function readNanoAiPageContext() {
  const regions = Array.from(document.querySelectorAll("[data-nanoai-context]")).filter(
    // The outermost marked region only, and never the chat panel itself.
    (region) => !region.parentElement?.closest("[data-nanoai-context]") && !region.closest("[data-nanoai-panel]"),
  );
  // An open sheet is what the student is reading now, so it goes first.
  regions.sort((a, b) => Number(Boolean(b.closest("[role='dialog']"))) - Number(Boolean(a.closest("[role='dialog']"))));
  const text = regions
    .map((region) => {
      const label = region.getAttribute("data-nanoai-context");
      const body = readable(region);
      return body ? (label ? `## ${label}\n${body}` : body) : "";
    })
    .filter(Boolean)
    .join("\n\n");
  return text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)}\n…` : text;
}
