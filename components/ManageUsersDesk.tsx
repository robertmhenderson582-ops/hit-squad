"use client";

import { FormEvent, useEffect, useState } from "react";
import { PasswordField } from "@/components/PasswordField";
import { PresencePulse } from "@/components/PresencePulse";
import { useOwnerDesk } from "@/components/OwnerDeskContext";
import { useSession } from "@/components/SessionProvider";
import { canUseFollow, isOwner, NOVUS_EMAIL } from "@/lib/desk-role";
import { followLandPath, followSeatFromEmail } from "@/lib/follow";
import { EMPTY_MODULES } from "@/lib/roster";
import type { PublicUser, RosterEntry, RosterPermission } from "@/lib/types";

const PERMISSION_OPTIONS: { value: RosterPermission; label: string }[] = [
  { value: "Owner", label: "Owner" },
  { value: "Trusted", label: "Trusted" },
  { value: "Look & feel", label: "Look & feel" },
  { value: "Staff", label: "Staff — estimates only" },
];

type SeatRow = PublicUser & { passwordIssued: boolean };

type LiveSeat = { email: string; path: string };

export function ManageUsersDesk() {
  const { user } = useSession();
  const desk = useOwnerDesk();
  const owner = isOwner(user);
  const followOk = canUseFollow(user);
  const [seats, setSeats] = useState<SeatRow[]>([]);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [liveSeats, setLiveSeats] = useState<LiveSeat[]>([]);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [issueEmail, setIssueEmail] = useState(NOVUS_EMAIL);
  const [issuePassword, setIssuePassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [permission, setPermission] = useState<RosterPermission>("Staff");
  const [expires, setExpires] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [seatNote, setSeatNote] = useState<string | null>(null);
  const [open, setOpen] = useState({ seats: true, add: true, roster: true });

  async function loadSeats() {
    const response = await fetch("/api/desk/seats", { credentials: "include", cache: "no-store" });
    const data = await response.json();
    if (response.ok) setSeats(data.seats ?? []);
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

  function followEmail(email: string) {
    const seat = followSeatFromEmail(email);
    if (!seat || !desk || !followOk) return;
    const ping = liveSeats.find((row) => row.email.toLowerCase() === email.trim().toLowerCase());
    const land = followLandPath(ping?.path ?? "/");
    desk.setFollowSeat(seat);
    window.location.assign(land);
  }

  async function onIssue(event: FormEvent) {
    event.preventDefault();
    setSeatNote(null);
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
    setSeatNote("Password issued on this desk. Don’t send. First sign-in must change it.");
  }

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
    setNote("Added to the visual roster. No login and no invite sent.");
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
          this list, Novus, or each other. Issue a one-time password here. Don’t send. They change it
          on first sign-in. No invite email.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs tracking-[0.12em] text-[#5b6f73]">
              <tr>
                {["NAME", "EMAIL", "ROLE", "PASSWORD", followOk ? "FOLLOW" : ""].filter(Boolean).map((header) => (
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
                    {row.role === "owner" ? "Owner" : row.role === "operator" ? "Operator" : "Tester"}
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
                      {followSeatFromEmail(row.email) && row.email.toLowerCase() !== NOVUS_EMAIL ? (
                        <button
                          type="button"
                          onClick={() => followEmail(row.email)}
                          className={`rounded-lg px-3 py-1.5 text-sm ${
                            desk?.followSeat === followSeatFromEmail(row.email)
                              ? "bg-steel text-white"
                              : "border border-steel text-steel"
                          }`}
                        >
                          {desk?.followSeat === followSeatFromEmail(row.email) ? "Watching" : "Follow"}
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
      </Collapsible>

      {owner ? (
        <>
          <Collapsible
            title="Add a visual tester"
            open={open.add}
            onToggle={() => setOpen((current) => ({ ...current, add: !current.add }))}
          >
            <p className="text-sm leading-6 text-[#5b6f73]">
              Visual roster only. Does not create a login, send email, or open a claimable account.
              Logins are issued above. Don’t send.
            </p>
            <form onSubmit={onAdd} className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="NAME" value={name} onChange={setName} required />
              <Field label="USERNAME" value={username} onChange={setUsername} />
              <Field label="EMAIL" value={email} onChange={setEmail} required type="email" placeholder="Visual only — no invite" />
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
                Add visual row
              </button>
            </form>
            <button type="button" onClick={removeAll} className="mt-4 rounded-lg border border-[#d5e0de] px-4 py-2 text-[#b74120]">
              Clear visual roster
            </button>
            {note ? <p className="mt-3 text-sm text-[#5b6f73]">{note}</p> : null}
          </Collapsible>

          <Collapsible
            title="Visual roster"
            open={open.roster}
            onToggle={() => setOpen((current) => ({ ...current, roster: !current.roster }))}
          >
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
                        Empty visual book. Logins are the seeded seats above. Novus is not a tester.
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
                          {followSeatFromEmail(row.email) ? (
                            <button
                              type="button"
                              onClick={() => followEmail(row.email)}
                              className={`rounded-lg px-3 py-1.5 text-sm ${
                                desk?.followSeat === followSeatFromEmail(row.email)
                                  ? "bg-steel text-white"
                                  : "border border-steel text-steel"
                              }`}
                            >
                              {desk?.followSeat === followSeatFromEmail(row.email) ? "Watching" : "Follow"}
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
