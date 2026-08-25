import { BrandMark } from "@/components/BrandMark";

export function Wordmark({
  compact = false,
  subline = "PROJECT CONTROLS",
}: {
  compact?: boolean;
  subline?: string;
}) {
  return (
    <div className={`flex ${compact ? "items-center gap-3" : "flex-col items-center gap-3"}`}>
      <BrandMark className={compact ? "h-10 w-10" : "h-16 w-16 drop-shadow-[0_0_12px_rgba(62,198,212,0.55)]"} />
      <div className={compact ? "text-left" : "text-center"}>
        <p
          className={`font-display font-semibold leading-none tracking-[0.14em] text-paper-cream ${
            compact ? "text-2xl sm:text-3xl" : "text-4xl sm:text-5xl"
          }`}
        >
          HIT SQUAD
        </p>
        <p
          className={`mt-1 font-display font-semibold tracking-[0.22em] text-steel-glow ${
            compact ? "text-sm sm:text-lg" : "text-xl sm:text-2xl tracking-[0.28em]"
          }`}
        >
          {subline}
        </p>
        {!compact ? (
          <p className="mt-3 font-mono text-[11px] tracking-[0.42em] text-paper-cream/70">
            ESTIMATE &amp; COST
          </p>
        ) : null}
      </div>
    </div>
  );
}
