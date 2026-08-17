"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import {
  applyTheme,
  getInitialTheme,
  setTheme,
  subscribeToTheme,
  type Theme,
} from "@/lib/theme";

const themeOptions: Array<{
  value: Theme;
  label: string;
  description: string;
  Icon: typeof Sun;
}> = [
  {
    value: "light",
    label: "Day mode",
    description: "Bright and clear",
    Icon: Sun,
  },
  {
    value: "dark",
    label: "Night mode",
    description: "Easy on the eyes",
    Icon: Moon,
  },
];

export function ThemeSetting() {
  const [theme, setLocalTheme] = useState<Theme>("light");

  useEffect(() => {
    const initialTheme = getInitialTheme();
    setLocalTheme(initialTheme);
    applyTheme(initialTheme);
    return subscribeToTheme(setLocalTheme);
  }, []);

  function chooseTheme(nextTheme: Theme) {
    if (nextTheme === theme) return;
    setLocalTheme(nextTheme);
    setTheme(nextTheme);
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
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium">Theme</p>
          <p className="mt-1 max-w-md text-sm text-text-secondary">
            Choose how Nano Syllabus looks on this device. Your choice updates immediately and is saved for your next visit.
          </p>
        </div>
        <div className="grid w-full shrink-0 grid-cols-2 gap-2 rounded-xl border border-border bg-bg-secondary p-1 sm:w-[290px]">
          {themeOptions.map(({ value, label, description, Icon }) => {
            const isSelected = theme === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={isSelected}
                aria-label={`${label}: ${description}`}
                onClick={() => chooseTheme(value)}
                className={
                  "flex min-h-12 items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2 focus-visible:ring-offset-bg-secondary " +
                  (isSelected
                    ? "bg-text-primary text-text-inverse"
                    : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary")
                }
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-xs font-medium">{label}</span>
                  <span
                    className={
                      "mt-0.5 block truncate text-[11px] " +
                      (isSelected ? "text-text-inverse/70" : "text-text-muted")
                    }
                  >
                    {description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
