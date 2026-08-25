"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAlias } from "@/components/OwnerDeskContext";

const CLIENTS = ["Phillips 66", "Georgia Power", "Shop"];
const SITES = [
  "Wood River — Roxana, IL",
  "Rodeo — Rodeo, CA",
  "Bayway — Linden, NJ",
  "Ferndale — Ferndale, WA",
  "Billings — Billings, MT",
  "Yates — Newnan, GA",
];
const SIZES = [
  { id: "outage", label: "Outage / T&M" },
  { id: "other", label: "Other client" },
  { id: "shop", label: "Shop / rig" },
] as const;

export type EstimateSize = (typeof SIZES)[number]["id"];

export function NewEstimateModal({
  preset,
  onClose,
}: {
  preset: { client?: string; site?: string; size?: EstimateSize; knownPlant?: boolean };
  onClose: () => void;
}) {
  const router = useRouter();
  const alias = useAlias();
  const knownPlant = Boolean(preset.knownPlant && preset.client);
  const [size, setSize] = useState<EstimateSize>(preset.size || (knownPlant ? "outage" : "outage"));
  const [client, setClient] = useState(preset.client || (preset.size === "shop" ? "Shop" : "Phillips 66"));
  const [site, setSite] = useState(preset.site || "Wood River — Roxana, IL");
  const [name, setName] = useState(preset.size === "shop" ? "Shop / rig job" : "New T&M estimate");
  const woodRiver = site.startsWith("Wood River");
  const rule = woodRiver ? "East Coast (PCA0001103)" : "Customer rule";

  const clientLocked = knownPlant || size === "shop";

  const sites = useMemo(() => (size === "shop" ? ["Shop"] : SITES), [size]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = new URLSearchParams({
      client: size === "shop" ? "Shop" : client,
      site: size === "shop" ? "Shop" : site,
      rule,
      name,
      size,
    });
    onClose();
    router.push(`/estimates/new?${query.toString()}`);
  }

  return (
    <div className="modal-scrim" role="dialog" aria-modal="true" aria-labelledby="new-estimate-title">
      <form onSubmit={onSubmit} className="estimate-modal px-6 py-5">
        <div className="flex items-start justify-between">
          <h2 id="new-estimate-title" className="font-display text-2xl font-semibold text-[#163038]">
            New estimate
          </h2>
          <button type="button" onClick={onClose} className="text-xl text-[#5b6f73]" aria-label="Close">
            ×
          </button>
        </div>
        <p className="mt-3 text-xs font-semibold tracking-[0.16em] text-[#5b6f73]">START-JOB SIZE</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {SIZES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setSize(item.id);
                if (item.id === "shop") {
                  setClient("Shop");
                  setSite("Shop");
                  setName("Shop / rig job");
                } else if (item.id === "other" && !knownPlant) {
                  setClient("Georgia Power");
                }
              }}
              className={`rounded-full px-3 py-1.5 text-sm ${
                size === item.id ? "bg-steel text-white" : "border border-steel text-steel"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <label className="mt-5 block">
          <span className="text-xs font-semibold tracking-[0.16em] text-[#5b6f73]">CLIENT</span>
          {clientLocked ? (
            <input readOnly value={alias(size === "shop" ? "Shop" : client)} className="paper-field mt-1" />
          ) : (
            <select value={client} onChange={(event) => setClient(event.target.value)} className="paper-field mt-1">
              {CLIENTS.map((item) => (
                <option key={item} value={item}>
                  {alias(item)}
                </option>
              ))}
            </select>
          )}
        </label>
        {size !== "shop" ? (
          <label className="mt-3 block">
            <span className="text-xs font-semibold tracking-[0.16em] text-[#5b6f73]">SITE</span>
            <select
              value={site}
              onChange={(event) => setSite(event.target.value)}
              className="paper-field mt-1"
              disabled={knownPlant}
            >
              {sites.map((item) => (
                <option key={item} value={item}>
                  {alias(item)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="mt-3 text-sm text-[#5b6f73]">
            Shop / rig opens a small sheet: labor, truck, rod, fuel, mileage, per diem. Tabs:
            Summary / Job sheet / Rates / Print only. Chrome only — no rate math.
          </p>
        )}
        <label className="mt-3 block">
          <span className="text-xs font-semibold tracking-[0.16em] text-[#5b6f73]">OVERTIME / RATE</span>
          <input readOnly value={size === "shop" ? "Shop sheet" : rule} className="paper-field mt-1" />
        </label>
        <label className="mt-3 block">
          <span className="text-xs font-semibold tracking-[0.16em] text-[#5b6f73]">ESTIMATE NAME</span>
          <input value={name} onChange={(event) => setName(event.target.value)} className="paper-field mt-1" />
        </label>
        {woodRiver && size !== "shop" ? (
          <p className="mt-3 text-xs text-[#5b6f73]">Wood River uses East Coast (PCA0001103) — never PA or Mid-Atlantic.</p>
        ) : null}
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-steel px-4 py-2 text-steel">
            Cancel
          </button>
          <button type="submit" className="rounded-lg bg-steel px-4 py-2 text-white">
            Create
          </button>
        </div>
      </form>
    </div>
  );
}
