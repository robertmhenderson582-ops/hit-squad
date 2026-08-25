"use client";

import { FormEvent, useState } from "react";
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
const RULES = ["East Coast", "Pennsylvania", "Illinois", "West Coast"];
const RATES = [
  "East Coast pack",
  "Illinois FUI/SUI/WC pack",
  "West Coast pack",
];

export function NewEstimateModal({
  preset,
  onClose,
}: {
  preset: { client?: string; site?: string };
  onClose: () => void;
}) {
  const router = useRouter();
  const alias = useAlias();
  const [kind, setKind] = useState<"known" | "prospect">("known");
  const [client, setClient] = useState(preset.client || "Phillips 66");
  const [site, setSite] = useState(preset.site || "Wood River — Roxana, IL");
  const [rule, setRule] = useState("East Coast");
  const [name, setName] = useState("New T&M estimate");
  const [rates, setRates] = useState(RATES[0]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = new URLSearchParams({
      client,
      site,
      rule,
      name,
      rates,
      kind,
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
        <div className="mt-4 grid grid-cols-2 overflow-hidden rounded-full bg-[#eadfc8]">
          <button
            type="button"
            onClick={() => setKind("known")}
            className={`py-2 text-sm ${kind === "known" ? "bg-steel text-white" : "text-[#163038]"}`}
          >
            Known customer
          </button>
          <button
            type="button"
            onClick={() => setKind("prospect")}
            className={`py-2 text-sm ${kind === "prospect" ? "bg-steel text-white" : "text-[#163038]"}`}
          >
            New / prospect
          </button>
        </div>
        <label className="mt-5 block">
          <span className="text-xs font-semibold tracking-[0.16em] text-[#5b6f73]">CLIENT</span>
          <select value={client} onChange={(event) => setClient(event.target.value)} className="paper-field mt-1">
            {CLIENTS.map((item) => (
              <option key={item} value={item}>
                {alias(item)}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-3 block">
          <span className="text-xs font-semibold tracking-[0.16em] text-[#5b6f73]">SITE</span>
          <select value={site} onChange={(event) => setSite(event.target.value)} className="paper-field mt-1">
            {SITES.map((item) => (
              <option key={item} value={item}>
                {alias(item)}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-3 block">
          <span className="text-xs font-semibold tracking-[0.16em] text-[#5b6f73]">CUSTOMER RULE</span>
          <select value={rule} onChange={(event) => setRule(event.target.value)} className="paper-field mt-1">
            {RULES.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label className="mt-3 block">
          <span className="text-xs font-semibold tracking-[0.16em] text-[#5b6f73]">ESTIMATE NAME</span>
          <input value={name} onChange={(event) => setName(event.target.value)} className="paper-field mt-1" />
        </label>
        <label className="mt-3 block">
          <span className="text-xs font-semibold tracking-[0.16em] text-[#5b6f73]">LABOR RATES</span>
          <select value={rates} onChange={(event) => setRates(event.target.value)} className="paper-field mt-1">
            {RATES.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <p className="mt-3 text-xs text-[#5b6f73]">
          New client? Build ST / OT / DT in Rate builder first, then attach the pack here.
        </p>
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
