"use client";

import { useDisplay } from "@/components/DisplayProvider";

export function ThemeFlip() {
  const { resolvedTheme, flipDayNight } = useDisplay();
  return (
    <button
      type="button"
      onClick={flipDayNight}
      className="theme-flip desk-hover-tip"
      aria-label={resolvedTheme === "day" ? "Night — instrument cluster" : "Day — paper desk"}
      title={resolvedTheme === "day" ? "Night — instrument cluster" : "Day — paper desk"}
    >
      {resolvedTheme === "day" ? "☾" : "☀"}
      <span className="desk-hover-tip-label">
        {resolvedTheme === "day" ? "Night — instrument cluster" : "Day — paper desk"}
      </span>
    </button>
  );
}
