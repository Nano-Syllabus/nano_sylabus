import { existsSync, readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ANSWER_FONTS, AnswerFontPicker, answerFontStyle } from "@/components/answer-font-picker";

/**
 * The handwritten faces a reader can pick for worked-example answers.
 *
 * The picker names them in TypeScript and `app/globals.css` declares them, so
 * nothing but this stops the two drifting apart — or a renamed file in
 * `public/fonts` quietly dropping an answer back to Inter.
 */

const styles = readFileSync("app/globals.css", "utf8");
const revision = readFileSync("components/revision-docs-client.tsx", "utf8");

const faces = [...styles.matchAll(/@font-face\s*{([^}]*)}/g)].map(([, body]) => ({
  family: /font-family:\s*"([^"]+)"/.exec(body)?.[1],
  src: /url\("([^"]+)"\)/.exec(body)?.[1],
}));

describe("answer fonts", () => {
  const handwritten = ANSWER_FONTS.filter((font) => font.id !== "plain");

  it("declares a face for every font the picker offers, from a file that exists", () => {
    for (const font of handwritten) {
      const face = faces.find((entry) => `"${entry.family}"` === font.family);
      expect(face, font.label).toBeDefined();
      expect(existsSync(`public${decodeURIComponent(face!.src!)}`), face!.src).toBe(true);
    }
  });

  it("offers every font, with Stay With Me until the reader picks", () => {
    const picker = renderToStaticMarkup(
      createElement(AnswerFontPicker, { value: "stay-with-me", onChange: () => {} }),
    );
    for (const font of ANSWER_FONTS) expect(picker).toContain(`>${font.label}</option>`);
    expect(picker).toMatch(/<option value="stay-with-me"[^>]* selected=""/);
    expect(picker).toContain("Font for worked answers");
  });

  it("sets the face through one variable the answers read", () => {
    expect(answerFontStyle("winkle")).toEqual({ "--answer-font": '"Winkle"' });
    expect(styles).toContain('var(--answer-font, "Stay With Me")');
    expect(revision).toContain("style={answerFontStyle(answerFont)}");
  });

  it("writes only the answer on ruled paper, not the question", () => {
    expect(revision).toContain('className="answer-paper mt-3"');
    expect(revision).toContain("answer-paper-body font-revision-answer");
    expect(revision.match(/font-revision-answer/g)).toHaveLength(1);
  });
});
