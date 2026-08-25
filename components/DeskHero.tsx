"use client";

import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { useAlias } from "@/components/OwnerDeskContext";

export function DeskHero() {
  const alias = useAlias();
  return (
    <section className="desk-hero desk-hero-bleed px-4 py-16 text-center sm:py-20">
      <div className="relative z-10">
        <div className="brand-static">
          <BrandMark variant="stacked" className="mx-auto h-14 w-10" />
          <p className="mt-3 font-display text-5xl font-semibold tracking-[0.16em] text-white sm:text-6xl">
            HIT SQUAD
          </p>
          <p className="mt-2 font-display text-xl font-semibold tracking-[0.28em] text-white/90 sm:text-2xl">
            PROJECT CONTROLS
          </p>
        </div>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-5">
          <Link
            href="/estimates/new?preset=p66"
            className="inline-flex items-center gap-2 rounded-lg bg-steel px-5 py-3 text-sm text-white"
          >
            <span className="text-lg leading-none">+</span>
            New {alias("Phillips 66")} estimate
          </Link>
          <Link href="/estimates/new?preset=other" className="text-sm text-white underline-offset-4 hover:underline">
            Other client
          </Link>
          <Link href="/estimates/new?preset=shop" className="text-sm text-white underline-offset-4 hover:underline">
            Simple shop job
          </Link>
        </div>
      </div>
    </section>
  );
}
