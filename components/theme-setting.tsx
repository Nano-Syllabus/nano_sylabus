"use client";

import { useEffect, useState } from "react";
import {
  applyTheme,
  getThemeMode,
  resolveTheme,
  setThemeMode,
  subscribeToTheme,
  type ThemeMode,
} from "@/lib/theme";

const modeOptions: Array<{ value: ThemeMode; label: string }> = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function ThemeSetting() {
  const [mode, setMode] = useState<ThemeMode>("light");

  useEffect(() => {
    const initialMode = getThemeMode();
    setMode(initialMode);
    applyTheme(resolveTheme(initialMode));
    return subscribeToTheme((_, nextMode) => setMode(nextMode));
  }, []);

  function chooseMode(next: ThemeMode) {
    if (next === mode) return;
    setMode(next);
    setThemeMode(next);
  }

  return (
    <section
      aria-labelledby="appearance-heading"
      className="mb-6 rounded-lg border border-border bg-bg-primary"
    >
      <div className="border-b border-border px-5 py-3">
        <h2 id="appearance-heading" className="font-display text-xl">
          Appearance
        </h2>
      </div>
      <div className="space-y-5 p-5">
        <div>
          <p id="color-mode-label" className="text-sm font-medium">
            Color mode
          </p>
          <div
            role="radiogroup"
            aria-labelledby="color-mode-label"
            className="mt-2 grid grid-cols-3 gap-1 rounded-xl border border-border bg-bg-secondary p-1"
          >
            {modeOptions.map(({ value, label }) => {
              const isSelected = mode === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => chooseMode(value)}
                  className={
                    "min-h-10 rounded-lg px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2 focus-visible:ring-offset-bg-secondary " +
                    (isSelected
                      ? "bg-text-primary font-semibold text-text-inverse"
                      : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary")
                  }
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
