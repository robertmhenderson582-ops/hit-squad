"use client";

import { useEffect, useState } from "react";
import { isOwner } from "@/lib/desk-role";
import { useSession } from "@/components/SessionProvider";

type SiteRow = {
  id: string;
  name: string;
  client: string;
  city: string;
  regularClient: boolean;
};

export function SitesRegularDesk() {
  const { user } = useSession();
  const owner = isOwner(user);
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/api/desk/sites/regular", { credentials: "include", cache: "no-store" });
    const data = (await response.json().catch(() => ({}))) as { sites?: SiteRow[]; error?: string };
    if (!response.ok) {
      setError(data.error || "Could not load sites.");
      return;
    }
    setSites(Array.isArray(data.sites) ? data.sites : []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function save(siteId: string, regularClient: boolean) {
    setBusyId(siteId);
    setNote(null);
    setError(null);
    try {
      const response = await fetch("/api/desk/sites/regular", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, regularClient }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        sites?: SiteRow[];
        error?: string;
        note?: string;
      };
      if (!response.ok) {
        setError(data.error || "Could not save that site.");
        return;
      }
      if (Array.isArray(data.sites)) setSites(data.sites);
      setNote(data.note || "Saved.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <section className="plant-card px-5 py-5">
        <h2 className="text-2xl font-semibold text-[#163038]">Sites</h2>
        <p className="mt-2 text-sm text-[#5b6f73]">
          Regular client is in-facility budget work — Draft through Locked, no Submitted or Awarded.
          Competitive bid keeps the full list. Flip Ferndale to Regular when Madison has presence.
          Packs that were Submitted or Awarded clamp to Locked.
        </p>
        {owner ? null : <p className="mt-3 text-sm text-[#5b6f73]">Only the owner can change Regular vs bid.</p>}
        {error ? <p className="mt-3 text-sm text-[#163038]">{error}</p> : null}
        {note ? <p className="mt-3 text-sm text-[#163038]">{note}</p> : null}
      </section>

      {sites.map((site) => (
        <section key={site.id} className="plant-card px-5 py-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-xl font-semibold text-[#163038]">{site.name}</h3>
              <p className="mt-1 text-sm text-[#5b6f73]">
                {site.client} · {site.city}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!owner || busyId === site.id || site.regularClient}
                onClick={() => void save(site.id, true)}
                className={`rounded-full px-3 py-1.5 text-sm ${
                  site.regularClient ? "bg-steel text-white" : "border border-steel text-steel"
                } ${!owner ? "cursor-not-allowed opacity-50" : ""}`}
              >
                Regular client
              </button>
              <button
                type="button"
                disabled={!owner || busyId === site.id || !site.regularClient}
                onClick={() => void save(site.id, false)}
                className={`rounded-full px-3 py-1.5 text-sm ${
                  !site.regularClient ? "bg-steel text-white" : "border border-steel text-steel"
                } ${!owner ? "cursor-not-allowed opacity-50" : ""}`}
              >
                Competitive bid
              </button>
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
