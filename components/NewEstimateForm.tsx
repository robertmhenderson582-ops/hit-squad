"use client";

import { FormEvent, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { EstimateWorkspace, type EstimateTab } from "@/components/EstimateWorkspace";
import { useDeskBoard } from "@/components/useDeskBoard";

export function NewEstimateForm() {
  const params = useSearchParams();
  const { board } = useDeskBoard();
  const preset = params.get("preset") || "p66";
  const presetSite = params.get("site") || "";
  const [tab, setTab] = useState<EstimateTab>("summary");
  const [customer, setCustomer] = useState<"existing" | "new">("existing");
  const [status, setStatus] = useState("Estimate");
  const [type, setType] = useState(preset === "shop" ? "Lump sum" : "T&M");
  const [client, setClient] = useState(
    preset === "other" ? "" : preset === "shop" ? "Shop" : "Phillips 66",
  );
  const [name, setName] = useState(
    preset === "p66" ? "New T&M estimate" : preset === "shop" ? "Simple shop job" : "New estimate",
  );
  const [siteId, setSiteId] = useState(presetSite);
  const [filed, setFiled] = useState<string | null>(null);

  const sites = useMemo(() => board?.sites ?? [], [board]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const stamp = new Date();
    setFiled(
      `EST-${stamp.getFullYear().toString().slice(2)}${String(stamp.getMonth() + 1).padStart(2, "0")}-${String(stamp.getDate()).padStart(2, "0")}`,
    );
  }

  return (
    <EstimateWorkspace crumb={`${client || "Client"} / ${name}`} tab={tab} onTab={setTab}>
      {tab !== "summary" ? (
        <p className="text-[#5b6f73]">Open the package on Summary first. Other rails fill after the blotter has a file.</p>
      ) : (
        <form onSubmit={onSubmit} className="plant-card mx-auto max-w-3xl px-6 py-6">
          <h1 className="text-3xl font-semibold text-[#163038]">Project</h1>
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCustomer("existing")}
              className={`pill ${customer === "existing" ? "bg-steel text-white" : "border border-[#c5d4d4] bg-white"}`}
            >
              Existing customer
            </button>
            <button
              type="button"
              onClick={() => setCustomer("new")}
              className={`pill ${customer === "new" ? "bg-steel text-white" : "border border-[#c5d4d4] bg-white"}`}
            >
              New / potential client
            </button>
          </div>
          <p className="mt-6 text-xs font-semibold tracking-[0.18em] text-[#5b6f73]">STATUS</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {["Estimate", "Submitted", "Awarded"].map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setStatus(item)}
                className={`pill ${status === item ? "bg-steel text-white" : "border border-[#c5d4d4] bg-white"}`}
              >
                {item}
              </button>
            ))}
          </div>
          <label className="mt-6 block">
            <span className="text-xs font-semibold tracking-[0.18em] text-[#5b6f73]">ESTIMATE TYPE</span>
            <input value={type} onChange={(event) => setType(event.target.value)} className="paper-field mt-2" />
          </label>
          <label className="mt-4 block">
            <span className="text-xs font-semibold tracking-[0.18em] text-[#5b6f73]">CLIENT</span>
            <input value={client} onChange={(event) => setClient(event.target.value)} className="paper-field mt-2" />
          </label>
          <label className="mt-4 block">
            <span className="text-xs font-semibold tracking-[0.18em] text-[#5b6f73]">ESTIMATE NAME</span>
            <input value={name} onChange={(event) => setName(event.target.value)} className="paper-field mt-2" />
          </label>
          <label className="mt-4 block">
            <span className="text-xs font-semibold tracking-[0.18em] text-[#5b6f73]">SITE</span>
            <select value={siteId} onChange={(event) => setSiteId(event.target.value)} className="paper-field mt-2">
              <option value="">Select plant</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.family} — {site.name}
                </option>
              ))}
            </select>
          </label>
          {filed ? (
            <p className="mt-5 text-sm text-[#163038]">
              Draft {filed} is on this desk only. It does not create a login or leave the owner blotter.
            </p>
          ) : (
            <button type="submit" className="mt-6 rounded-lg bg-steel px-5 py-3 text-white">
              Open package
            </button>
          )}
        </form>
      )}
    </EstimateWorkspace>
  );
}
