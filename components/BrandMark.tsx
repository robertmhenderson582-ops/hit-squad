const JET =
  "M20 1.1 24.4 8.8 33 15.4 25.8 13.6 28.6 23.2 22.4 18.6 20 26 17.6 18.6 11.4 23.2 14.2 13.6 7 15.4 15.6 8.8Z";

export function BrandMark({
  className = "h-16 w-16",
  variant = "rings",
}: {
  className?: string;
  variant?: "rings" | "stacked" | "jets";
}) {
  if (variant === "stacked" || variant === "jets") {
    // Two jets chasing upper-right with a CLEAR empty gap between them.
    // Absolute positions only — do not use transform/scale (they collapse at h-8/h-16).
    return (
      <svg
        className={className}
        viewBox="0 0 100 72"
        fill="none"
        aria-hidden="true"
        preserveAspectRatio="xMidYMid meet"
      >
        <g fill="#ffffff" stroke="#ffffff" strokeWidth="0.9" strokeLinejoin="round">
          {/* LEAD — upper right */}
          <path d={JET} transform="translate(48 4)" />
          {/* TRAIL — lower left, same size, wide gap */}
          <path d={JET} transform="translate(4 34)" />
        </g>
      </svg>
    );
  }

  return (
    <svg className={className} viewBox="0 0 80 80" fill="none" aria-hidden="true">
      <g stroke="#3ec6d4" strokeWidth="1.4">
        <rect x="22" y="22" width="36" height="36" transform="rotate(45 40 40)" />
        <rect x="15" y="15" width="50" height="50" transform="rotate(45 40 40)" />
        <rect x="8" y="8" width="64" height="64" transform="rotate(45 40 40)" />
      </g>
      <circle cx="40" cy="40" r="2.4" fill="#3ec6d4" />
    </svg>
  );
}
