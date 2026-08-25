"use client";

import { useState } from "react";
import { useEstimateModal } from "@/components/EstimateModalContext";
import { ChangeOrderDesk } from "@/components/ChangeOrderDesk";
import { useAlias } from "@/components/OwnerDeskContext";

const PLANTS: Record<string, { client: string; name: string; city: string; plant: string; site: string }> = {
  "wood-river": {
    client: "MADISON · PHILLIPS 66",
    name: "Wood River",
    city: "Roxana, IL",
    plant: "Wood River Refinery, Roxana, IL",
    site: "Wood River — Roxana, IL",
  },
  yates: {
    client: "MADISON · GEORGIA POWER",
    name: "Yates",
    city: "Newnan, GA",
    plant: "Yates generating station",
    site: "Yates — Newnan, GA",
  },
  rodeo: {
    client: "MADISON · PHILLIPS 66",
    name: "Rodeo",
    city: "Rodeo, CA",
    plant: "Rodeo refinery",
    site: "Rodeo — Rodeo, CA",
  },
  bayway: {
    client: "MADISON · PHILLIPS 66",
    name: "Bayway",
    city: "Linden, NJ",
    plant: "Bayway refinery",
    site: "Bayway — Linden, NJ",
  },
  ferndale: {
    client: "MADISON · PHILLIPS 66",
    name: "Ferndale",
    city: "Ferndale, WA",
    plant: "Ferndale refinery",
    site: "Ferndale — Ferndale, WA",
  },
  billings: {
    client: "MADISON · PHILLIPS 66",
    name: "Billings",
    city: "Billings, MT",
    plant: "Billings refinery",
    site: "Billings — Billings, MT",
  },
};

const TABS = ["Overview", "Estimates", "Change orders", "People"] as const;

export function JobPlantPage({ slug }: { slug: string }) {
  const plant = PLANTS[slug] ?? PLANTS["wood-river"];
  const { openNewEstimate } = useEstimateModal();
  const alias = useAlias();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");

  return (
    <div className="mt-4">
      <p className="text-xs font-semibold tracking-[0.2em] text-[#5b6f73]">{alias(plant.client)}</p>
      <div className="mt-2">
        <h2 className="font-display text-4xl font-semibold text-[#163038]">{alias(plant.name)}</h2>
        <p className="mt-1 text-[#5b6f73]">
          {alias(plant.city)} · {alias(plant.plant)}
        </p>
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
          <div className="mt-6">
            <article className="plant-card max-w-xs px-5 py-5">
              <p className="text-xs tracking-[0.16em] text-[#5b6f73]">OPEN ESTIMATES</p>
              <p className="mt-2 font-display text-4xl">0</p>
            </article>
          </div>
          <p className="mt-5 text-sm text-[#5b6f73]">
            Start an estimate for this plant from the Estimates tab. SCRs live on that job’s Change
            orders tab. People assigns who owns change orders, HSE, or quality on {alias(plant.name)}.
            {plant.name === "Wood River" ? " Customer rule is East Coast — never PA or Mid-Atlantic." : ""}
          </p>
        </>
      ) : null}

      {tab === "Estimates" ? (
        <div className="mt-6 space-y-4">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => openNewEstimate({ client: "Phillips 66", site: plant.site })}
              className="rounded-lg bg-steel px-4 py-2 text-white"
            >
              + New estimate
            </button>
          </div>
          <div className="plant-card px-5 py-6">
            <p className="text-[#5b6f73]">No open estimates on this plant yet.</p>
          </div>
          <div className="plant-card overflow-hidden px-5 py-5">
            <p className="text-xs tracking-[0.16em] text-[#5b6f73]">TRAVEL</p>
            <table className="mt-3 min-w-full text-left text-sm">
              <thead className="text-xs tracking-[0.12em] text-[#5b6f73]">
                <tr>
                  <th className="py-2">ITEM</th>
                  <th className="py-2">Mileage Rate</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-[#d5e0de]">
                  <td className="py-2">Craft travel</td>
                  <td className="py-2">—</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === "Change orders" ? (
        <div className="mt-6">
          <ChangeOrderDesk />
        </div>
      ) : null}

      {tab === "People" ? (
        <section className="plant-card mt-6 px-5 py-6">
          <h3 className="text-xl font-semibold text-[#163038]">People</h3>
          <p className="mt-2 text-sm text-[#5b6f73]">
            Assign who owns change orders, HSE, or quality on {alias(plant.name)}. Empty until you pick
            someone.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {["Change orders", "HSE", "Quality"].map((role) => (
              <label key={role} className="block text-sm">
                {role}
                <select className="paper-field mt-1">
                  <option value="">Not assigned</option>
                </select>
              </label>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
