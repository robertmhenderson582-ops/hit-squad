"use client";

import { useEffect, useState } from "react";
import {
  RATE_VAULT_CBA_PLA_ID,
  RATE_VAULT_CBA_PLA_RULES,
  RATE_VAULT_CBA_PLA_SECTION,
  RATE_VAULT_KICKER,
  RATE_VAULT_OWNER_NOTE,
  RATE_VAULT_SECTIONS,
  RATE_VAULT_STATE_LAW_ID,
  RATE_VAULT_STATE_LAW_RULES,
  RATE_VAULT_STATE_LAW_SECTION,
  RATE_VAULT_STATE_LAW_SITES,
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
          Halls, contractor books, CBA / PLA, state law, and Phillips 66 site rules will land
          here. This scaffold does not import Jobs, Quality, seats, or live estimate Rate Tables.
        </p>
        {error ? <p className="mt-3 text-sm text-[#163038]">{error}</p> : null}
      </section>

      {RATE_VAULT_SECTIONS.map((section) => (
        <section key={section.id} className="plant-card px-5 py-5">
          {section.id === RATE_VAULT_CBA_PLA_ID ? (
            <p className="text-xs tracking-[0.14em] text-[#5b6f73]">{RATE_VAULT_CBA_PLA_SECTION.title}</p>
          ) : null}
          {section.id === RATE_VAULT_STATE_LAW_ID ? (
            <p className="text-xs tracking-[0.14em] text-[#5b6f73]">{RATE_VAULT_STATE_LAW_SECTION.title}</p>
          ) : null}
          <h3 className="text-xl font-semibold text-[#163038]">{section.label}</h3>
          <p className="mt-2 text-sm leading-6 text-[#5b6f73]">{section.note}</p>
          {section.id === RATE_VAULT_CBA_PLA_ID ? <RateVaultCbaPlaStub /> : null}
          {section.id === RATE_VAULT_STATE_LAW_ID ? <RateVaultStateLawStub /> : null}
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

function RateVaultCbaPlaStub() {
  return (
    <div className="mt-4 space-y-3">
      <div className="rounded-lg border border-dashed border-[#d5e0de] px-4 py-6">
        <p className="text-sm font-semibold text-[#163038]">Drop a CBA or PLA</p>
        <p className="mt-1 text-sm leading-6 text-[#5b6f73]">
          File drop stub — capture is not wired. Nothing is stored, and this does not touch live
          estimate clocks.
        </p>
        <input type="file" disabled className="paper-field mt-3" aria-label="CBA / PLA upload stub" />
      </div>
      <p className="text-sm text-[#5b6f73]">Vault is empty. No CBA / PLA captures yet.</p>
      <ul className="space-y-1 text-sm text-[#5b6f73]">
        {RATE_VAULT_CBA_PLA_RULES.map((rule) => (
          <li key={rule.id}>{rule.label} — not captured</li>
        ))}
      </ul>
    </div>
  );
}

function RateVaultStateLawStub() {
  return (
    <div className="mt-4 space-y-3">
      <p className="text-sm text-[#5b6f73]">Vault is empty. No state-law captures yet.</p>
      <ul className="space-y-1 text-sm text-[#5b6f73]">
        {RATE_VAULT_STATE_LAW_SITES.map((row) => (
          <li key={`${row.site}-${row.state}`}>
            {row.site} — {row.state}
          </li>
        ))}
      </ul>
      <ul className="space-y-1 text-sm text-[#5b6f73]">
        {RATE_VAULT_STATE_LAW_RULES.map((rule) => (
          <li key={rule.id}>{rule.label} — not captured</li>
        ))}
      </ul>
    </div>
  );
}
