"use client";

import { useEffect, useState } from "react";
import type { Company } from "@/lib/companies";
import type { Division } from "@/lib/divisions";
import { divisionHeadPositionId } from "@/lib/org-positions";
import type { OrgPositionView, SeatGrantActor } from "@/lib/org-positions";

type Person = { id: string; email: string; name: string; role: string; companyId?: string };

type PositionsPayload = {
  positions?: OrgPositionView[];
  people?: Person[];
  divisions?: Division[];
  companies?: Company[];
  actor?: SeatGrantActor;
  error?: string;
  note?: string;
};

function roleLabel(role: string) {
  if (role === "owner") return "Owner";
  if (role === "operator") return "Operator";
  if (role === "president") return "President";
  return "Tester";
}

function kindLabel(kind: string) {
  if (kind === "president") return "President";
  if (kind === "division-head") return "Division Head";
  if (kind === "project-manager") return "Project Manager";
  return "Position";
}

export function holderLine(holder: { name: string; role: string }) {
  if (holder.role === "owner") return `${holder.name} · Owner`;
  return `${holder.name} · ${roleLabel(holder.role)}`;
}

export function PositionsDesk({ focusDivisionId }: { focusDivisionId?: string } = {}) {
  const [positions, setPositions] = useState<OrgPositionView[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [actor, setActor] = useState<SeatGrantActor | null>(null);
  const [assignEmail, setAssignEmail] = useState<Record<string, string>>({});
  const [rename, setRename] = useState<Record<string, string>>({});
  const [createName, setCreateName] = useState("");
  const [createCompanyId, setCreateCompanyId] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/api/desk/positions", { credentials: "include", cache: "no-store" });
    const data = (await response.json().catch(() => ({}))) as PositionsPayload;
    if (!response.ok) {
      setError(data.error || "Could not load positions.");
      return;
    }
    setPositions(Array.isArray(data.positions) ? data.positions : []);
    setPeople(Array.isArray(data.people) ? data.people : []);
    setCompanies(Array.isArray(data.companies) ? data.companies : []);
    setActor(data.actor ?? null);
    if (data.note) setNote(data.note);
  }

  useEffect(() => {
    void load();
  }, []);

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setNote(null);
    setError(null);
    try {
      const response = await fetch("/api/desk/positions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json().catch(() => ({}))) as PositionsPayload;
      if (!response.ok) {
        setError(data.error || "Could not save that seat.");
        return;
      }
      if (Array.isArray(data.positions)) setPositions(data.positions);
      if (Array.isArray(data.people)) setPeople(data.people);
      if (Array.isArray(data.companies)) setCompanies(data.companies);
      if (data.actor) setActor(data.actor);
      setNote(data.note || "Saved.");
    } finally {
      setBusy(false);
    }
  }

  const rows = focusDivisionId
    ? positions.filter((row) => row.divisionId === focusDivisionId || row.id === divisionHeadPositionId(row.companyId || "", focusDivisionId))
    : positions;

  return (
    <div className="space-y-5">
      <section className="plant-card px-5 py-5">
        <h2 className="text-2xl font-semibold text-[#163038]">Positions</h2>
        <p className="mt-2 text-sm leading-6 text-[#5b6f73]">
          Assign people to President, Division Head, Project Manager, or a title you add. Revoke and
          rename use the same controls on every seat. Titles stack — Division Head does not strip
          Owner. Future positions use this desk.           Corporate desks stay plumbing only.
          {actor && actor.rank < 80
            ? " You can only assign titles at or below your own seat."
            : ""}
        </p>
        {error ? <p className="mt-3 text-sm text-[#163038]">{error}</p> : null}
        {note ? <p className="mt-3 text-sm text-[#163038]">{note}</p> : null}
      </section>

      {rows.map((row) => {
        const taken = new Set(row.holders.map((holder) => holder.email));
        const choices = people.filter((person) => !taken.has(person.email));
        const email = assignEmail[row.id] || choices[0]?.email || "";
        return (
          <section key={row.id} className="plant-card px-5 py-5" data-position-id={row.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-semibold text-[#163038]">{row.label}</h3>
                <p className="mt-1 text-sm text-[#5b6f73]">
                  {kindLabel(row.kind)}
                  {row.companyId ? ` · ${companies.find((company) => company.id === row.companyId)?.name || row.companyId}` : ""}
                  {row.seed ? " · Seeded seat" : ""}
                </p>
              </div>
              {row.kind === "custom" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void post({ action: "remove", positionId: row.id })}
                  className="rounded-full border border-steel px-3 py-1.5 text-sm text-steel"
                >
                  Remove
                </button>
              ) : null}
            </div>

            <div className="mt-4 space-y-2">
              {row.holders.length === 0 ? (
                <p className="text-sm text-[#5b6f73]">No one holds this seat.</p>
              ) : (
                row.holders.map((holder) => (
                  <div key={holder.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#d5e0de] px-3 py-2">
                    <p className="text-sm text-[#163038]">{holderLine(holder)}</p>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void post({ action: "revoke", holdId: holder.id, positionId: row.id, email: holder.email })}
                      className="rounded-full border border-steel px-3 py-1.5 text-sm text-steel"
                    >
                      Revoke
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              <label className="text-sm text-[#163038]">
                Assign
                <select
                  value={email}
                  onChange={(event) => setAssignEmail((current) => ({ ...current, [row.id]: event.target.value }))}
                  className="paper-field mt-1 w-full"
                  aria-label={`Assign ${row.label}`}
                  disabled={busy || choices.length === 0}
                >
                  {choices.length === 0 ? <option value="">Everyone visible already holds this</option> : null}
                  {choices.map((person) => (
                    <option key={person.email} value={person.email}>
                      {person.name} · {roleLabel(person.role)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={busy || !email}
                onClick={() => void post({ action: "assign", positionId: row.id, email })}
                className="self-end rounded-lg bg-steel px-4 py-2 text-white"
              >
                Assign
              </button>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              <label className="text-sm text-[#163038]">
                Rename
                <input
                  value={rename[row.id] ?? ""}
                  onChange={(event) => setRename((current) => ({ ...current, [row.id]: event.target.value }))}
                  className="paper-field mt-1 w-full"
                  placeholder={row.defaultLabel || row.label}
                />
              </label>
              <button
                type="button"
                disabled={busy || !(rename[row.id] || "").trim()}
                onClick={() => void post({ action: "rename", positionId: row.id, label: rename[row.id] })}
                className="self-end rounded-lg border border-steel px-4 py-2 text-steel"
              >
                Save name
              </button>
            </div>
          </section>
        );
      })}

      {!focusDivisionId ? (
        <section className="plant-card px-5 py-5">
          <h3 className="text-xl font-semibold text-[#163038]">Add a position</h3>
          <p className="mt-2 text-sm text-[#5b6f73]">
            Same assign, revoke, and rename as President and Division Head. Does not open a Corporate desk.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <label className="text-sm text-[#163038]">
              Name
              <input
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
                className="paper-field mt-1 w-full"
                placeholder="Estimator"
              />
            </label>
            <label className="text-sm text-[#163038]">
              Company
              <select
                value={createCompanyId}
                onChange={(event) => setCreateCompanyId(event.target.value)}
                className="paper-field mt-1 w-full"
                aria-label="Company for the new position"
              >
                <option value="">Any visible company</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={busy || !createName.trim()}
              onClick={() => {
                void post({ action: "create", name: createName, companyId: createCompanyId || undefined }).then(() => {
                  setCreateName("");
                });
              }}
              className="self-end rounded-lg bg-steel px-4 py-2 text-white"
            >
              Add position
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
