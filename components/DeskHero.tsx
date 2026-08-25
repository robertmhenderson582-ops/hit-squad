"use client";

import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";

export function DeskHero() {
  return (
    <section className="desk-hero paper-grain px-4 py-12 text-center sm:py-16">
      <div className="relative z-10">
        <BrandMark className="mx-auto h-12 w-12 drop-shadow-[0_0_12px_rgba(62,198,212,0.55)]" />
        <p className="mt-3 font-display text-5xl font-semibold tracking-[0.16em] text-white sm:text-6xl">
          HIT SQUAD
        </p>
        <p className="mt-2 font-display text-xl font-semibold tracking-[0.55em] text-steel sm:text-2xl">
          ESTIMATORS
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-5">
          <Link
            href="/estimates/new?preset=p66"
            className="inline-flex items-center gap-2 rounded-lg bg-steel px-5 py-3 text-sm text-white"
          >
            <span className="text-lg leading-none">+</span>
            New Phillips 66 estimate
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
