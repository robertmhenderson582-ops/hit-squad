"use client";

import { FormEvent, useEffect, useState } from "react";
import { PasswordField } from "@/components/PasswordField";
import { PresencePulse } from "@/components/PresencePulse";
import { useSession } from "@/components/SessionProvider";
import { isOwner } from "@/lib/desk-role";
import type { PublicUser, RosterEntry, RosterPermission } from "@/lib/types";

const PERMISSION_OPTIONS: { value: Exclude<RosterPermission, "Owner">; label: string }[] = [
  { value: "Trusted", label: "Trusted" },
  { value: "Look & feel", label: "Look & feel" },
  { value: "Staff", label: "Staff — estimates only" },
];

type SeatRow = PublicUser & { passwordIssued: boolean; added?: boolean; permission?: string };

export function ManageUsersDesk() {
  const { user } = useSession();
  const owner = isOwner(user);
  const [seats, setSeats] = useState<SeatRow[]>([]);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [issueEmail, setIssueEmail] = useState("");
  const [issuePassword, setIssuePassword] = useState("");
  const [permission, setPermission] = useState<Exclude<RosterPermission, "Owner">>("Staff");
  const [expires, setExpires] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [seatNote, setSeatNote] = useState<string | null>(null);
  const [inviteText, setInviteText] = useState<string | null>(null);
  const [open, setOpen] = useState({ seats: true, add: true, roster: true });

  async function loadSeats() {
    const response = await fetch("/api/desk/seats", { credentials: "include", cache: "no-store" });
    const data = await response.json();
    if (response.ok) {
      const nextSeats = (data.seats ?? []) as SeatRow[];
      setSeats(nextSeats);
      if (data.roster) setRoster(data.roster);
      setIssueEmail((current) => current || nextSeats.find((row) => row.role !== "owner")?.email || "");
    }
  }

  useEffect(() => {
    void loadSeats();
  }, []);

  async function onIssue(event: FormEvent) {
    event.preventDefault();
    setSeatNote(null);
    setInviteText(null);
    const response = await fetch("/api/desk/seats", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: issueEmail, password: issuePassword }),
    });
    const data = await response.json();
    setIssuePassword("");
    if (!response.ok) {
      setSeatNote(data.error || "Could not issue.");
      return;
    }
    setSeats(data.seats ?? []);
    if (data.roster) setRoster(data.roster);
    setSeatNote("Password issued on this desk. Don’t send. First sign-in must change it.");
  }

  async function onResend(target: string) {
    setSeatNote(null);
    setInviteText(null);
    const response = await fetch("/api/desk/seats", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: target, resendInvite: true }),
    });
    const data = await response.json();
    if (!response.ok) {
      setSeatNote(data.error || "Could not resend.");
      return;
    }
    setSeatNote(data.note || "Invite sent again.");
    if (!data.inviteSent && data.inviteText) setInviteText(data.inviteText);
  }

  async function onAdd(event: FormEvent) {
    event.preventDefault();
    setNote(null);
    setInviteText(null);
    const response = await fetch("/api/desk/seats", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        username,
        email,
        permission,
        expires,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      setNote(data.error || "Could not add.");
      return;
    }
    setSeats(data.seats ?? []);
    setRoster(data.roster ?? []);
    setName("");
    setUsername("");
    setEmail("");
    setExpires("");
    setNote(data.note || "Login created.");
    if (!data.inviteSent && data.inviteText) setInviteText(data.inviteText);
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
          this list, Novus, or each other. Issue a one-time password here for a seat that already
          exists. Don’t send. Adding a user below creates a login and sends the first-visit invite —
          they create their own sign-in.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs tracking-[0.12em] text-[#5b6f73]">
              <tr>
                {["NAME", "EMAIL", "ROLE", "PASSWORD", ""].map((header) => (
                  <th key={header || "action"} className="px-2 py-2">
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
                    {row.role === "owner" ? "Owner" : row.role === "operator" ? "Operator" : "Tester"}
                  </td>
                  <td className="px-2 py-2">
                    {row.role === "owner"
                      ? "Owner password"
                      : row.passwordIssued
                        ? "Issued — first sign-in must change"
                        : "Not issued"}
                  </td>
                  <td className="px-2 py-2">
                    {owner && row.role === "tester" && !row.passwordIssued ? (
                      <button
                        type="button"
                        onClick={() => void onResend(row.email)}
                        className="text-sm text-steel underline"
                      >
                        Resend invite
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {owner ? (
          <form onSubmit={onIssue} className="mt-4 grid gap-3 sm:grid-cols-2">
            <label>
              <span className="text-xs tracking-[0.14em] text-[#5b6f73]">SEAT</span>
              <select
                value={issueEmail}
                onChange={(event) => setIssueEmail(event.target.value)}
                className="paper-field mt-1"
              >
                {seats
                  .filter((row) => row.role !== "owner")
                  .map((row) => (
                    <option key={row.id} value={row.email}>
                      {row.name} · {row.email}
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
          </form>
        ) : (
          <p className="mt-4 text-sm text-[#5b6f73]">Only the owner can issue this password.</p>
        )}
        {seatNote ? <p className="mt-3 text-sm text-[#5b6f73]">{seatNote}</p> : null}
        {inviteText ? (
          <label className="mt-3 block">
            <span className="text-xs tracking-[0.14em] text-[#5b6f73]">INVITE TO COPY</span>
            <textarea
              readOnly
              value={inviteText}
              className="paper-field mt-1 min-h-40 font-mono text-sm"
            />
          </label>
        ) : null}
      </Collapsible>

      {owner ? (
        <>
          <Collapsible
            title="Add user"
            open={open.add}
            onToggle={() => setOpen((current) => ({ ...current, add: !current.add }))}
          >
            <p className="text-sm leading-6 text-[#5b6f73]">
              Creates a real login and sends the first-visit invite. They hard-refresh the login
              page, check confidentiality, and create their own sign-in (8+). No password is issued
              here.
            </p>
            <form onSubmit={onAdd} className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="NAME" value={name} onChange={setName} required />
              <Field label="USERNAME" value={username} onChange={setUsername} />
              <Field label="EMAIL" value={email} onChange={setEmail} required type="email" />
              <label>
                <span className="text-xs tracking-[0.14em] text-[#5b6f73]">PERMISSION</span>
                <select
                  value={permission}
                  onChange={(event) => setPermission(event.target.value as Exclude<RosterPermission, "Owner">)}
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
            {inviteText ? (
              <label className="mt-3 block">
                <span className="text-xs tracking-[0.14em] text-[#5b6f73]">INVITE TO COPY</span>
                <textarea
                  readOnly
                  value={inviteText}
                  className="paper-field mt-1 min-h-40 font-mono text-sm"
                />
              </label>
            ) : null}
          </Collapsible>

          <Collapsible
            title="Added testers"
            open={open.roster}
            onToggle={() => setOpen((current) => ({ ...current, roster: !current.roster }))}
          >
            <p className="text-sm leading-6 text-[#5b6f73]">
              People added from this form. The built-in ten stay in Operator seats. Testers never
              see this list.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs tracking-[0.12em] text-[#5b6f73]">
                  <tr>
                    {["NAME", "USERNAME", "EMAIL", "PERMISSION", "EXPIRES", "SIGN-IN"].map((header) => (
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
                        No added testers yet. The built-in ten are in Operator seats. Novus is not a
                        tester.
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
