"use client";

import { HSE_TAB_LABEL, QUALITY_TAB_LABEL, qualityHseQuietDoorsOn } from "@/lib/quality-hse-modules";

/**
 * Quiet Awarded doors from the estimate to Quality/HSE.
 * Structure stays. V1.51 does not mount this on Job setup.
 */
export function QualityHseQuietDoors({
  status = "",
  onOpenQuality,
  onOpenHse,
}: {
  status?: string;
  onOpenQuality?: () => void;
  onOpenHse?: () => void;
}) {
  if (!qualityHseQuietDoorsOn(status)) return null;
  return (
    <p className="mt-6 flex flex-wrap gap-3 text-sm">
      {onOpenQuality ? (
        <button type="button" onClick={onOpenQuality} className="text-steel underline">
          {QUALITY_TAB_LABEL}
        </button>
      ) : null}
      {onOpenHse ? (
        <button type="button" onClick={onOpenHse} className="text-steel underline">
          {HSE_TAB_LABEL}
        </button>
      ) : null}
    </p>
  );
}
