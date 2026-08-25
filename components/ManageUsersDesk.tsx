"use client";

import { FormEvent, useEffect, useState } from "react";
import { EMPTY_MODULES } from "@/lib/roster";
import type { RosterEntry, RosterModules, RosterPermission } from "@/lib/types";

export function ManageUsersDesk() {
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [permissions, setPermissions] = useState<RosterPermission[]>(["Owner", "Trusted", "Look & feel", "Staff"]);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [permission, setPermission] = useState<RosterPermission>("Staff");
  const [expires, setExpires] = useState("");
  const [modules, setModules] = useState<RosterModules>(EMPTY_MODULES);
  const [estimate, setEstimate] = useState(true);
  const [rateBuilder, setRateBuilder] = useState(true);
  const [askSend, setAskSend] = useState(false);
  const [sendEmail, setSendEmail] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/api/desk/roster", { credentials: "include", cache: "no-store" });
    const data = await response.json();
    if (response.ok) {
      setRoster(data.roster ?? []);
      setPermissions(data.permissions ?? permissions);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (permission === "Look & feel") setRateBuilder(false);
    else setRateBuilder(true);
  }, [permission]);

  async function onAdd(event: FormEvent) {
    event.preventDefault();
    if (password.length < 8) {
      setNote("Password must be 8+.");
      return;
    }
    const response = await fetch("/api/desk/roster", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, username, email, permission, expires, modules, estimate, rateBuilder, passwordSet: true }),
    });
    const data = await response.json();
    if (!response.ok) {
      setNote(data.error || "Could not add.");
      return;
    }
    setRoster(data.roster);
    setName("");
    setUsername("");
    setEmail("");
    setPassword("");
    setExpires("");
    setAskSend(true);
    setSendEmail(false);
    setNote(null);
  }

  return (
    <div className="space-y-5">
      <section className="plant-card px-5 py-5">
        <h2 className="text-2xl font-semibold text-[#163038]">Manage users</h2>
        <p className="mt-2 text-sm text-[#5b6f73]">
          Visual book only. Invites are held. This does not create a login session or send mail.
        </p>
        <form onSubmit={onAdd} className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Name" value={name} onChange={setName} required />
          <Field label="username" value={username} onChange={setUsername} />
          <label>
            password (8+)
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="paper-field mt-1"
              minLength={8}
            />
          </label>
          <Field label="email" value={email} onChange={setEmail} required type="email" />
          <label>
            Permission
            <select
              value={permission}
              onChange={(event) => setPermission(event.target.value as RosterPermission)}
              className="paper-field mt-1"
            >
              {permissions.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            Optional expires date
            <input type="date" value={expires} onChange={(event) => setExpires(event.target.value)} className="paper-field mt-1" />
            <span className="mt-1 block text-xs text-[#5b6f73]">After that they cannot sign in.</span>
          </label>
          <div className="sm:col-span-2">
            <p className="text-sm font-semibold">Modules</p>
            <div className="mt-2 flex flex-wrap gap-3 text-sm">
              <Check label="HSE" on={modules.hse} onChange={(on) => setModules({ ...modules, hse: on })} />
              <Check label="Quality" on={modules.quality} onChange={(on) => setModules({ ...modules, quality: on })} />
              <Check label="Accounting" on={modules.accounting} onChange={(on) => setModules({ ...modules, accounting: on })} />
              <Check label="Payroll" on={modules.payroll} onChange={(on) => setModules({ ...modules, payroll: on })} />
              <Check label="Estimate" on={estimate} onChange={setEstimate} />
              <Check label="Rate builder" on={rateBuilder} onChange={setRateBuilder} />
            </div>
            <p className="mt-2 text-xs text-[#5b6f73]">Estimate default on. Rate builder default on except Joseph / Look & feel.</p>
          </div>
          <button type="submit" className="rounded-lg bg-steel px-4 py-2 text-white sm:col-span-2">
            Add a person
          </button>
        </form>
        {askSend ? (
          <div className="mt-4 rounded-lg bg-[#f4f1e8] px-4 py-3">
            <p className="font-semibold">Send login details?</p>
            <label className="mt-2 block text-sm">
              email field
              <input className="paper-field mt-1" defaultValue="" placeholder="Where the invite would go" />
            </label>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => setSendEmail(true)} className="rounded-lg border border-steel px-3 py-2 text-steel">
                Send email
              </button>
              <button
                type="button"
                onClick={() => {
                  setSendEmail(false);
                  setAskSend(false);
                  setNote("Don’t send. Invites are held.");
                }}
                className={`rounded-lg px-3 py-2 ${sendEmail ? "border border-steel text-steel" : "bg-steel text-white"}`}
              >
                Don’t send
              </button>
            </div>
            {sendEmail ? <p className="mt-2 text-sm text-[#5b6f73]">Mail is not sent. Invites are held.</p> : null}
          </div>
        ) : null}
        {note ? <p className="mt-3 text-sm text-[#5b6f73]">{note}</p> : null}
      </section>

      <section className="plant-card overflow-hidden px-5 py-5">
        <h2 className="text-xl font-semibold text-[#163038]">Roster</h2>
        <p className="text-sm text-[#5b6f73]">Set a new password, change permission, change expiry, or remove. Empty until you add someone.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs tracking-[0.12em] text-[#5b6f73]">
              <tr>
                {["NAME", "USERNAME", "EMAIL", "PERMISSION", "EXPIRES", "MODULES", ""].map((header) => (
                  <th key={header || "x"} className="px-2 py-2">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {roster.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-2 py-4 text-[#5b6f73]">
                    No visual users yet. The seven field testers are not seeded.
                  </td>
                </tr>
              ) : (
                roster.map((row) => (
                  <tr key={row.id} className="border-t border-[#d5e0de] align-top">
                    <td className="px-2 py-2">{row.name}</td>
                    <td className="px-2 py-2">{row.username}</td>
                    <td className="px-2 py-2">{row.email}</td>
                    <td className="px-2 py-2">{row.permission}</td>
                    <td className="px-2 py-2">{row.expires || "—"}</td>
                    <td className="px-2 py-2 text-xs">
                      {[row.estimate ? "Estimate" : null, row.rateBuilder ? "Rates" : null, row.modules.hse ? "HSE" : null, row.modules.quality ? "Quality" : null, row.modules.accounting ? "Accounting" : null, row.modules.payroll ? "Payroll" : null]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        className="text-steel underline"
                        onClick={async () => {
                          await fetch("/api/desk/roster", {
                            method: "POST",
                            credentials: "include",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ removeId: row.id }),
                          }).then((response) => response.json().then((data) => setRoster(data.roster ?? [])));
                        }}
                      >
                        remove
                      </button>
                    </td>
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

function Field({
  label,
  value,
  onChange,
  required,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
}) {
  return (
    <label>
      {label}
      <input required={required} type={type} value={value} onChange={(event) => setValue(event, onChange)} className="paper-field mt-1" />
    </label>
  );
}

function setValue(event: { target: { value: string } }, onChange: (value: string) => void) {
  onChange(event.target.value);
}

function Check({ label, on, onChange }: { label: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="inline-flex items-center gap-2">
      <input type="checkbox" checked={on} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}
