export function HomeCue({ tight = false }: { tight?: boolean }) {
  return (
    <span className={`header-home-cue ${tight ? "header-home-cue-tight" : ""}`}>
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        <path d="M2.2 8.1 8 2.8l5.8 5.3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4.2 7.4V13h7.6V7.4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Home
    </span>
  );
}
