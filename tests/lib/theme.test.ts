import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getInitialTheme,
  setTheme,
  subscribeToTheme,
  THEME_STORAGE_KEY,
} from "@/lib/theme";

describe("shared portal theme", () => {
  let browserWindow: EventTarget & { localStorage: Storage };
  let values: Map<string, string>;
  let setAttribute: ReturnType<typeof vi.fn>;
  let colorScheme: { value: string };

  beforeEach(() => {
    values = new Map();
    const localStorage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
      removeItem: vi.fn((key: string) => values.delete(key)),
      clear: vi.fn(() => values.clear()),
      key: vi.fn(() => null),
      get length() {
        return values.size;
      },
    } as Storage;
    browserWindow = Object.assign(new EventTarget(), { localStorage });
    setAttribute = vi.fn();
    colorScheme = { value: "" };

    vi.stubGlobal("window", browserWindow);
    vi.stubGlobal("document", {
      documentElement: {
        setAttribute,
        style: {
          set colorScheme(value: string) {
            colorScheme.value = value;
          },
          get colorScheme() {
            return colorScheme.value;
          },
        },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stores one preference and notifies every mounted portal toggle", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToTheme(listener);

    setTheme("light");

    expect(values.get(THEME_STORAGE_KEY)).toBe("light");
    expect(setAttribute).toHaveBeenCalledWith("data-theme", "light");
    expect(colorScheme.value).toBe("light");
    expect(listener).toHaveBeenCalledWith("light");
    expect(getInitialTheme()).toBe("light");
    unsubscribe();
  });

  it("applies a theme changed from another browser tab", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToTheme(listener);
    const event = new Event("storage");
    Object.defineProperties(event, {
      key: { value: THEME_STORAGE_KEY },
      newValue: { value: "dark" },
    });

    browserWindow.dispatchEvent(event);

    expect(setAttribute).toHaveBeenCalledWith("data-theme", "dark");
    expect(colorScheme.value).toBe("dark");
    expect(listener).toHaveBeenCalledWith("dark");
    unsubscribe();
  });
});
