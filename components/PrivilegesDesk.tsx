"use client";

import { useEffect, useState } from "react";
import type { PrivilegeId } from "@/lib/privileges";

type SeatRow = { id: string; email: string; name: string; role: string };
type PrivilegeRow = { id: PrivilegeId; label: string; detail: string };

export function PrivilegesDesk() {
  const [seats, setSeats] = useState<SeatRow[]>([]);
  const [privileges, setPrivileges] = useState<PrivilegeRow[]>([]);
  const [shared, setShared] = useState<string[]>([]);
  const [grants, setGrants] = useState<Record<string, PrivilegeId[]>>({});
  const [email, setEmail] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/api/desk/privileges", { credentials: "include", cache: "no-store" });
    const data = (await response.json().catch(() => ({}))) as {
      seats?: SeatRow[];
      privileges?: PrivilegeRow[];
      shared?: string[];
      grants?: Record<string, PrivilegeId[]>;
      note?: string;
      error?: string;
    };
    if (!response.ok) {
      setError(data.error || "Could not load privileges.");
      return;
    }
    setSeats(Array.isArray(data.seats) ? data.seats : []);
    setPrivileges(Array.isArray(data.privileges) ? data.privileges : []);
    setShared(Array.isArray(data.shared) ? data.shared : []);
    setGrants(data.grants && typeof data.grants === "object" ? data.grants : {});
    if (data.note) setNote(data.note);
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (email && !seats.some((row) => row.email === email)) {
      setEmail(seats[0]?.email ?? "");
    } else if (!email && seats[0]) {
      setEmail(seats[0].email);
    }
  }, [email, seats]);

  async function toggle(privilege: PrivilegeId, grant: boolean) {
    if (!email) return;
    setError(null);
    const response = await fetch("/api/desk/privileges", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, privilege, grant }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      grants?: Record<string, PrivilegeId[]>;
      error?: string;
    };
    if (!response.ok) {
      setError(data.error || "Could not update that privilege.");
      return;
    }
    if (data.grants) setGrants(data.grants);
    setNote(grant ? "Privilege granted." : "Privilege revoked.");
  }

  const selected = seats.find((row) => row.email === email);
  const current = new Set(grants[email] ?? []);

  return (
    <div className="space-y-5">
      <section className="plant-card px-5 py-5">
        <h2 className="text-2xl font-semibold text-[#163038]">Privileges</h2>
        <p className="mt-2 text-sm leading-6 text-[#5b6f73]">
          Pick a user. Grant or revoke owner-only items from the locked matrix. President shares
          Home, Madison work, Activity view, Madison Inbox, profile / password / branding view, and
          Madison presence. Hit Squad seats stay hidden until granted. Do not invent a login email
          — Add user on Manage users when Freddy’s email is known.
        </p>
        {note ? <p className="mt-3 text-sm text-[#163038]">{note}</p> : null}
        {error ? <p className="mt-3 text-sm text-[#163038]">{error}</p> : null}
        <label className="mt-4 block">
          <span className="text-xs tracking-[0.14em] text-[#5b6f73]">USER</span>
          <select
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="paper-field mt-1"
            aria-label="User to grant privileges"
          >
            {seats.length === 0 ? <option value="">No users yet</option> : null}
            {seats.map((row) => (
              <option key={row.id} value={row.email}>
                {row.name} · {row.role === "president" ? "President" : "Tester"} · {row.email}
              </option>
            ))}
          </select>
        </label>
        {selected ? (
          <p className="mt-2 text-sm text-[#5b6f73]">
            {selected.role === "president"
              ? "President seat. Madison-only people until Hit Squad seats is granted."
              : "Tester seat. Owner-only items stay off unless you grant them here."}
          </p>
        ) : null}
      </section>

      <section className="plant-card px-5 py-5">
        <h3 className="text-xl font-semibold text-[#163038]">Shared with President</h3>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[#5b6f73]">
          {shared.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="plant-card px-5 py-5">
        <h3 className="text-xl font-semibold text-[#163038]">Owner-only — grant or revoke</h3>
        <div className="mt-4 space-y-3">
          {privileges.map((item) => {
            const on = current.has(item.id);
            return (
              <label
                key={item.id}
                className="flex items-start gap-3 rounded-lg border border-[#d5e0de] px-3 py-3"
              >
                <input
                  type="checkbox"
                  checked={on}
                  disabled={!email}
                  onChange={(event) => void toggle(item.id, event.target.checked)}
                  aria-label={item.label}
                />
                <span>
                  <span className="block text-sm font-medium text-[#163038]">{item.label}</span>
                  <span className="block text-sm text-[#5b6f73]">{item.detail}</span>
                </span>
              </label>
            );
          })}
        </div>
      </section>
    </div>
  );
}
