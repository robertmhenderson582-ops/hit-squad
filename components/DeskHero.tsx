"use client";

import { BrandMark } from "@/components/BrandMark";

export function DeskHero() {
  return (
    <section className="desk-hero desk-hero-bleed px-4 py-16 text-center sm:py-20">
      <div className="relative z-10">
        <div className="hero-mark brand-static">
          <BrandMark variant="stacked" className="mx-auto h-14 w-10" />
          <p className="mt-3 font-display text-5xl font-semibold tracking-[0.16em] text-white sm:text-6xl">
            HIT SQUAD
          </p>
          <p className="mt-2 font-display text-xl font-semibold tracking-[0.32em] text-white sm:text-2xl">
            PROJECT CONTROLS
          </p>
        </div>
      </div>
    </section>
  );
}
