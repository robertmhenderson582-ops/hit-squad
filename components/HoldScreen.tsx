"use client";

export type HoldScreenVariant = "screen" | "panel" | "compact";

export function HoldScreen({
  label,
  variant = "screen",
}: {
  label: string;
  variant?: HoldScreenVariant;
}) {
  const shell =
    variant === "screen"
      ? "industrial-root flex min-h-screen items-center justify-center"
      : variant === "panel"
        ? "flex min-h-[min(28rem,70vh)] w-full items-center justify-center"
        : "flex items-center justify-center";

  return (
    <div className={shell} role="status" aria-busy="true" aria-live="polite">
      <div className="flex flex-col items-center gap-5">
        <span className="hs-hold-spin" aria-hidden="true" />
        <p className="font-mono text-xs tracking-[0.28em] text-steel-glow">{label}</p>
      </div>
    </div>
  );
}
