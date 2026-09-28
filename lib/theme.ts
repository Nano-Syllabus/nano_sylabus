/** What the page is painted in. */
export type Theme = "light" | "dark";
/** What the student chose: a theme, or "follow this device". */
export type ThemeMode = "system" | Theme;

export const THEME_STORAGE_KEY = "ns-theme-v2";
const THEME_CHANGE_EVENT = "ns-theme-change";
const DARK_QUERY = "(prefers-color-scheme: dark)";

function isMode(value: unknown): value is ThemeMode {
  return value === "system" || value === "light" || value === "dark";
}

function readStorage(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private mode: the choice still applies for this visit.
  }
}

/** The stored choice. A student who never chose keeps the old default, light. */
export function getThemeMode(): ThemeMode {
  if (typeof window === "undefined") return "light";
  const stored = readStorage(THEME_STORAGE_KEY);
  return isMode(stored) ? stored : "light";
}

export function resolveTheme(mode: ThemeMode): Theme {
  if (mode !== "system") return mode;
  if (typeof window === "undefined") return "light";
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

/** The theme on screen now. */
export function getInitialTheme(): Theme {
  return resolveTheme(getThemeMode());
}

export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.style.colorScheme = theme;
}

export function setThemeMode(mode: ThemeMode) {
  writeStorage(THEME_STORAGE_KEY, mode);
  applyTheme(resolveTheme(mode));
  window.dispatchEvent(new CustomEvent<ThemeMode>(THEME_CHANGE_EVENT, { detail: mode }));
}

/** Pick a theme outright — the sidebar's toggle. */
export function setTheme(theme: Theme) {
  setThemeMode(theme);
}

/**
 * Hears every change to the theme on screen: a choice here, one made in another
 * tab, and — while the choice is "system" — the device switching light/dark.
 */
export function subscribeToTheme(listener: (theme: Theme, mode: ThemeMode) => void) {
  if (typeof window === "undefined") return () => {};

  const emit = (mode: ThemeMode) => {
    const theme = resolveTheme(mode);
    applyTheme(theme);
    listener(theme, mode);
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY || !isMode(event.newValue)) return;
    emit(event.newValue);
  };
  const onThemeChange = (event: Event) => {
    const mode = (event as CustomEvent<unknown>).detail;
    if (isMode(mode)) emit(mode);
  };
  const media = window.matchMedia(DARK_QUERY);
  const onDeviceChange = () => {
    if (getThemeMode() === "system") emit("system");
  };

  window.addEventListener("storage", onStorage);
  window.addEventListener(THEME_CHANGE_EVENT, onThemeChange);
  media.addEventListener("change", onDeviceChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(THEME_CHANGE_EVENT, onThemeChange);
    media.removeEventListener("change", onDeviceChange);
  };
}
