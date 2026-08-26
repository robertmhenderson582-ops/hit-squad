"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAlias } from "@/components/OwnerDeskContext";
import { boundOtLabel, siteClockFromText } from "@/lib/hours-clock";
import { defaultEstimateName, isDefaultEstimateName, startJobEventLabel } from "@/lib/job-event";
import { newEstimatePackId } from "@/lib/estimate-open";

const CLIENTS = ["Phillips 66", "Georgia Power", "Shop"];
const SITES = [
  "Wood River — Roxana, IL",
  "Rodeo — Rodeo, CA",
  "Bayway — Linden, NJ",
  "Ferndale — Ferndale, WA",
  "Billings — Billings, MT",
  "Yates — Newnan, GA",
];
export type EstimateSize = "outage" | "other" | "shop";

function startJobSizes(client: string, site: string, size: EstimateSize) {
  return [
    { id: "outage" as const, label: startJobEventLabel(client, site, size) },
    { id: "other" as const, label: "Other client" },
    { id: "shop" as const, label: "Shop / rig" },
  ];
}

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
  const [size, setSize] = useState<EstimateSize>(preset.size || "outage");
  const [client, setClient] = useState(
    preset.client || (preset.size === "shop" ? "Shop" : preset.size === "other" ? "Georgia Power" : "Phillips 66"),
  );
  const [site, setSite] = useState(
    preset.site || (preset.size === "other" ? "Yates — Newnan, GA" : "Wood River — Roxana, IL"),
  );
  const [name, setName] = useState(
    defaultEstimateName(
      preset.client || (preset.size === "shop" ? "Shop" : "Phillips 66"),
      preset.site || "Wood River — Roxana, IL",
      preset.size || "outage",
    ),
  );
  const rule = boundOtLabel(site, client);
  const eastCoast = siteClockFromText(site, client) === "east-coast";

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      onClose();
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const clientLocked = knownPlant || size === "shop";

  const sites = useMemo(() => (size === "shop" ? ["Shop"] : SITES), [size]);

  function keepGeneratedName(nextClient: string, nextSite: string, nextSize: EstimateSize) {
    setName((current) =>
      isDefaultEstimateName(current) ? defaultEstimateName(nextClient, nextSite, nextSize) : current,
    );
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = new URLSearchParams({
      client: size === "shop" ? "Shop" : client,
      site: size === "shop" ? "Shop" : site,
      rule,
      name,
      size,
      pack: newEstimatePackId(),
    });
    onClose();
    router.push(`/estimates/new?${query.toString()}`);
  }

  return (
    <div
      className="modal-scrim"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-estimate-title"
      onClick={onClose}
    >
      <form
        onSubmit={onSubmit}
        onClick={(event) => event.stopPropagation()}
        className="estimate-modal px-6 py-5"
      >
        <div className="flex items-start justify-between">
          <h2 id="new-estimate-title" className="font-display text-2xl font-semibold text-[#163038]">
            New estimate
          </h2>
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onClose();
            }}
            className="inbox-close estimate-modal-close"
            aria-label="Close"
            title="Close"
          >
            ×
          </button>
        </div>
        <p className="mt-3 text-xs font-semibold tracking-[0.16em] text-[#5b6f73]">JOB / EVENT</p>
        <p className="mt-1 text-xs text-[#5b6f73]">
          This is the job kind — Turnaround on Phillips 66, Outage on a powerhouse. Shop / rig stays
          Shop / rig. Estimate type (T&amp;M / lump sum / CR-FF / Hybrid) stays on Job setup. Never
          use Outage as an estimate type.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {startJobSizes(client, site, size).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setSize(item.id);
                if (item.id === "shop") {
                  setClient("Shop");
                  setSite("Shop");
                  keepGeneratedName("Shop", "Shop", "shop");
                } else if (item.id === "other" && !knownPlant) {
                  setClient("Georgia Power");
                  setSite("Yates — Newnan, GA");
                  keepGeneratedName("Georgia Power", "Yates — Newnan, GA", "other");
                } else if (item.id === "outage" && !knownPlant) {
                  setClient("Phillips 66");
                  setSite("Wood River — Roxana, IL");
                  keepGeneratedName("Phillips 66", "Wood River — Roxana, IL", "outage");
                } else {
                  keepGeneratedName(client, site, item.id);
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
            <select
              value={client}
              onChange={(event) => {
                const next = event.target.value;
                setClient(next);
                keepGeneratedName(next, site, size);
              }}
              className="paper-field mt-1"
            >
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
              onChange={(event) => {
                const next = event.target.value;
                setSite(next);
                keepGeneratedName(client, next, size);
              }}
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
        <div className="mt-3">
          <p className="text-xs font-semibold tracking-[0.16em] text-[#5b6f73]">OVERTIME / RATE</p>
          <p className="estimate-ot-readout hud-readout mt-1 px-3 py-2 text-sm">{size === "shop" ? "Shop sheet" : rule}</p>
          <p className="mt-1 text-xs text-[#5b6f73]">
            {size === "shop"
              ? "Locked from the shop sheet. Not a field. There is no picker."
              : "Locked from the plant. Not a field. There is no picker."}
          </p>
        </div>
        <label className="mt-3 block">
          <span className="text-xs font-semibold tracking-[0.16em] text-[#5b6f73]">ESTIMATE NAME</span>
          <input value={name} onChange={(event) => setName(event.target.value)} className="paper-field mt-1" />
        </label>
        {eastCoast && size !== "shop" ? (
          <p className="mt-3 text-xs text-[#5b6f73]">
            East Coast (PCA0001103) — never PA or Mid-Atlantic. Catalog plants fill OT from the bound
            contract.
          </p>
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
