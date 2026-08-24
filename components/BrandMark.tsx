export function BrandMark({ className = "h-16 w-16" }: { className?: string }) {
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
