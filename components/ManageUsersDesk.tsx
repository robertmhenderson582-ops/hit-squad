"use client";

import { FormEvent, useEffect, useState } from "react";
import { PasswordField } from "@/components/PasswordField";
import { PresencePulse } from "@/components/PresencePulse";
import { useOwnerDesk } from "@/components/OwnerDeskContext";
import { useSession } from "@/components/SessionProvider";
import { COMPANIES, assignmentChoices, companyName, type Company, type CompanyId } from "@/lib/companies";
import { canAddUsers, canUseFollow, isOwner, NOVUS_EMAIL } from "@/lib/desk-role";
import type { SeatGrantActor } from "@/lib/org-positions";
import { lensPeopleFromSeats } from "@/lib/desk-people";
import { followSeatFromEmail } from "@/lib/follow";
import {
  DESK_SEATS_CHANGED_EVENT,
  SEATS_RECOVER_DEADLINE_MS,
  SEATS_REQUEST_DEADLINE_MS,
  SEATS_TIMEOUT_ERROR,
  applyAddedSeats,
  isAlreadySeatedError,
  optimisticSeat,
  removeOptimisticSeat,
  seatsIncludeEmail,
} from "@/lib/manage-users-add";
import { fetchJsonWithDeadline } from "@/lib/session-fetch";
import type { PublicUser, RosterEntry } from "@/lib/types";

type SeatRow = PublicUser & { passwordIssued: boolean; companyId?: string };

function seatCompanyId(row: SeatRow): CompanyId {
  return (row.companyId || "hitsquad").trim() || "hitsquad";
}

type LiveSeat = { email: string; path: string };

