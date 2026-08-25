"use client";

export function LaborRollup({ estHours = 0 }: { estHours?: number }) {
  const earned = 0;
  const remaining = estHours;

  return (
    <section className="grid gap-3 sm:grid-cols-3">
      <article className="hours-tile">
        <p className="font-mono text-[10px] tracking-[0.2em] text-[#f0a13a]">EST HOURS</p>
        <p className="mt-2 font-display text-3xl">{estHours.toLocaleString()}</p>
        <p className="mt-1 text-sm text-paper-cream/70">From the crew calendar</p>
      </article>
      <article className="hours-tile">
        <p className="font-mono text-[10px] tracking-[0.2em] text-[#f0a13a]">HOURS EARNED</p>
        <p className="mt-2 font-display text-3xl">{earned}</p>
        <p className="mt-1 text-sm text-paper-cream/70">Stays 0 on a fresh estimate</p>
      </article>
      <article className="hours-tile">
        <p className="font-mono text-[10px] tracking-[0.2em] text-[#f0a13a]">REMAINING</p>
        <p className="mt-2 font-display text-3xl">{remaining.toLocaleString()}</p>
        <p className="mt-1 text-sm text-paper-cream/70">EST minus earned</p>
      </article>
    </section>
  );
}
