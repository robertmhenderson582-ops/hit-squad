"use client";

import { useEffect, useState } from "react";
import type { SiteAccessGrant } from "@/lib/site-access";

export function SiteAccessQueueDesk() {
  const [queue, setQueue] = useState<SiteAccessGrant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/api/desk/site-access?queue=1", {
      credentials: "include",
      cache: "no-store",
    });
    const data = (await response.json().catch(() => ({}))) as {
      queue?: SiteAccessGrant[];
      error?: string;
    };
    if (!response.ok) {
      setError(data.error || "Could not load the site access queue.");
      return;
    }
    setQueue(Array.isArray(data.queue) ? data.queue : []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function decide(grant: SiteAccessGrant, action: "apply-site-access" | "fail-site-access") {
    setError(null);
    const response = await fetch("/api/desk/site-access", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, grantId: grant.id }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      queue?: SiteAccessGrant[];
      error?: string;
    };
    if (!response.ok) {
      setError(data.error || "Could not complete that grant.");
      return;
    }
    if (data.queue) setQueue(data.queue);
    setNote(action === "apply-site-access" ? "Access applied." : "Couldn't complete site access.");
  }

  return (
    <section className="plant-card px-5 py-5">
      <h2 className="text-2xl font-semibold text-[#163038]">Site access</h2>
      <p className="mt-2 text-sm leading-6 text-[#5b6f73]">
        Owner desk and Novus queue. Apply a PM grant here before it goes live on the plant.
        The plant People tab only shows that site access usually finishes within a few hours —
        no approve button there.
      </p>
      {note ? <p className="mt-3 text-sm text-[#163038]">{note}</p> : null}
      {error ? <p className="mt-3 text-sm text-[#163038]">{error}</p> : null}
      <ul className="mt-4 space-y-3">
        {queue.length === 0 ? <li className="text-sm text-[#5b6f73]">No grants waiting.</li> : null}
        {queue.map((grant) => (
          <li key={grant.id} className="rounded-lg border border-[#d5e0de] px-3 py-3">
            <p className="text-sm font-medium text-[#163038]">
              {grant.name || grant.email}
              {grant.siteName ? ` · ${grant.siteName}` : ""}
            </p>
            <p className="mt-1 text-sm text-[#5b6f73]">
              From {grant.grantedByName || grant.grantedByEmail}
              {grant.timeboxed
                ? ` · ${grant.startYmd || "—"} → ${grant.endYmd || "—"}`
                : " · not time-boxed"}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void decide(grant, "apply-site-access")}
                className="rounded-lg bg-steel px-3 py-1.5 text-sm text-white"
              >
                Apply access
              </button>
              <button
                type="button"
                onClick={() => void decide(grant, "fail-site-access")}
                className="rounded-lg border border-steel px-3 py-1.5 text-sm text-steel"
              >
                Couldn&apos;t complete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