export function ManageUsersDesk() {
  const { user } = useSession();
  const desk = useOwnerDesk();
  const owner = isOwner(user);
  const followOk = canUseFollow(user);
  const canAdd = canAddUsers(user);
  const [seats, setSeats] = useState<SeatRow[]>([]);
  const [companies, setCompanies] = useState<Company[]>(COMPANIES);
  const [actor, setActor] = useState<SeatGrantActor | null>(null);
  const [newCompany, setNewCompany] = useState("");
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [liveSeats, setLiveSeats] = useState<LiveSeat[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [addCompanyId, setAddCompanyId] = useState<CompanyId>("hitsquad");
  const [addRole, setAddRole] = useState<"tester" | "president">("tester");
  const [issueEmail, setIssueEmail] = useState(NOVUS_EMAIL);
  const [issuePassword, setIssuePassword] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [seatNote, setSeatNote] = useState<string | null>(null);
  const [recoveryOnce, setRecoveryOnce] = useState<string | null>(null);
  const [open, setOpen] = useState({ seats: true, add: true, roster: false });

  async function loadSeats() {
    const response = await fetch("/api/desk/seats", { credentials: "include", cache: "no-store" });
    const data = await response.json();
    if (response.ok) {
      setSeats(data.seats ?? []);
      if (Array.isArray(data.companies)) setCompanies(data.companies);
      if (data.actor) setActor(data.actor);
    }
  }

  async function loadRoster() {
    const response = await fetch("/api/desk/roster", { credentials: "include", cache: "no-store" });
    const data = await response.json();
    if (response.ok) setRoster(data.roster ?? []);
  }

  useEffect(() => {
    void loadSeats();
    void loadRoster();
    fetch("/api/desk/presence", { credentials: "include", cache: "no-store" })
      .then((response) => response.json())
      .then((data) => setLiveSeats(data.seats ?? []))
      .catch(() => undefined);
  }, []);

  const followPeople = lensPeopleFromSeats(seats);
  const addableRoles = actor?.addableRoles ?? (owner ? (["tester", "president"] as const) : (["tester"] as const));
  const addableCompanies = assignmentChoices(companies).filter((company) =>
    actor ? actor.addableCompanyIds.includes(company.id) : owner,
  );

  useEffect(() => {
    if (!actor) return;
    if (!actor.addableRoles.includes(addRole)) setAddRole("tester");
    if (actor.addableCompanyIds.length && !actor.addableCompanyIds.includes(addCompanyId)) {
      setAddCompanyId(actor.addableCompanyIds[0] as CompanyId);
    }
  }, [actor, addRole, addCompanyId]);

  function followEmail(email: string) {
    const seat = followSeatFromEmail(email, followPeople);
    if (!seat || !desk || !followOk) return;
    const ping = liveSeats.find((row) => row.email.toLowerCase() === email.trim().toLowerCase());
    desk.setFollowSeat(seat, ping?.path ?? "/");
  }

  async function onAssignCompany(email: string, companyId: CompanyId) {
    setSeatNote(null);
    const response = await fetch("/api/desk/seats", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, companyId }),
    });
    const data = await response.json();
    if (!response.ok) {
      setSeatNote(data.error || "Could not assign company.");
      return;
    }
    setSeats(data.seats ?? []);
    if (Array.isArray(data.companies)) setCompanies(data.companies);
    setSeatNote("Company assignment saved. Changing it is the reverse of assign.");
  }

  async function onAddCompany(event: FormEvent) {
    event.preventDefault();
    setSeatNote(null);
    const response = await fetch("/api/desk/seats", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addCompany: newCompany }),
    });
    const data = await response.json();
    if (!response.ok) {
      setSeatNote(data.error || "Could not add company.");
      return;
    }
    setNewCompany("");
    setSeats(data.seats ?? []);
    if (Array.isArray(data.companies)) setCompanies(data.companies);
    setSeatNote("Company added. It is on the assign list.");
  }

  async function onIssue(event: FormEvent) {
    event.preventDefault();
    setSeatNote(null);
    try {
      const { ok, data } = await fetchJsonWithDeadline<{
        error?: string;
        seats?: SeatRow[];
        companies?: Company[];
      }>(
        "/api/desk/seats",
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: issueEmail, password: issuePassword }),
        },
        SEATS_REQUEST_DEADLINE_MS,
        SEATS_TIMEOUT_ERROR,
      );
      setIssuePassword("");
      if (!ok) {
        setSeatNote(data.error || "Could not issue.");
        return;
      }
      setSeats(data.seats ?? []);
      if (Array.isArray(data.companies)) setCompanies(data.companies);
      setSeatNote("Password issued on this desk. Don’t send. First sign-in must change it.");
      setRecoveryOnce(null);
    } catch (error) {
      setIssuePassword("");
      setSeatNote(error instanceof Error ? error.message : "Could not issue.");
    }
  }

  async function onRecoverSeat() {
    setSeatNote(null);
    setRecoveryOnce(null);
    try {
      const { ok, data } = await fetchJsonWithDeadline<{
        error?: string;
        ok?: boolean;
        password?: string;
        email?: string;
        seats?: SeatRow[];
      }>(
        "/api/desk/seats",
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: issueEmail, recover: true }),
        },
        SEATS_REQUEST_DEADLINE_MS,
        SEATS_TIMEOUT_ERROR,
      );
      if (!ok || !data.ok || typeof data.password !== "string") {
        setSeatNote(data.error || "Recovery was not saved.");
        return;
      }
      setSeats(data.seats ?? []);
      setRecoveryOnce(data.password);
      setSeatNote(`One-time recovery for ${data.email}. Copy it now. It is not emailed.`);
    } catch (error) {
      setSeatNote(error instanceof Error ? error.message : "Recovery was not saved.");
    }
  }

  type AddSeatResponse = {
    error?: string;
    seats?: SeatRow[];
    companies?: Company[];
    actor?: SeatGrantActor;
    user?: PublicUser & { companyId?: string };
  };

  function finishAddSuccess(data: AddSeatResponse, pending: ReturnType<typeof optimisticSeat>) {
    setSeats((current) => applyAddedSeats(current, data.seats, data.user, pending));
    if (Array.isArray(data.companies)) setCompanies(data.companies);
    if (data.actor) setActor(data.actor);
    setName("");
    setEmail("");
    setPassword("");
    const nextRole = addableRoles.includes("president") && addRole === "president" ? "president" : "tester";
    setAddRole(nextRole);
    setAddCompanyId(addableCompanies[0]?.id || (nextRole === "president" ? "madison" : "hitsquad"));
    setNote("Login created. Don’t send. First sign-in must change the password. No invite sent.");
    window.dispatchEvent(new Event(DESK_SEATS_CHANGED_EVENT));
  }

  async function recoverAddedSeat(email: string, pending: ReturnType<typeof optimisticSeat>) {
    try {
      const { ok, data } = await fetchJsonWithDeadline<AddSeatResponse>(
        "/api/desk/seats",
        { credentials: "include", cache: "no-store" },
        SEATS_RECOVER_DEADLINE_MS,
        SEATS_TIMEOUT_ERROR,
      );
      if (ok && Array.isArray(data.seats) && seatsIncludeEmail(data.seats, email)) {
        finishAddSuccess(data, pending);
        return true;
      }
    } catch {
      // Keep the timeout / error path. Do not leave ADDING… stuck.
    }
    return false;
  }

  async function onAdd(event: FormEvent) {
    event.preventDefault();
    if (adding) return;
    setNote(null);
    if (password.length < 8) {
      setNote("Password must be 8+.");
      return;
    }
    if (!addableRoles.includes(addRole)) {
      setNote("That permission is above your seat.");
      return;
    }
    const role = addRole;
    const companyId =
      addableCompanies.some((company) => company.id === addCompanyId)
        ? addCompanyId
        : addableCompanies[0]?.id || (role === "president" ? "madison" : "hitsquad");
    if (addableCompanies.length && !addableCompanies.some((company) => company.id === companyId)) {
      setNote("Hit Squad seats stay on the owner desk.");
      return;
    }
    const pending = optimisticSeat({ name, email, role, companyId });
    setAdding(true);
    setSeats((current) => applyAddedSeats(current, undefined, undefined, pending));
    try {
      const { ok, data } = await fetchJsonWithDeadline<AddSeatResponse>(
        "/api/desk/seats",
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            email,
            password,
            companyId,
            role: addRole,
          }),
        },
        SEATS_REQUEST_DEADLINE_MS,
        SEATS_TIMEOUT_ERROR,
      );
      if (!ok) {
        if (isAlreadySeatedError(data.error) && (await recoverAddedSeat(pending.email, pending))) return;
        setSeats((current) => removeOptimisticSeat(current, pending.email));
        setNote(data.error || "Could not add.");
        return;
      }
      finishAddSuccess(data, pending);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not add.";
      if (message === SEATS_TIMEOUT_ERROR && (await recoverAddedSeat(pending.email, pending))) return;
      setSeats((current) => removeOptimisticSeat(current, pending.email));
      setNote(message);
    } finally {
      setAdding(false);
    }
  }

  async function removeAll() {
    const response = await fetch("/api/desk/roster", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reset: true }),
    });
    const data = await response.json();
    if (response.ok) {
      setRoster(data.roster ?? []);
      setNote("Roster cleared. Nobody was seeded.");
    }
  }

  return (
    <div className="space-y-5">
      <PresencePulse />
      <Collapsible
        title="Operator seats"
        open={open.seats}
        onToggle={() => setOpen((current) => ({ ...current, seats: !current.seats }))}
      >
        <p className="text-sm leading-6 text-[#5b6f73]">
          Robert Henderson stays the only owner. Novus is a hidden operator seat. Testers never see
          this list, Novus, or each other. Add a tester below, or issue a one-time password for a
          seat already on this desk. Don’t send. They change it on first sign-in. No invite email.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs tracking-[0.12em] text-[#5b6f73]">
              <tr>
                {["NAME", "EMAIL", "ROLE", "COMPANY", "PASSWORD", followOk ? "FOLLOW" : ""].filter(Boolean).map((header) => (
                  <th key={header} className="px-2 py-2">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {seats.map((row) => (
                <tr key={row.id} className="border-t border-[#d5e0de]">
                  <td className="px-2 py-2">{row.name}</td>
                  <td className="px-2 py-2">{row.email}</td>
                  <td className="px-2 py-2">
                    {row.role === "owner"
                      ? "Owner"
                      : row.role === "operator"
                        ? "Operator"
                        : row.role === "president"
                          ? "President"
                          : "Tester"}
                  </td>
                  <td className="px-2 py-2">
                    {row.role === "owner" ? (
                      <span>All · {companyName(seatCompanyId(row), companies)}</span>
                    ) : owner ? (
                      <select
                        value={seatCompanyId(row)}
                        onChange={(event) => onAssignCompany(row.email, event.target.value as CompanyId)}
                        className="paper-field"
                        aria-label={`Company for ${row.name}`}
                      >
                        {assignmentChoices(companies).map((company) => (
                          <option key={company.id} value={company.id}>
                            {company.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      companyName(seatCompanyId(row), companies)
                    )}
                  </td>
                  <td className="px-2 py-2">
                    {row.role === "owner"
                      ? "Owner password"
                      : row.passwordIssued
                        ? "Issued — first sign-in must change"
                        : "Not issued"}
                  </td>
                  {followOk ? (
                    <td className="px-2 py-2">
                      {followSeatFromEmail(row.email, followPeople) && row.email.toLowerCase() !== NOVUS_EMAIL ? (
                        <button
                          type="button"
                          onClick={() => followEmail(row.email)}
                          className={`rounded-lg px-3 py-1.5 text-sm ${
                            desk?.followSeat === followSeatFromEmail(row.email, followPeople)
                              ? "bg-steel text-white"
                              : "border border-steel text-steel"
                          }`}
                        >
                          {desk?.followSeat === followSeatFromEmail(row.email, followPeople) ? "Watching" : "Follow"}
                        </button>
                      ) : (
                        <span className="text-[#5b6f73]">—</span>
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {owner ? (
          <form onSubmit={onAddCompany} className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className="text-xs tracking-[0.14em] text-[#5b6f73]">ADD COMPANY</span>
              <input
                value={newCompany}
                onChange={(event) => setNewCompany(event.target.value)}
                className="paper-field mt-1"
                placeholder="Company name"
                required
                minLength={2}
              />
            </label>
            <button type="submit" className="rounded-lg border border-steel px-4 py-2 text-steel sm:col-span-2">
              Add company
            </button>
          </form>
        ) : null}
        {owner ? (
          <form onSubmit={onIssue} className="mt-4 grid gap-3 sm:grid-cols-2">
            <label>
              <span className="text-xs tracking-[0.14em] text-[#5b6f73]">SEAT</span>
              <select
                value={issueEmail}
                onChange={(event) => setIssueEmail(event.target.value)}
                className="paper-field mt-1"
              >
                {seats.map((row) => (
                  <option key={row.id} value={row.email}>
                    {row.name} · {row.email}
                    {row.role === "owner" ? " · recovery only" : ""}
                  </option>
                ))}
              </select>
            </label>
            <PasswordField
              label="Issue password"
              autoComplete="new-password"
              value={issuePassword}
              onChange={setIssuePassword}
              minLength={8}
              required
            />
            <button type="submit" className="rounded-lg bg-steel px-4 py-2 text-white sm:col-span-2">
              Issue password (Don’t send)
            </button>
            <button
              type="button"
              onClick={() => void onRecoverSeat()}
              className="rounded-lg border border-steel px-4 py-2 text-steel sm:col-span-2"
            >
              Issue one-time recovery
            </button>
          </form>
        ) : (
          <p className="mt-4 text-sm text-[#5b6f73]">Only the owner can issue this password.</p>
        )}
        {seatNote ? <p className="mt-3 text-sm text-[#163038]">{seatNote}</p> : null}
        {recoveryOnce ? (
          <p className="mt-2 break-all rounded-sm border border-[#163038] bg-[#fbf8f0] px-3 py-2 font-mono text-sm text-[#163038]">
            {recoveryOnce}
          </p>
        ) : null}
      </Collapsible>

      {canAdd ? (
        <>
          <Collapsible
            title="Add user"
            open={open.add}
            onToggle={() => setOpen((current) => ({ ...current, add: !current.add }))}
          >
            <p className="text-sm leading-6 text-[#5b6f73]">
              Creates a login on this desk. Name, email, company, role, and a one-time password.
              Don’t send. They change it on first sign-in. No invite email. Default company is Hit
              Squad. President is the Madison desk seat — assign President and Madison when the
              login email is known. Do not invent an email.
              {owner
                ? ""
                : " You can only add seats at or below your own permissions. Hit Squad stays on the owner desk unless that company is on your seat."}
            </p>
            <form onSubmit={onAdd} className="mt-3" aria-busy={adding}>
              <fieldset disabled={adding} className="grid gap-3 border-0 p-0 sm:grid-cols-2 disabled:opacity-70">
              <Field label="NAME" value={name} onChange={setName} required disabled={adding} />
              <Field label="EMAIL" value={email} onChange={setEmail} required type="email" placeholder="They type this to sign in" disabled={adding} />
              <label>
                <span className="text-xs tracking-[0.14em] text-[#5b6f73]">ROLE</span>
                <select
                  value={addRole}
                  onChange={(event) => {
                    const next = event.target.value === "president" ? "president" : "tester";
                    setAddRole(next);
                    if (next === "president" && addCompanyId === "hitsquad") setAddCompanyId("madison");
                  }}
                  className="paper-field mt-1"
                  aria-label="Role for the new user"
                  disabled={adding}
                >
                  <option value="tester">Tester</option>
                  {addableRoles.includes("president") ? <option value="president">President</option> : null}
                </select>
              </label>
              <label>
                <span className="text-xs tracking-[0.14em] text-[#5b6f73]">COMPANY</span>
                <select
                  value={addCompanyId}
                  onChange={(event) => setAddCompanyId(event.target.value as CompanyId)}
                  className="paper-field mt-1"
                  aria-label="Company for the new user"
                  disabled={adding}
                >
                  {(addableCompanies.length ? addableCompanies : assignmentChoices(companies)).map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>
              </label>
              <PasswordField
                label="One-time password"
                autoComplete="new-password"
                value={password}
                onChange={setPassword}
                minLength={8}
                required
                disabled={adding}
              />
              <button
                type="submit"
                disabled={adding}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-steel px-4 py-2 text-white sm:col-span-2 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {adding ? <span className="hs-hold-spin hs-hold-spin-inline" aria-hidden="true" /> : null}
                {adding ? "ADDING…" : "Add user"}
              </button>
              </fieldset>
            </form>
            {note ? (
              <p role="status" className="mt-3 text-sm text-[#163038]">
                {note}
              </p>
            ) : null}
          </Collapsible>

          {owner ? <Collapsible
            title="Visual roster"
            open={open.roster}
            onToggle={() => setOpen((current) => ({ ...current, roster: !current.roster }))}
          >
            <p className="mb-3 text-sm leading-6 text-[#5b6f73]">
              Leftover names-on-the-board only. Add user above creates the login.
            </p>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs tracking-[0.12em] text-[#5b6f73]">
                  <tr>
                    {["NAME", "USERNAME", "EMAIL", "PERMISSION", "EXPIRES", "SIGN-IN", "FOLLOW"].map((header) => (
                      <th key={header} className="px-2 py-2">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {roster.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-2 py-4 text-[#5b6f73]">
                        Empty visual book. Use Add user for a login. Novus is not a tester.
                      </td>
                    </tr>
                  ) : (
                    roster.map((row) => (
                      <tr key={row.id} className="border-t border-[#d5e0de]">
                        <td className="px-2 py-2">{row.name}</td>
                        <td className="px-2 py-2">{row.username}</td>
                        <td className="px-2 py-2">{row.email}</td>
                        <td className="px-2 py-2">
                          {row.permission === "Staff" ? "Staff — estimates only" : row.permission}
                        </td>
                        <td className="px-2 py-2">{row.expires || "—"}</td>
                        <td className="px-2 py-2">{row.signIn}</td>
                        <td className="px-2 py-2">
                          {followSeatFromEmail(row.email, followPeople) ? (
                            <button
                              type="button"
                              onClick={() => followEmail(row.email)}
                              className={`rounded-lg px-3 py-1.5 text-sm ${
                                desk?.followSeat === followSeatFromEmail(row.email, followPeople)
                                  ? "bg-steel text-white"
                                  : "border border-steel text-steel"
                              }`}
                            >
                              {desk?.followSeat === followSeatFromEmail(row.email, followPeople) ? "Watching" : "Follow"}
                            </button>
                          ) : (
                            <span className="text-[#5b6f73]">—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <button type="button" onClick={removeAll} className="mt-4 rounded-lg border border-[#d5e0de] px-4 py-2 text-[#b74120]">
              Clear visual roster
            </button>
          </Collapsible> : null}
        </>
      ) : null}
    </div>
  );
}

function Collapsible({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  children: React.ReactNode;
  onToggle: () => void;
}) {
  return (
    <section className="plant-card px-5 py-5">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between text-left">
        <h2 className="text-2xl font-semibold text-[#163038]">{title}</h2>
        <span className="text-[#5b6f73]">{open ? "▾" : "▸"}</span>
      </button>
      {open ? <div className="mt-3">{children}</div> : null}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  type = "text",
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <label>
      <span className="text-xs tracking-[0.14em] text-[#5b6f73]">{label}</span>
      <input
        required={required}
        type={type}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="paper-field mt-1"
      />
    </label>
  );
}
