"use client";

import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { COMPANY_DESK_DOOR, HOME_KICKER, HOME_WORDMARK } from "@/lib/desk-home";

export function DeskHero({
  href = COMPANY_DESK_DOOR.href,
  label = COMPANY_DESK_DOOR.label,
  logo = null,
}: {
  href?: string;
  label?: string;
  logo?: string | null;
}) {
  return (
    <section className="desk-hero desk-hero-home px-4 py-10 text-center sm:py-12">
      <Link href={href} aria-label={label} className="hero-mark brand-static relative z-10">
        <BrandMark variant="stacked" className="mx-auto h-14 w-10" />
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
      </Link>
    </section>
  );
}
