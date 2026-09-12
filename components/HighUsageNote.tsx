"use client";

import { useOwnerDesk } from "@/components/OwnerDeskContext";
import {
  HIGH_USAGE_NOTE_BODY,
  HIGH_USAGE_NOTE_TITLE,
  highUsageNotePercentLine,
  isHighUsageClock,
} from "@/lib/usage-clock";

export function HighUsageNote() {
  const desk = useOwnerDesk();
  if (!isHighUsageClock(desk)) return null;
  const percentLine = highUsageNotePercentLine(desk?.usagePercent);
  return (
    <aside className="usage-clock-note" role="status" data-usage-clock="high">
      <p className="usage-clock-kicker">{HIGH_USAGE_NOTE_TITLE}</p>
      <p>{HIGH_USAGE_NOTE_BODY}</p>
      {percentLine ? <p className="usage-clock-percent">{percentLine}</p> : null}
    </aside>
  );
}
