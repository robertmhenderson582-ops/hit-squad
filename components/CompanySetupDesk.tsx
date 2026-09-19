"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  COMPANY_LOGO_ACCEPT,
  COMPANY_LOGO_BAD_TYPE,
  COMPANY_LOGO_MAX_ENCODED,
  COMPANY_LOGO_TOO_LARGE,
  companyHasModule,
  companyLogoSrc,
  type Company,
  type CompanyModuleKey,
} from "@/lib/companies";
import { COMPANY_MODULE_CATALOG, type CompanySetupSite } from "@/lib/company-setup";
import type { PublicSiteAccessGrant } from "@/lib/site-access";

type SeatRow = { id: string; email: string; name: string; role: string; jobTitle?: string; companyId?: string };

export function CompanySetupDesk() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [seats, setSeats] = useState<SeatRow[]>([]);
  const [sites, setSites] = useState<CompanySetupSite[]>([]);
  const [grants, setGrants] = useState<PublicSiteAccessGrant[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [newName, setNewName] = useState("");
  const [newShortName, setNewShortName] = useState("");
  const [assignEmail, setAssignEmail] = useState("");
  const [accessEmail, setAccessEmail] = useState("");
  const [accessSiteId, setAccessSiteId] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected = companies.find((row) => row.id === selectedId) ?? companies[0] ?? null;
  const selectedSeats = useMemo(
    () => seats.filter((row) => row.role !== "owner" && (row.companyId || "") === (selected?.id || "")),
    [seats, selected?.id],
  );
  const assignable = useMemo(
    () => seats.filter((row) => row.role !== "owner" && row.role !== "operator" && (row.companyId || "") !== (selected?.id || "")),
    [seats, selected?.id],
  );
  const companySites = useMemo(
    () => sites.filter((site) => site.companyId === selected?.id),
    [sites, selected?.id],
  );
  const otherSites = useMemo(
    () => sites.filter((site) => site.companyId !== selected?.id),
    [sites, selected?.id],
  );
  const selectedGrants = useMemo(() => {
    const emails = new Set(selectedSeats.map((row) => row.email.toLowerCase()));
    const siteIds = new Set(sites.map((site) => site.id));
    return grants.filter((grant) => emails.has(grant.email.toLowerCase()) && siteIds.has(grant.siteId));
  }, [grants, selectedSeats, sites]);

  async function load(preferId?: string) {
    const response = await fetch("/api/desk/companies", { credentials: "include", cache: "no-store" });
    const data = (await response.json().catch(() => ({}))) as {
      companies?: Company[];
      seats?: SeatRow[];
      sites?: CompanySetupSite[];
      grants?: PublicSiteAccessGrant[];
      error?: string;
    };
    if (!response.ok) {
      setError(data.error || "Could not load companies.");
      return;
    }
    const nextCompanies = Array.isArray(data.companies) ? data.companies : [];
    setCompanies(nextCompanies);
    setSeats(Array.isArray(data.seats) ? data.seats : []);
    setSites(Array.isArray(data.sites) ? data.sites : []);
    setGrants(Array.isArray(data.grants) ? data.grants : []);
    const nextId = preferId || selectedId || nextCompanies[0]?.id || "";
    setSelectedId(nextId);
    const row = nextCompanies.find((item) => item.id === nextId) ?? nextCompanies[0];
    if (row) {
      setName(row.name);
      setShortName(row.shortName || "");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!selected) return;
    setName(selected.name);
    setShortName(selected.shortName || "");
  }, [selected?.id, selected?.name, selected?.shortName]);

  async function postCompany(body: Record<string, unknown>) {
    setBusy(true);
    setNote(null);
    setError(null);
    try {
      const response = await fetch("/api/desk/companies", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json().catch(() => ({}))) as {
        company?: Company;
        companies?: Company[];
        error?: string;
        note?: string;
      };
      if (!response.ok) {
        setError(data.error || "Could not save that company.");
        return null;
      }
      if (Array.isArray(data.companies)) setCompanies(data.companies);
      if (data.note) setNote(data.note);
      return data.company ?? null;
    } finally {
      setBusy(false);
    }
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    const created = await postCompany({ action: "create", name: newName, shortName: newShortName });
    if (!created) return;
    setNewName("");
    setNewShortName("");
    await load(created.id);
  }

  async function onSaveIdentity(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    const saved = await postCompany({
      action: "update",
      companyId: selected.id,
      name,
      shortName,
    });
    if (saved) await load(saved.id);
  }

  async function onToggleModule(key: CompanyModuleKey, on: boolean) {
    if (!selected) return;
    const saved = await postCompany({
      action: "update",
      companyId: selected.id,
      modules: { [key]: on },
    });
    if (saved) await load(saved.id);
  }

  async function onAssign() {
    if (!selected || !assignEmail) return;
    setBusy(true);
    setNote(null);
    setError(null);
    try {
      const response = await fetch("/api/desk/seats", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: assignEmail, companyId: selected.id }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; seats?: SeatRow[] };
      if (!response.ok) {
        setError(data.error || "Could not assign that seat.");
        return;
      }
      if (Array.isArray(data.seats)) setSeats(data.seats);
      setAssignEmail("");
      setNote("Seat assigned to this company.");
    } finally {
      setBusy(false);
    }
  }

  async function onGrantAccess() {
    if (!accessEmail || !accessSiteId) return;
    const site = sites.find((row) => row.id === accessSiteId);
    const person = seats.find((row) => row.email === accessEmail);
    setBusy(true);
    setNote(null);
    setError(null);
    try {
      const response = await fetch("/api/desk/site-access", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "grant-site-access",
          siteId: accessSiteId,
          siteName: site?.name,
          email: accessEmail,
          name: person?.name,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(data.error || "Could not grant site access.");
        return;
      }
      const listed = await fetch("/api/desk/companies", { credentials: "include", cache: "no-store" });
      const next = (await listed.json().catch(() => ({}))) as { grants?: PublicSiteAccessGrant[] };
      if (Array.isArray(next.grants)) setGrants(next.grants);
      setAccessEmail("");
      setNote("Site access granted.");
    } finally {
      setBusy(false);
    }
  }

  async function onRevokeAccess(grant: PublicSiteAccessGrant) {
    setBusy(true);
    setNote(null);
    setError(null);
    try {
      const response = await fetch("/api/desk/site-access", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke-site-access", siteId: grant.siteId, email: grant.email }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(data.error || "Could not remove that grant.");
        return;
      }
      setGrants((current) => current.filter((row) => row.id !== grant.id));
      setNote("Site access removed.");
    } finally {
      setBusy(false);
    }
  }

  async function saveLogo(logo: string | null) {
    if (!selected) return;
    setBusy(true);
    setNote(null);
    setError(null);
    try {
      const response = await fetch("/api/desk/companies/logo", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: selected.id, logo }),
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
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="plant-card px-5 py-5">
        <h2 className="text-2xl font-semibold text-[#163038]">Company Setup</h2>
        <p className="mt-2 text-sm text-[#5b6f73]">
          Owner stands up a company, then assigns seats and site access. Turn Home modules on or
          off per company — missing flags stay on, including Madison. Catalog labels (Included /
          Add-on / Not open for trial) are display-only. Billing is not in this phase.
        </p>
        {error ? <p className="mt-3 text-sm text-[#163038]">{error}</p> : null}
        {note ? <p className="mt-3 text-sm text-[#163038]">{note}</p> : null}
      </section>

      <section className="plant-card px-5 py-5">
        <h3 className="text-xl font-semibold text-[#163038]">Add company</h3>
        <form onSubmit={onCreate} className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            Name
            <input className="paper-field mt-1" value={newName} onChange={(event) => setNewName(event.target.value)} required />
          </label>
          <label className="block text-sm">
            Short name
            <input className="paper-field mt-1" value={newShortName} onChange={(event) => setNewShortName(event.target.value)} />
          </label>
          <div className="sm:col-span-2">
            <button type="submit" disabled={busy} className="rounded-lg bg-steel px-4 py-2 text-sm text-white disabled:opacity-40">
              {busy ? "Saving…" : "Create company"}
            </button>
          </div>
        </form>
      </section>

      {selected ? (
        <>
          <section className="plant-card px-5 py-5">
            <div className="flex flex-wrap items-end gap-3">
              <label className="block min-w-[12rem] flex-1 text-sm">
                Company
                <select
                  className="paper-field mt-1"
                  value={selected.id}
                  onChange={(event) => setSelectedId(event.target.value)}
                  aria-label="Company to set up"
                >
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.shortName ? `${company.shortName} — ${company.name}` : company.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className="plant-card px-5 py-5">
            <h3 className="text-xl font-semibold text-[#163038]">Identity</h3>
            <form onSubmit={onSaveIdentity} className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                Name
                <input className="paper-field mt-1" value={name} onChange={(event) => setName(event.target.value)} required />
              </label>
              <label className="block text-sm">
                Short name
                <input className="paper-field mt-1" value={shortName} onChange={(event) => setShortName(event.target.value)} />
              </label>
              <div className="sm:col-span-2">
                <button type="submit" disabled={busy} className="rounded-lg bg-steel px-4 py-2 text-sm text-white disabled:opacity-40">
                  Save identity
                </button>
              </div>
            </form>
            <CompanyLogoEditor company={selected} busy={busy} onUpload={(logo) => void saveLogo(logo)} onRemove={() => void saveLogo(null)} />
          </section>

          <section className="plant-card px-5 py-5">
            <h3 className="text-xl font-semibold text-[#163038]">People</h3>
            <p className="mt-2 text-sm text-[#5b6f73]">
              Assign existing seats. New logins stay on Settings → Manage users.
            </p>
            <ul className="mt-3 space-y-2">
              {selectedSeats.length === 0 ? <li className="text-sm text-[#5b6f73]">No seats on this company yet.</li> : null}
              {selectedSeats.map((seat) => (
                <li key={seat.email} className="text-sm text-[#163038]">
                  {seat.name}
                  {seat.jobTitle ? ` · ${seat.jobTitle}` : ""}
                  <span className="text-[#5b6f73]"> · {seat.email}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap items-end gap-2">
              <label className="block min-w-[12rem] flex-1 text-sm">
                Existing seat
                <select className="paper-field mt-1" value={assignEmail} onChange={(event) => setAssignEmail(event.target.value)} aria-label="Seat to assign">
                  <option value="">Pick a seat</option>
                  {assignable.map((seat) => (
                    <option key={seat.email} value={seat.email}>
                      {seat.name} · {seat.companyId || "unassigned"}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" disabled={busy || !assignEmail} onClick={() => void onAssign()} className="rounded-lg bg-steel px-4 py-2 text-sm text-white disabled:opacity-40">
                Assign to company
              </button>
            </div>
          </section>

          <section className="plant-card px-5 py-5">
            <h3 className="text-xl font-semibold text-[#163038]">Site access</h3>
            <p className="mt-2 text-sm text-[#5b6f73]">
              Grant this company’s seats onto a plant. Same grant as Settings → Site access — no second
              auth. Madison plants stay under Madison unless you grant them here.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                Seat
                <select className="paper-field mt-1" value={accessEmail} onChange={(event) => setAccessEmail(event.target.value)} aria-label="Seat for site access">
                  <option value="">Pick a seat</option>
                  {selectedSeats.map((seat) => (
                    <option key={seat.email} value={seat.email}>
                      {seat.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                Site
                <select className="paper-field mt-1" value={accessSiteId} onChange={(event) => setAccessSiteId(event.target.value)} aria-label="Site for this company">
                  <option value="">Pick a site</option>
                  {companySites.length ? (
                    <optgroup label="This company’s sites">
                      {companySites.map((site) => (
                        <option key={site.id} value={site.id}>
                          {site.name} · {site.client}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                  {otherSites.length ? (
                    <optgroup label="Other sites on this desk">
                      {otherSites.map((site) => (
                        <option key={site.id} value={site.id}>
                          {site.name} · {site.client}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                </select>
              </label>
            </div>
            <button type="button" disabled={busy || !accessEmail || !accessSiteId} onClick={() => void onGrantAccess()} className="mt-3 rounded-lg bg-steel px-4 py-2 text-sm text-white disabled:opacity-40">
              Grant site access
            </button>
            <ul className="mt-4 space-y-2">
              {selectedGrants.length === 0 ? <li className="text-sm text-[#5b6f73]">No grants for these seats yet.</li> : null}
              {selectedGrants.map((grant) => (
                <li key={grant.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#d5e0de] px-3 py-2">
                  <p className="text-sm text-[#163038]">
                    {grant.name || grant.email} · {grant.siteName || grant.siteId}
                    <span className="text-[#5b6f73]"> · {grant.copy}</span>
                  </p>
                  <button type="button" disabled={busy} onClick={() => void onRevokeAccess(grant)} className="rounded-lg border border-steel px-3 py-1.5 text-sm text-steel disabled:opacity-40">
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-[#5b6f73]">
              Queue and apply live on{" "}
              <Link href="/settings/site-access" className="underline">
                Settings → Site access
              </Link>
              .
            </p>
          </section>

          <section className="plant-card px-5 py-5">
            <h3 className="text-xl font-semibold text-[#163038]">Modules</h3>
            <p className="mt-2 text-sm text-[#5b6f73]">
              Off hides that Home tile and matching route for this company’s seats. Owner can still
              open the module for support. Hall seats stay Dispatch-only when Dispatch is on.
              Catalog labels do not charge anyone.
            </p>
            <ul className="mt-4 space-y-3">
              {COMPANY_MODULE_CATALOG.map((item) => (
                <li key={item.key}>
                  <label className="flex items-start gap-3 rounded-lg border border-[#d5e0de] px-3 py-3 text-sm text-[#163038]">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={companyHasModule(selected, item.key)}
                      disabled={busy}
                      aria-label={`${item.label} module`}
                      onChange={(event) => void onToggleModule(item.key, event.target.checked)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{item.label}</span>
                        <span className="rounded-full border border-[#d5e0de] px-2 py-0.5 text-xs text-[#5b6f73]">
                          {item.catalogLabel}
                        </span>
                      </span>
                      <span className="mt-1 block text-[#5b6f73]">{item.note}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </div>
  );
}

function CompanyLogoEditor({
  company,
  busy,
  onUpload,
  onRemove,
}: {
  company: Company;
  busy: boolean;
  onUpload: (logo: string) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const logo = companyLogoSrc(company.logo);
  const [localError, setLocalError] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState("");

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
    <div className="mt-5 flex flex-wrap items-start gap-5">
      <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#d5ddd8] bg-[#fbf8f0]">
        {logo ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={logo} alt={`${company.name} logo`} className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="px-2 text-center text-xs tracking-[0.12em] text-[#5b6f73]">No logo</span>
        )}
      </div>
      <div className="min-w-[12rem] flex-1">
        <p className="text-sm text-[#5b6f73]">{logo ? "On file for the desk and Control Center header." : "No logo on file."}</p>
        <div className="mt-3 flex flex-wrap gap-2">
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
          <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className="rounded-lg bg-steel px-4 py-2 text-sm text-white disabled:opacity-40">
            {busy ? "Saving…" : logo ? "Change" : "Upload"}
          </button>
          <label className="flex min-w-[12rem] flex-1 items-center gap-2">
            <span className="sr-only">Logo URL</span>
            <input type="url" value={logoUrl} onChange={(event) => setLogoUrl(event.target.value)} placeholder="https:// or /logo.png" className="paper-field min-w-0 flex-1" />
            <button
              type="button"
              disabled={busy || !logoUrl.trim()}
              onClick={() => {
                setLocalError(null);
                onUpload(logoUrl.trim());
                setLogoUrl("");
              }}
              className="rounded-lg border border-steel px-4 py-2 text-sm text-steel disabled:opacity-40"
            >
              Use URL
            </button>
          </label>
          {logo ? (
            <button type="button" disabled={busy} onClick={onRemove} className="rounded-lg border border-steel px-4 py-2 text-sm text-steel disabled:opacity-40">
              Remove
            </button>
          ) : null}
        </div>
        {localError ? <p className="mt-3 text-sm text-[#163038]">{localError}</p> : null}
      </div>
    </div>
  );
}
