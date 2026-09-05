"use client";

import { useEffect, useRef, useState } from "react";
import {
  COMPANY_LOGO_ACCEPT,
  COMPANY_LOGO_BAD_TYPE,
  COMPANY_LOGO_MAX_ENCODED,
  COMPANY_LOGO_TOO_LARGE,
  companyLogoSrc,
  type Company,
} from "@/lib/companies";
import { isOwner } from "@/lib/desk-role";
import { useSession } from "@/components/SessionProvider";

export function BrandingDesk() {
  const { user } = useSession();
  const owner = isOwner(user);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/api/desk/companies/logo", { credentials: "include", cache: "no-store" });
    const data = (await response.json().catch(() => ({}))) as { companies?: Company[]; error?: string };
    if (!response.ok) {
      setError(data.error || "Could not load companies.");
      return;
    }
    setCompanies(Array.isArray(data.companies) ? data.companies : []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function saveLogo(companyId: string, logo: string | null) {
    setBusyId(companyId);
    setNote(null);
    setError(null);
    try {
      const response = await fetch("/api/desk/companies/logo", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, logo }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        companies?: Company[];
        error?: string;
        note?: string;
      };
      if (!response.ok) {
        setError(data.error || "Could not save that logo.");
        return;
      }
      if (Array.isArray(data.companies)) setCompanies(data.companies);
      setNote(data.note || "Saved.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <section className="plant-card px-5 py-5">
        <h2 className="text-2xl font-semibold text-[#163038]">Branding</h2>
        <p className="mt-2 text-sm text-[#5b6f73]">
          One logo per company, on the live desk catalog. Company Desk and the next Excel export
          pick it up. No logo on file means the text door and no sheet splash. PNG, JPEG, or WebP
          under 800 KB.
        </p>
        {owner ? null : <p className="mt-3 text-sm text-[#5b6f73]">Only the owner can upload or remove logos.</p>}
        {error ? <p className="mt-3 text-sm text-[#163038]">{error}</p> : null}
        {note ? <p className="mt-3 text-sm text-[#163038]">{note}</p> : null}
      </section>

      {companies.map((company) => (
        <CompanyLogoCard
          key={company.id}
          company={company}
          owner={owner}
          busy={busyId === company.id}
          onUpload={(logo) => void saveLogo(company.id, logo)}
          onRemove={() => void saveLogo(company.id, null)}
        />
      ))}
    </div>
  );
}

function CompanyLogoCard({
  company,
  owner,
  busy,
  onUpload,
  onRemove,
}: {
  company: Company;
  owner: boolean;
  busy: boolean;
  onUpload: (logo: string) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const logo = companyLogoSrc(company.logo);
  const [localError, setLocalError] = useState<string | null>(null);

  function onPick(file: File | undefined) {
    setLocalError(null);
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setLocalError(COMPANY_LOGO_BAD_TYPE);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result ?? "");
      if (src.length > COMPANY_LOGO_MAX_ENCODED) {
        setLocalError(COMPANY_LOGO_TOO_LARGE);
        return;
      }
      onUpload(src);
    };
    reader.onerror = () => setLocalError(COMPANY_LOGO_BAD_TYPE);
    reader.readAsDataURL(file);
  }

  return (
    <section className="plant-card px-5 py-5">
      <div className="flex flex-wrap items-start gap-5">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#d5ddd8] bg-[#fbf8f0]">
          {logo ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={logo} alt={`${company.name} logo`} className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="px-2 text-center text-xs tracking-[0.12em] text-[#5b6f73]">No logo</span>
          )}
        </div>
        <div className="min-w-[12rem] flex-1">
          <h3 className="text-xl font-semibold text-[#163038]">{company.name}</h3>
          <p className="mt-1 text-sm text-[#5b6f73]">{logo ? "On file for the desk and Excel splash." : "No logo on file."}</p>
          {owner ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <input
                ref={inputRef}
                type="file"
                accept={COMPANY_LOGO_ACCEPT}
                className="sr-only"
                onChange={(event) => {
                  onPick(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => inputRef.current?.click()}
                className="rounded-lg bg-steel px-4 py-2 text-sm text-white disabled:opacity-40"
              >
                {busy ? "Saving…" : logo ? "Change" : "Upload"}
              </button>
              {logo ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={onRemove}
                  className="rounded-lg border border-steel px-4 py-2 text-sm text-steel disabled:opacity-40"
                >
                  Remove
                </button>
              ) : null}
            </div>
          ) : null}
          {localError ? <p className="mt-3 text-sm text-[#163038]">{localError}</p> : null}
        </div>
      </div>
    </section>
  );
}
