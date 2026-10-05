import { readFileSync } from "node:fs";
import { runInNewContext, Script } from "node:vm";
import { describe, expect, it, vi } from "vitest";

function loadListeners() {
  const source = readFileSync("app/layout.tsx", "utf8");
  const match = source.match(/const extensionErrorFilterScript = (String\.raw)?(`[^`]*`);/);
  if (!match) throw new Error("Missing extension error filter script");
  const script = runInNewContext(`${match[1] || ""}${match[2]}`) as string;
  const listeners: Record<string, (event: Record<string, unknown>) => void> = {};
  new Script(script).runInNewContext({
    window: { addEventListener: (type: string, callback: typeof listeners[string]) => { listeners[type] = callback; } },
  });
  return listeners;
}

describe("development extension error filter", () => {
  it("generates valid JavaScript and handles browser extension errors", () => {
    const listeners = loadListeners();
    const event = {
      filename: "chrome-extension://extension/contentscript.js",
      stopImmediatePropagation: vi.fn(),
      preventDefault: vi.fn(),
    };
    listeners.error(event);
    expect(event.stopImmediatePropagation).toHaveBeenCalledOnce();
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it("keeps application errors visible", () => {
    const listeners = loadListeners();
    const event = {
      filename: "http://localhost:3001/_next/static/chunks/app.js",
      error: { stack: "Error at http://localhost:3001/_next/static/chunks/app.js" },
      stopImmediatePropagation: vi.fn(),
      preventDefault: vi.fn(),
    };
    listeners.error(event);
    expect(event.stopImmediatePropagation).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});
