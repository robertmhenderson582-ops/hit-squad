export type ThemeChoice = "night" | "day" | "match";
export type TypeSize = "sm" | "md" | "lg";
export type Density = "compact" | "comfortable";
export type LockMinutes = 0 | 5 | 10 | 15 | 30 | 60;

export type DisplayPrefs = {
  theme: ThemeChoice;
  easyMode: boolean;
  typeSize: TypeSize;
  density: Density;
  highContrast: boolean;
  reduceMotion: boolean;
  largeTargets: boolean;
  confirmDelete: boolean;
  inboxSound: boolean;
  lockMinutes: LockMinutes;
};

export const DISPLAY_KEY = "hs_display";

export const DEFAULT_DISPLAY: DisplayPrefs = {
  theme: "match",
  easyMode: false,
  typeSize: "md",
  density: "comfortable",
  highContrast: false,
  reduceMotion: false,
  largeTargets: false,
  confirmDelete: true,
  inboxSound: true,
  lockMinutes: 15,
};

export function resolveTheme(theme: ThemeChoice): "night" | "day" {
  if (theme === "night" || theme === "day") return theme;
  if (typeof window === "undefined") return "night";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "day" : "night";
}

export function readDisplay(): DisplayPrefs {
  if (typeof window === "undefined") return DEFAULT_DISPLAY;
  try {
    const raw = window.localStorage.getItem(DISPLAY_KEY);
    if (!raw) return DEFAULT_DISPLAY;
    return { ...DEFAULT_DISPLAY, ...(JSON.parse(raw) as Partial<DisplayPrefs>) };
  } catch {
    return DEFAULT_DISPLAY;
  }
}

export function writeDisplay(prefs: DisplayPrefs) {
  window.localStorage.setItem(DISPLAY_KEY, JSON.stringify(prefs));
}

export function applyDisplay(prefs: DisplayPrefs) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const theme = resolveTheme(prefs.theme);
  root.dataset.theme = theme;
  root.dataset.easy = prefs.easyMode ? "on" : "off";
  root.dataset.type = prefs.typeSize;
  root.dataset.density = prefs.density;
  root.dataset.contrast = prefs.highContrast ? "high" : "normal";
  root.dataset.motion = prefs.reduceMotion ? "reduce" : "full";
  root.dataset.targets = prefs.largeTargets ? "large" : "normal";
}
