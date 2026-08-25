"use client";

import { FormEvent, useEffect, useState } from "react";
import type { RosterEntry, RosterPermission } from "@/lib/types";

export function UsersAdmin() {
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [permissions, setPermissions] = useState<RosterPermission[]>(["Staff — estimates only"]);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState<RosterPermission>("Staff — estimates only");
  const [expires, setExpires] = useState("");

  async function load() {
    const response = await fetch("/api/desk/roster", { credentials: "include", cache: "no-store" });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Owner desk only.");
      return;
    }
    setRoster(data.roster);
    setPermissions(data.permissions);
    setPermission(data.permissions[0]);
  }

  useEffect(() => {
    load();
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch("/api/desk/roster", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, username, email, permission, expires }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Could not add user.");
      return;
    }
    setRoster(data.roster);
    setName("");
    setUsername("");
    setEmail("");
    setExpires("");
  }

  async function resetTesters() {
    const response = await fetch("/api/desk/roster", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reset: true }),
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
          This roster is the owner book. It does not change email sign-in or the session cookie.
          Login stays the first-party desk. Issued rows appear below.
        </p>
        <button type="button" onClick={resetTesters} className="mt-4 rounded border border-red-500 px-3 py-2 text-sm text-red-600">
          Remove all testers
        </button>
      </section>

      <form onSubmit={onSubmit} className="plant-card px-5 py-5">
        <h2 className="text-2xl font-semibold text-[#163038]">Add a user</h2>
        {error ? <p className="mt-2 text-amber-flare">{error}</p> : null}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label>
            <span className="text-xs font-semibold tracking-[0.16em] text-[#5b6f73]">NAME</span>
            <input required value={name} onChange={(event) => setName(event.target.value)} className="paper-field mt-1" />
          </label>
          <label>
            <span className="text-xs font-semibold tracking-[0.16em] text-[#5b6f73]">USERNAME</span>
            <input value={username} onChange={(event) => setUsername(event.target.value)} className="paper-field mt-1" />
          </label>
          <label>
            <span className="text-xs font-semibold tracking-[0.16em] text-[#5b6f73]">EMAIL</span>
            <input
              required
              type="email"
              placeholder="Where the invite will go."
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="paper-field mt-1"
            />
          </label>
          <label>
            <span className="text-xs font-semibold tracking-[0.16em] text-[#5b6f73]">PERMISSION</span>
            <select
              value={permission}
              onChange={(event) => setPermission(event.target.value as RosterPermission)}
              className="paper-field mt-1"
            >
              {permissions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="text-xs font-semibold tracking-[0.16em] text-[#5b6f73]">EXPIRES (OPTIONAL)</span>
            <input type="date" value={expires} onChange={(event) => setExpires(event.target.value)} className="paper-field mt-1" />
          </label>
        </div>
        <button type="submit" className="mt-5 rounded-lg bg-steel px-5 py-2.5 text-white">
          Add user
        </button>
      </form>

      <section className="plant-card overflow-hidden px-5 py-5">
        <h2 className="text-2xl font-semibold text-[#163038]">Roster</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs tracking-[0.14em] text-[#5b6f73]">
              <tr>
                {["NAME", "USERNAME", "INVITE", "PERMISSION", "EXPIRES", "SIGN-IN"].map((header) => (
                  <th key={header} className="px-2 py-2">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {roster.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-2 py-4 text-[#5b6f73]">
                    No entries.
                  </td>
                </tr>
              ) : (
                roster.map((row) => (
                  <tr key={row.id} className="border-t border-[#d5e0de]">
                    <td className="px-2 py-2">{row.name}</td>
                    <td className="px-2 py-2">{row.username}</td>
                    <td className="px-2 py-2">{row.email}</td>
                    <td className="px-2 py-2">{row.permission}</td>
                    <td className="px-2 py-2">{row.expires || "—"}</td>
                    <td className="px-2 py-2">{row.signIn}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
