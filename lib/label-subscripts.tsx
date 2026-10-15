import { Fragment, type ReactNode } from "react";

/**
 * "M_O", "R_{eq}", "I_a" as a symbol with a subscript, for the short labels the
 * model writes on sliders, readouts, graph axes and figures. Those are plain
 * text, not Markdown, so a raw underscore would otherwise reach the student.
 */
const SUBSCRIPT = /([A-Za-zΑ-Ωα-ω])_\{?([A-Za-z0-9]+)\}?/g;

export function splitSubscripts(text: string): Array<{ text: string; sub: boolean }> {
  const parts: Array<{ text: string; sub: boolean }> = [];
  let last = 0;
  for (const match of text.matchAll(SUBSCRIPT)) {
    parts.push({ text: text.slice(last, match.index) + match[1], sub: false });
    parts.push({ text: match[2], sub: true });
    last = match.index! + match[0].length;
  }
  parts.push({ text: text.slice(last), sub: false });
  return parts.filter((part) => part.text);
}

/** For HTML text. */
export function withSubscripts(text: string): ReactNode {
  return splitSubscripts(text).map((part, i) =>
    part.sub ? <sub key={i}>{part.text}</sub> : <Fragment key={i}>{part.text}</Fragment>,
  );
}

/** For SVG <text>: tspans dropped below the baseline. */
export function svgSubscripts(text: string): ReactNode {
  const parts = splitSubscripts(text);
  return parts.map((part, i) =>
    part.sub ? (
      <tspan key={i} dy="0.3em" fontSize="0.75em">
        {part.text}
      </tspan>
    ) : (
      // Back up to the baseline after a subscript.
      <tspan key={i} dy={i > 0 && parts[i - 1].sub ? "-0.3em" : undefined}>
        {part.text}
      </tspan>
    ),
  );
}
