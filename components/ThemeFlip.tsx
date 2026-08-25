"use client";

import { useDisplay } from "@/components/DisplayProvider";

export function ThemeFlip() {
  const { resolvedTheme, flipDayNight } = useDisplay();
  return (
    <button
      type="button"
      onClick={flipDayNight}
      className="theme-flip"
      aria-label={resolvedTheme === "day" ? "Night" : "Day"}
      title={resolvedTheme === "day" ? "Night — instrument cluster" : "Day — paper desk"}
    >
      {resolvedTheme === "day" ? "☾" : "☀"}
    </button>
  );
}
