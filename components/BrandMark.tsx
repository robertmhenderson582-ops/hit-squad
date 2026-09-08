/** Locked HUD A reticle (2026-09-08). One mark. Hit Squad chrome only. */
const CYAN = "#3ec6d4";
const TEAL = "#0f5f6d";
const AMBER = "#e38b2a";
const TICK = "#d5dde0";

export function BrandMark({ className = "h-16 w-16" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 80 80"
      fill="none"
      aria-hidden="true"
      data-brand-mark="hud-a"
      preserveAspectRatio="xMidYMid meet"
    >
      <HudAReticle />
    </svg>
  );
}

export function HudAReticle() {
  return (
    <g>
      {/* Broad teal band — reads at h-8 / favicon without a fill background */}
      <circle cx="40" cy="40" r="28" stroke={TEAL} strokeWidth="6.4" opacity="0.72" />
      <circle cx="40" cy="40" r="28" stroke={CYAN} strokeWidth="1.7" opacity="0.55" />

      <path d="M33 10.2v3.4M35.5 10.6v2.8M38 10.2v3.4M40 9.4v4.6M42 10.2v3.4M44.5 10.6v2.8M47 10.2v3.4" stroke={TICK} strokeWidth="1.15" strokeLinecap="round" />
      <path d="M33 66.4v3.4M35.5 66.6v2.8M38 66.4v3.4M40 66v4.6M42 66.4v3.4M44.5 66.6v2.8M47 66.4v3.4" stroke={TICK} strokeWidth="1.15" strokeLinecap="round" />

      {/* Amber inward ticks at 3 / 9 */}
      <path d="M68.4 40 62.2 36.7v6.6Z" fill={AMBER} />
      <path d="M11.6 40 17.8 36.7v6.6Z" fill={AMBER} />

      {/* Middle ring, open at the cardinals */}
      <path
        d="M61.42 41.87A21.5 21.5 0 0 1 41.87 61.42M38.13 61.42A21.5 21.5 0 0 1 18.58 41.87M18.58 38.13A21.5 21.5 0 0 1 38.13 18.58M41.87 18.58A21.5 21.5 0 0 1 61.42 38.13"
        stroke={CYAN}
        strokeWidth="2.15"
        strokeLinecap="round"
      />

      <circle cx="40" cy="40" r="15.4" stroke={CYAN} strokeWidth="1.25" strokeDasharray="2.15 1.85" />
      <path d="M40 26.2v11.2M40 42.6v11.2M26.2 40h11.2M42.6 40h11.2" stroke={CYAN} strokeWidth="1.05" strokeDasharray="1.55 1.25" strokeLinecap="round" />

      <circle cx="40" cy="40" r="4.6" stroke={CYAN} strokeWidth="1.35" />
      <circle cx="40" cy="40" r="1.7" fill={CYAN} />

      <path
        d="M7 19.5V7h12.5M60.5 7H73v12.5M7 60.5V73h12.5M60.5 73H73V60.5"
        stroke={CYAN}
        strokeWidth="2.15"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </g>
  );
}
