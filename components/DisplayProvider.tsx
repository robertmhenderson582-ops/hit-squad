"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  applyDisplay,
  DEFAULT_DISPLAY,
  type DisplayPrefs,
  readDisplay,
  resolveTheme,
  writeDisplay,
} from "@/lib/display";

type DisplayState = {
  prefs: DisplayPrefs;
  resolvedTheme: "night" | "day";
  setPrefs: (next: Partial<DisplayPrefs>) => void;
  flipDayNight: () => void;
};

const DisplayContext = createContext<DisplayState | null>(null);

export function DisplayProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefsState] = useState<DisplayPrefs>(DEFAULT_DISPLAY);
  const [resolvedTheme, setResolvedTheme] = useState<"night" | "day">("night");

  useEffect(() => {
    const next = readDisplay();
    setPrefsState(next);
    setResolvedTheme(resolveTheme(next.theme));
    applyDisplay(next);
  }, []);

  const setPrefs = useCallback((patch: Partial<DisplayPrefs>) => {
    setPrefsState((current) => {
      const next = { ...current, ...patch };
      writeDisplay(next);
      applyDisplay(next);
      setResolvedTheme(resolveTheme(next.theme));
      return next;
    });
  }, []);

  const flipDayNight = useCallback(() => {
    setPrefsState((current) => {
      const now = resolveTheme(current.theme);
      const theme: DisplayPrefs["theme"] = now === "day" ? "night" : "day";
      const next = { ...current, theme };
      writeDisplay(next);
      applyDisplay(next);
      setResolvedTheme(resolveTheme(next.theme));
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ prefs, resolvedTheme, setPrefs, flipDayNight }),
    [prefs, resolvedTheme, setPrefs, flipDayNight],
  );

  return <DisplayContext.Provider value={value}>{children}</DisplayContext.Provider>;
}

export function useDisplay() {
  const ctx = useContext(DisplayContext);
  if (!ctx) throw new Error("useDisplay must be used inside DisplayProvider");
  return ctx;
}

