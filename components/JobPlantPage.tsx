"use client";

import { useState } from "react";
import { useEstimateModal } from "@/components/EstimateModalContext";
import { ChangeOrderDesk } from "@/components/ChangeOrderDesk";
import { useAlias } from "@/components/OwnerDeskContext";

const PLANTS: Record<
  string,
  { client: string; name: string; city: string; plant: string; site: string; ot: string; perDiem: string }
> = {
  "wood-river": {
    client: "MADISON · PHILLIPS 66",
    name: "Wood River",
    city: "Roxana, IL",
    plant: "Wood River Refinery, Roxana, IL",
    site: "Wood River — Roxana, IL",
    ot: "pennsylvania",
    perDiem: "$130",
  },
  yates: {
    client: "MADISON · GEORGIA POWER",
    name: "Yates",
    city: "Newnan, GA",
    plant: "Yates generating station",
    site: "Yates — Newnan, GA",
    ot: "southeast",
    perDiem: "$115",
  },
  rodeo: {
    client: "MADISON · PHILLIPS 66",
    name: "Rodeo",
    city: "Rodeo, CA",
    plant: "Rodeo refinery",
    site: "Rodeo — Rodeo, CA",
    ot: "west coast",
    perDiem: "$140",
  },
  bayway: {
    client: "MADISON · PHILLIPS 66",
    name: "Bayway",
    city: "Linden, NJ",
    plant: "Bayway refinery",
    site: "Bayway — Linden, NJ",
    ot: "east coast",
    perDiem: "$135",
  },
  ferndale: {
    client: "MADISON · PHILLIPS 66",
    name: "Ferndale",
    city: "Ferndale, WA",
    plant: "Ferndale refinery",
    site: "Ferndale — Ferndale, WA",
    ot: "west coast",
    perDiem: "$140",
  },
  billings: {
    client: "MADISON · PHILLIPS 66",
    name: "Billings",
    city: "Billings, MT",
    plant: "Billings refinery",
    site: "Billings — Billings, MT",
    ot: "mountain",
    perDiem: "$125",
  },
};

const TABS = ["Overview", "Estimate", "Change-order", "Photos"] as const;

export function JobPlantPage({ slug }: { slug: string }) {
  const plant = PLANTS[slug] ?? PLANTS["wood-river"];
  const { openNewEstimate } = useEstimateModal();
  const alias = useAlias();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");

  return (
    <div className="mt-4">
      <p className="text-xs font-semibold tracking-[0.2em] text-[#5b6f73]">{alias(plant.client)}</p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-4xl font-semibold text-[#163038]">{alias(plant.name)}</h2>
          <p className="mt-1 text-[#5b6f73]">
            {alias(plant.city)} · {alias(plant.plant)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => openNewEstimate({ client: "Phillips 66", site: plant.site })}
          className="rounded-lg bg-steel px-4 py-2 text-white"
        >
          New estimate
        </button>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        {TABS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={`rounded-full px-4 py-2 text-sm ${
              tab === item ? "bg-steel text-white" : "bg-[#dce6e4] text-[#163038]"
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      {tab === "Overview" ? (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <article className="plant-card px-5 py-5">
              <p className="text-xs tracking-[0.16em] text-[#5b6f73]">OPEN ESTIMATES</p>
              <p className="mt-2 font-display text-4xl">0</p>
            </article>
            <article className="plant-card px-5 py-5">
              <p className="text-xs tracking-[0.16em] text-[#5b6f73]">OT RULE</p>
              <p className="mt-2 font-display text-3xl">{plant.ot}</p>
            </article>
            <article className="plant-card px-5 py-5">
              <p className="text-xs tracking-[0.16em] text-[#5b6f73]">PER DIEM (CRAFT)</p>
              <p className="mt-2 font-display text-3xl">{plant.perDiem}</p>
            </article>
          </div>
          <p className="mt-5 text-sm text-[#5b6f73]">
            Start an estimate for this plant from the header. SCRs live on that job’s Change-order tab.
          </p>
        </>
      ) : null}

      {tab === "Estimate" ? (
        <div className="plant-card mt-6 px-5 py-6">
          <p className="text-[#5b6f73]">No open estimates on this plant yet.</p>
          <button
            type="button"
            onClick={() => openNewEstimate({ client: "Phillips 66", site: plant.site })}
            className="mt-4 rounded-lg bg-steel px-4 py-2 text-white"
          >
            New estimate
          </button>
        </div>
      ) : null}

      {tab === "Change-order" ? (
        <div className="mt-6">
          <ChangeOrderDesk />
        </div>
      ) : null}

      {tab === "Photos" ? (
        <div className="plant-card mt-6 px-5 py-6 text-[#5b6f73]">
          Photos land here when filed. This tab is a stub — no ticket screen.
        </div>
      ) : null}
    </div>
  );
}
