"use client";

import { BrandMark } from "@/components/BrandMark";
import { useEstimateModal } from "@/components/EstimateModalContext";
import { useAlias } from "@/components/OwnerDeskContext";

export function DeskHero() {
  const alias = useAlias();
  const { openNewEstimate } = useEstimateModal();
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
        <div className="mt-12 flex flex-wrap items-center justify-center gap-5">
          <button
            type="button"
            onClick={() =>
              openNewEstimate({
                client: "Phillips 66",
                site: "Wood River — Roxana, IL",
                size: "outage",
                knownPlant: true,
              })
            }
            className="inline-flex items-center gap-2 rounded-lg bg-steel px-5 py-3 text-sm text-white"
          >
            <span className="text-lg leading-none">+</span>
            New {alias("Phillips 66")} estimate
          </button>
          <button
            type="button"
            onClick={() => openNewEstimate({ size: "other" })}
            className="text-sm text-white underline-offset-4 hover:underline"
          >
            Other client
          </button>
          <button
            type="button"
            onClick={() => openNewEstimate({ size: "shop", client: "Shop" })}
            className="text-sm text-white underline-offset-4 hover:underline"
          >
            Simple shop job
          </button>
        </div>
      </div>
    </section>
  );
}
