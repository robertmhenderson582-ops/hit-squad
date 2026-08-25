"use client";

import { useEffect, useState } from "react";
import type { RosterEntry } from "@/lib/types";

export function UsersAdmin() {
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/api/desk/roster", { credentials: "include", cache: "no-store" });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Owner desk only.");
      return;
    }
    setRoster(data.roster);
  }

  useEffect(() => {
    load();
  }, []);

  async function resetOne(email: string) {
    const response = await fetch("/api/desk/roster", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resetInvite: true, email }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Could not reset invite.");
      return;
    }
    setRoster(data.roster);
  }

  async function resetAll() {
    const response = await fetch("/api/desk/roster", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resetAllInvites: true }),
    });
    const data = await response.json();
    if (response.ok) setRoster(data.roster);
  }

  return (
    <div className="paper-desk -mx-3 mt-5 space-y-5 rounded-sm px-4 py-6 sm:-mx-4">
      <section className="plant-card px-5 py-5">
        <h2 className="text-2xl font-semibold text-[#163038]">Fresh accounts</h2>
        <p className="mt-1 text-sm text-[#5b6f73]">Your view only. Testers never see this.</p>
        <p className="mt-3 text-sm leading-6 text-[#163038]">
          Seven invite-only seats. They set their own password on first visit at /login. No public
          create-account. No old Grok passwords. Resetting an invite forces a new password. This does
          not change the owner session cookie.
        </p>
        <button type="button" onClick={resetAll} className="mt-4 rounded border border-red-500 px-3 py-2 text-sm text-red-600">
          Reset all invites
        </button>
      </section>

      <section className="plant-card overflow-hidden px-5 py-5">
        <h2 className="text-2xl font-semibold text-[#163038]">Roster</h2>
        {error ? <p className="mt-2 text-amber-flare">{error}</p> : null}
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs tracking-[0.14em] text-[#5b6f73]">
              <tr>
                {["NAME", "USERNAME", "INVITE", "PERMISSION", "SIGN-IN", ""].map((header) => (
                  <th key={header || "action"} className="px-2 py-2">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {roster.map((row) => (
                <tr key={row.id} className="border-t border-[#d5e0de]">
                  <td className="px-2 py-2">{row.name}</td>
                  <td className="px-2 py-2">{row.username}</td>
                  <td className="px-2 py-2">{row.email}</td>
                  <td className="px-2 py-2">{row.permission}</td>
                  <td className="px-2 py-2">{row.signIn}</td>
                  <td className="px-2 py-2">
                    <button type="button" onClick={() => resetOne(row.email)} className="text-sm text-[#0f5f6d] underline">
                      Reset invite
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
