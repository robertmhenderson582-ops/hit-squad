"use client";

export function LaborRollup() {
  return (
    <section className="grid gap-3 sm:grid-cols-3">
      <article className="hours-tile">
        <p className="font-mono text-[10px] tracking-[0.2em] text-[#f0a13a]">EST HOURS</p>
        <p className="mt-2 font-display text-3xl">3,600</p>
        <p className="mt-1 text-sm text-paper-cream/70">Direct craft stub</p>
      </article>
      <article className="hours-tile">
        <p className="font-mono text-[10px] tracking-[0.2em] text-[#f0a13a]">HOURS EARNED</p>
        <p className="mt-2 font-display text-3xl">0</p>
        <p className="mt-1 text-sm text-paper-cream/70">Look first · math later</p>
      </article>
      <article className="hours-tile">
        <p className="font-mono text-[10px] tracking-[0.2em] text-[#f0a13a]">REMAINING</p>
        <p className="mt-2 font-display text-3xl">3,600</p>
        <p className="mt-1 text-sm text-paper-cream/70">Not a live takeoff</p>
      </article>
    </section>
  );
}
