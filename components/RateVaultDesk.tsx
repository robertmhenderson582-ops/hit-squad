"use client";

import { useEffect, useState } from "react";
import {
  RATE_VAULT_KICKER,
  RATE_VAULT_OWNER_NOTE,
  RATE_VAULT_SECTIONS,
  RATE_VAULT_TITLE,
  stubPublishRateVault,
  type RateVaultPublishStub,
} from "@/lib/rate-vault";

export function RateVaultDesk() {
  const [publish, setPublish] = useState<RateVaultPublishStub | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/rate-vault", { credentials: "include", cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        if (cancelled) return;
        if (!response.ok) setError(data.error || "Rate Vault is owner-eyes-only.");
      })
      .catch(() => {
        if (!cancelled) setError("Could not reach Rate Vault.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function publishStub() {
    setError(null);
    const response = await fetch("/api/rate-vault", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "publish" }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      publish?: RateVaultPublishStub;
      error?: string;
    };
    if (!response.ok) {
      setError(data.error || "Rate Vault is owner-eyes-only.");
      return;
    }
    setPublish(data.publish ?? stubPublishRateVault());
  }

  return (
    <div className="mt-4 space-y-5">
      <section className="plant-card px-5 py-5">
        <p className="text-xs tracking-[0.14em] text-[#5b6f73]">{RATE_VAULT_KICKER}</p>
        <h2 className="font-display text-3xl tracking-wide text-[#163038]">{RATE_VAULT_TITLE}</h2>
        <p className="mt-2 text-sm leading-6 text-[#5b6f73]">{RATE_VAULT_OWNER_NOTE}</p>
        <p className="mt-2 text-sm leading-6 text-[#5b6f73]">
          Halls, contractor books, and Phillips 66 site rules will land here. This scaffold does not
          import Jobs, Quality, seats, or live estimate Rate Tables.
        </p>
        {error ? <p className="mt-3 text-sm text-[#163038]">{error}</p> : null}
      </section>

      {RATE_VAULT_SECTIONS.map((section) => (
        <section key={section.id} className="plant-card px-5 py-5">
          <h3 className="text-xl font-semibold text-[#163038]">{section.label}</h3>
          <p className="mt-2 text-sm leading-6 text-[#5b6f73]">{section.note}</p>
          {section.id === "publish" ? (
            <div className="mt-4">
              <button type="button" className="rounded-lg bg-steel px-4 py-2 text-sm text-white" onClick={() => void publishStub()}>
                Publish stub
              </button>
              {publish ? <p className="mt-3 text-sm text-[#163038]">{publish.note}</p> : null}
            </div>
          ) : null}
        </section>
      ))}
    </div>
  );
}
