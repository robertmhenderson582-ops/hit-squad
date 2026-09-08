"use client";

import { useEffect, useState } from "react";
import type { Company } from "@/lib/companies";
import { WOOD_RIVER_MOLD, type Division } from "@/lib/divisions";
import { isOwner } from "@/lib/desk-role";
import { useSession } from "@/components/SessionProvider";

export function DivisionsDesk() {
  const { user } = useSession();
  const owner = isOwner(user);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/api/desk/divisions", { credentials: "include", cache: "no-store" });
    const data = (await response.json().catch(() => ({}))) as {
      companies?: Company[];
      divisions?: Division[];
      error?: string;
    };
    if (!response.ok) {
      setError(data.error || "Could not load divisions.");
      return;
    }
    const nextCompanies = Array.isArray(data.companies) ? data.companies : [];
    setCompanies(nextCompanies);
    setDivisions(Array.isArray(data.divisions) ? data.divisions : []);
    setCompanyId((current) => current || nextCompanies[0]?.id || "");
  }

  useEffect(() => {
    void load();
  }, []);

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setNote(null);
    setError(null);
    try {
      const response = await fetch("/api/desk/divisions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json().catch(() => ({}))) as {
        divisions?: Division[];
        error?: string;
        note?: string;
      };
      if (!response.ok) {
        setError(data.error || "Could not save that division.");
        return;
      }
      if (Array.isArray(data.divisions)) setDivisions(data.divisions);
      setNote(data.note || "Saved.");
      setName("");
      setCode("");
      setEditId(null);
    } finally {
      setBusy(false);
    }
  }

  const rows = divisions.filter((row) => !companyId || row.companyId === companyId);

  return (
    <div className="space-y-5">
      <section className="plant-card px-5 py-5">
        <h2 className="text-2xl font-semibold text-[#163038]">Divisions</h2>
        <p className="mt-2 text-sm text-[#5b6f73]">
          Company → Division → Client → Site → Job. Each company owns its own list. Create division
          clones the {WOOD_RIVER_MOLD.label} mold — same five-card crew, estimate layout, rate-sheet,
          and Jobs→estimate tabs. Client faces stay additive. Do not invent plants.
        </p>
        {error ? <p className="mt-3 text-sm text-[#163038]">{error}</p> : null}
        {note ? <p className="mt-3 text-sm text-[#163038]">{note}</p> : null}
      </section>

      <section className="plant-card px-5 py-5">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          {owner && companies.length > 1 ? (
            <label className="text-sm text-[#163038]">
              Company
              <select
                value={companyId}
                onChange={(event) => setCompanyId(event.target.value)}
                className="paper-field mt-1 w-full"
              >
                {companies.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="text-sm text-[#5b6f73]">{companies.find((row) => row.id === companyId)?.name || "Company"}</p>
          )}
          <label className="text-sm text-[#163038]">
            {editId ? "Rename" : "Create division"}
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="paper-field mt-1 w-full"
              placeholder="Mechanical"
            />
          </label>
          <label className="text-sm text-[#163038]">
            Code
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              className="paper-field mt-1 w-full"
              placeholder="307000"
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || !companyId || !name.trim()}
            onClick={() =>
              void post(
                editId
                  ? { companyId, id: editId, name, code }
                  : { companyId, name, code },
              )
            }
            className="rounded-lg bg-steel px-4 py-2 text-white"
          >
            {editId ? "Save name" : "Create division"}
          </button>
          {editId ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setEditId(null);
                setName("");
                setCode("");
              }}
              className="rounded-lg border border-steel px-4 py-2 text-steel"
            >
              Cancel
            </button>
          ) : null}
        </div>
        <p className="mt-3 font-mono text-[11px] tracking-[0.14em] text-steel-glow">
          Mold · {WOOD_RIVER_MOLD.crew} · {WOOD_RIVER_MOLD.tabs}
        </p>
      </section>

      {rows.map((row) => (
        <section key={`${row.companyId}-${row.id}`} className="plant-card px-5 py-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-xl font-semibold text-[#163038]">{row.name}</h3>
              <p className="mt-1 text-sm text-[#5b6f73]">
                {row.code || "No code"} · {WOOD_RIVER_MOLD.label} mold
                {row.seed ? " · Madison seed" : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setCompanyId(row.companyId);
                  setEditId(row.id);
                  setName(row.name);
                  setCode(row.code);
                }}
                className="rounded-full border border-steel px-3 py-1.5 text-sm text-steel"
              >
                Rename
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void post({ companyId: row.companyId, id: row.id, remove: true })}
                className="rounded-full border border-steel px-3 py-1.5 text-sm text-steel"
              >
                Remove
              </button>
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
