import { existsSync, readFileSync } from "node:fs";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ANSWER_FONTS, AnswerFontPicker, answerFontStyle } from "@/components/answer-font-picker";
import { WorkedExampleCard, workedAnswerClass } from "@/components/worked-example-card";

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
    expect(picker).toContain("Handwriting font");
  });

  it("sets the face through one variable the answers read", () => {
    expect(answerFontStyle("winkle")).toEqual({ "--answer-font": '"Winkle"' });
    expect(styles).toContain('var(--answer-font, "Stay With Me")');
    expect(revision).toContain("style={answerFontStyle(answerFont)}");
  });

  it("writes the hands a little finer on the sheet, but not the printed face or the maths", () => {
    // "They are looking bold": a paper-coloured hairline thins each glyph.
    expect(styles).toContain("-webkit-text-stroke: var(--answer-thin, 0.025em) var(--paper-bg);");
    expect(answerFontStyle("plain")).toMatchObject({ "--answer-thin": "0px" });
    // Faux bold goes hollow under the stroke, and KaTeX's hairlines vanish.
    expect(styles).toContain(".answer-paper .font-revision-answer :is(strong, b, .katex, code, table) {");
  });

  it("puts the whole example on the ruled sheet, question and answer both handwritten", () => {
    const card = renderToStaticMarkup(
      createElement(
        WorkedExampleCard,
        { label: "Example 1 · 2072 Ashwin · 3 marks", question: "What is mechanics?" } as ComponentProps<
          typeof WorkedExampleCard
        >,
        createElement("div", { className: workedAnswerClass }, createElement("p", null, "Mechanics is...")),
      ),
    );
    // The card IS the sheet: label, question and answer all on its lines.
    expect(card).toMatch(/^<article class="answer-paper">/);
    expect(card).toContain(">Example 1 · 2072 Ashwin · 3 marks</p>");
    // The question in red pen (user, 2026-09-24), handwritten like the answer.
    expect(card).toMatch(/ answer-paper-body answer-paper-question font-revision-answer text-sm"><p>What is mechanics\?/);
    expect(card.indexOf("What is mechanics?")).toBeLessThan(card.indexOf(">Solution</p>"));
    // The question in the same hand as the answer, in red ink.
    expect(card.match(/font-revision-answer/g)).toHaveLength(2);
    expect(workedAnswerClass).toContain("answer-paper-body font-revision-answer");
    // Revision draws its worked examples with it.
    expect(revision).toContain("<WorkedExampleCard");
    expect(revision).toContain("className={workedAnswerClass}");
    // Labels are ruled like the writing, with a skipped line before the solution.
    expect(styles).toMatch(/\.answer-paper-label,\s*\.answer-paper-body > :is\(p,/);
    expect(styles).toContain(".answer-paper-body + .answer-paper-label {");
  });

  it("folds to the question in a challenge's step 1, on the same sheet", () => {
    const card = renderToStaticMarkup(
      createElement(
        WorkedExampleCard,
        { label: "Example 1", question: "What is mechanics?", collapsible: true } as ComponentProps<
          typeof WorkedExampleCard
        >,
        createElement("div", { className: workedAnswerClass }, createElement("p", null, "Mechanics is...")),
      ),
    );
    expect(card).toMatch(/^<details class="answer-paper group">/);
    // Label and question are what shows closed; the solution unfolds under them.
    const summary = card.slice(card.indexOf("<summary"), card.indexOf("</summary>"));
    expect(summary).toContain(">Example 1</p>");
    expect(summary).toContain("What is mechanics?");
    expect(summary).not.toContain("Solution");
    expect(card.indexOf("</summary>")).toBeLessThan(card.indexOf("Mechanics is..."));
    // The challenge draws its worked examples with it, in the reader's face.
    const challenge = readFileSync("components/challenges-dashboard-client.tsx", "utf8");
    expect(challenge).toContain("<WorkedExampleCard\n                            collapsible");
    expect(challenge).toContain("className={workedAnswerClass}");
    expect(challenge).toContain("style={answerFontStyle(answerFont)}");
  });
});
