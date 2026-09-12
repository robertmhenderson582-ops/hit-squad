"use client";

import { BrandMark } from "@/components/BrandMark";
import { HighUsageNote } from "@/components/HighUsageNote";
import { HomeDock } from "@/components/HomeDock";
import { HOME_KICKER, HOME_WORDMARK } from "@/lib/desk-home";

export function DeskHero({ logo = null }: { logo?: string | null }) {
  return (
    <section className="desk-hero desk-hero-home px-2 text-center sm:px-4">
      <div className="hero-mark brand-static relative z-10">
        <BrandMark className="mx-auto h-14 w-14" />
        <p className="mt-3 font-display text-5xl font-semibold tracking-[0.16em] text-white sm:text-6xl">
          {HOME_WORDMARK}
        </p>
        <p className="mt-2 font-display text-xl font-semibold tracking-[0.32em] text-white sm:text-2xl">
          {HOME_KICKER}
        </p>
        {logo ? (
          <span className="hero-company-logo">
            <img src={logo} alt="" />
          </span>
        ) : null}
      </div>
      <HighUsageNote />
      <HomeDock />
    </section>
  );
}
