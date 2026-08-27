const TONE: Record<string, string> = {
  OPEN: "border-steel-glow/50 text-steel-glow",
  WORKING: "border-steel-glow/50 text-steel-glow",
  CURRENT: "border-steel-glow/50 text-steel-glow",
  ISSUED: "border-paper-cream/40 text-paper-cream",
  APPROVED: "border-paper-cream/40 text-paper-cream",
  CLEARED: "border-paper-cream/40 text-paper-cream",
  DRAFT: "border-amber-label/60 text-amber-label",
  HOLD: "border-amber-label/60 text-amber-label",
  SUBMITTED: "border-amber-label/60 text-amber-label",
  OVERDUE: "border-amber-flare text-amber-flare",
  "IN PROGRESS": "border-steel-glow/50 text-steel-glow",
  PLANNED: "border-paper-cream/30 text-paper-cream/80",
  ARCHIVED: "border-paper-cream/30 text-paper-cream/80",
  TRANSFERRED: "border-amber-label/60 text-amber-label",
};

export function StatusStamp({ value }: { value: string }) {
  return (
    <span
      className={`status-stamp inline-block border px-2 py-0.5 font-mono text-[10px] tracking-[0.16em] ${TONE[value] ?? "border-steel-rim/40 text-paper-cream/80"}`}
    >
      {value}
    </span>
  );
}
