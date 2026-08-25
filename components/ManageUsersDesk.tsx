"use client";

import { FormEvent, useEffect, useState } from "react";
import { EMPTY_MODULES } from "@/lib/roster";
import type { RosterEntry, RosterPermission } from "@/lib/types";

const PERMISSION_OPTIONS: { value: RosterPermission; label: string }[] = [
  { value: "Owner", label: "Owner" },
  { value: "Trusted", label: "Trusted" },
  { value: "Look & feel", label: "Look & feel" },
  { value: "Staff", label: "Staff — estimates only" },
];

export function ManageUsersDesk() {
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [permission, setPermission] = useState<RosterPermission>("Staff");
  const [expires, setExpires] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [open, setOpen] = useState({ fresh: true, add: true, roster: true });

  async function load() {
    const response = await fetch("/api/desk/roster", { credentials: "include", cache: "no-store" });
    const data = await response.json();
    if (response.ok) setRoster(data.roster ?? []);
  }

  useEffect(() => {
    load();
  }, []);

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
      body: JSON.stringify({
        name,
        username,
        email,
        permission,
        expires,
        modules: EMPTY_MODULES,
        estimate: true,
        rateBuilder: permission !== "Look & feel",
        passwordSet: true,
      }),
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
    setNote("Added to the visual roster. No invite sent.");
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
      <Collapsible
        title="Fresh accounts"
        open={open.fresh}
        onToggle={() => setOpen((current) => ({ ...current, fresh: !current.fresh }))}
      >
        <p className="text-sm text-[#5b6f73]">Your view only. Testers never see this.</p>
        <p className="mt-3 text-sm leading-6 text-[#163038]">
          Issued passwords are gone. Each person opens the live link, checks confidentiality, and
          creates their own email + password. They show up on this roster after they get in. You can
          still remove someone.
        </p>
        <button type="button" onClick={removeAll} className="mt-4 rounded-lg border border-[#d5e0de] px-4 py-2 text-[#b74120]">
          Remove all testers
        </button>
      </Collapsible>

      <Collapsible
        title="Add a user"
        open={open.add}
        onToggle={() => setOpen((current) => ({ ...current, add: !current.add }))}
      >
        <form onSubmit={onAdd} className="mt-1 grid gap-3 sm:grid-cols-2">
          <Field label="NAME" value={name} onChange={setName} required />
          <Field label="USERNAME" value={username} onChange={setUsername} />
          <Field label="EMAIL" value={email} onChange={setEmail} required type="email" placeholder="Where the invite will go" />
          <label>
            <span className="text-xs tracking-[0.14em] text-[#5b6f73]">PASSWORD</span>
            <span className="relative mt-1 block">
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="paper-field pr-12"
                minLength={8}
              />
              <button
                type="button"
                onClick={() => setShowPassword((on) => !on)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[#5b6f73]"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "hide" : "show"}
              </button>
            </span>
          </label>
          <label>
            <span className="text-xs tracking-[0.14em] text-[#5b6f73]">PERMISSION</span>
            <select
              value={permission}
              onChange={(event) => setPermission(event.target.value as RosterPermission)}
              className="paper-field mt-1"
            >
              {PERMISSION_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="text-xs tracking-[0.14em] text-[#5b6f73]">EXPIRES (OPTIONAL)</span>
            <input type="date" value={expires} onChange={(event) => setExpires(event.target.value)} className="paper-field mt-1" />
          </label>
          <button type="submit" className="rounded-lg bg-steel px-4 py-2 text-white sm:col-span-2">
            Add user
          </button>
        </form>
        {note ? <p className="mt-3 text-sm text-[#5b6f73]">{note}</p> : null}
      </Collapsible>

      <Collapsible
        title="Roster"
        open={open.roster}
        onToggle={() => setOpen((current) => ({ ...current, roster: !current.roster }))}
      >
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs tracking-[0.12em] text-[#5b6f73]">
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
                    Empty. The seven field testers are not seeded.
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
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Collapsible>
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
  onToggle: () => void;
  children: React.ReactNode;
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label>
      <span className="text-xs tracking-[0.14em] text-[#5b6f73]">{label}</span>
      <input
        required={required}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="paper-field mt-1"
      />
    </label>
  );
}
