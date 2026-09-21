import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Two things about the challenge screen a student sees every day, pinned because
 * both were done once and quietly lost again in a merge.
 *
 * Read from source, as the other challenge-screen layout tests are: the detail
 * view needs the whole hub around it to render, and what is asserted here is the
 * wiring, not the markup.
 */
const source = readFileSync("components/challenges-dashboard-client.tsx", "utf8");

describe("the practice step's heading", () => {
  it("is the instruction itself, not 'Your Turn'", () => {
    // Rendered text, not the comment that explains the change.
    expect(source).not.toContain("📝 Your Turn");
    expect(source).not.toMatch(/>\s*Your Turn\s*</i);
    expect(source).toMatch(/<h2 className="text-xl font-semibold">\s*📝\{" "\}\s*\{challenge\.status === "completed"/);
    expect(source).toContain('"Write your answers on paper."');
  });
});

describe("leaving focus mode", () => {
  it("closes the challenge from the Exit button, back to the hub", () => {
    expect(source).toContain("onClick={() => (focusMode ? onBack() : setFocusMode(true))}");
    expect(source).toContain('aria-label={focusMode ? "Exit the challenge" : "Enter focus mode"}');
  });

  it("closes it the same way from Escape", () => {
    // Unless something open on top (the concepts sheet) already used the key.
    expect(source).toContain('if (event.key === "Escape" && !event.defaultPrevented) onBack();');
    expect(source).not.toContain('if (event.key === "Escape") setFocusMode(false);');
  });

  it("lands on the hub's own URL, so a refresh does not reopen the challenge", () => {
    expect(source).toContain('url.searchParams.delete("challenge")');
    expect(source).toContain("onBack={closeChallenge}");
  });

  it("does not pull focus back to Exit whenever the hub re-renders", () => {
    // The focus call is keyed on focusMode alone; the Escape handler is the
    // effect that depends on onBack.
    expect(source).toContain("if (focusMode) exitFocusButtonRef.current?.focus();\n  }, [focusMode]);");
  });
});
