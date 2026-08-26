"use client";

import { FormEvent, useState } from "react";
import type { LockMinutes } from "@/lib/display";
import { useDisplay } from "@/components/DisplayProvider";
import { PasswordField } from "@/components/PasswordField";
import { useLensUser } from "@/components/OwnerDeskContext";
import { useSession } from "@/components/SessionProvider";
import { isOwner } from "@/lib/desk-role";

const OPTIONS: { value: LockMinutes; label: string; ownerOnly?: boolean }[] = [
  { value: 5, label: "5 minutes" },
  { value: 10, label: "10 minutes" },
  { value: 15, label: "15 minutes" },
  { value: 30, label: "30 minutes", ownerOnly: true },
  { value: 60, label: "1 hour", ownerOnly: true },
  { value: 0, label: "Don’t lock", ownerOnly: true },
];

export function SecurityDesk() {
  const { user } = useSession();
  const lens = useLensUser();
  const { prefs, setPrefs } = useDisplay();
  const owner = isOwner(lens);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    const response = await fetch("/api/desk/password", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current, next }),
    });
    const data = await response.json();
    setCurrent("");
    setNext("");
    setMessage(data.error || data.note || "Password updated on this desk process.");
  }

  return (
    <div className="space-y-5">
      <section className="plant-card px-5 py-5">
        <h2 className="text-2xl font-semibold text-[#163038]">Security</h2>
        <p className="mt-2 text-sm text-[#5b6f73]">
          Change password (current + new). Google/X accounts are not on this host so everyone with a
          password can change it.
        </p>
        <form onSubmit={onSubmit} className="mt-4 grid gap-3 sm:grid-cols-2">
          <PasswordField
            label="Current password"
            autoComplete="current-password"
            value={current}
            onChange={setCurrent}
          />
          <PasswordField
            label="New password"
            autoComplete="new-password"
            value={next}
            onChange={setNext}
            minLength={8}
          />
          <button type="submit" className="rounded-lg bg-steel px-4 py-2 text-white sm:col-span-2">
            Change password
          </button>
        </form>
        {message ? <p className="mt-3 text-sm text-[#5b6f73]">{message}</p> : null}
      </section>

      <section className="plant-card px-5 py-5">
        <h2 className="text-xl font-semibold text-[#163038]">Inactivity lock</h2>
        <p className="mt-2 text-sm text-[#5b6f73]">
          Default 15 minutes with no mouse, keyboard, or tap. One-minute warning: Stay signed in or
          Lock now. After lock: Session locked — sign in again. A stored “never lock” on a shared PC
          still times out at 15 when a staff user is signed in. Set the lock time here if 15 minutes
          is too tight for a long bid.
        </p>
        <div className="mt-4 space-y-2">
          {OPTIONS.map((item) => {
            const disabled = Boolean(item.ownerOnly && !owner);
            return (
              <label
                key={item.value}
                className={`flex items-center gap-3 rounded-lg border border-[#d5e0de] px-3 py-3 ${disabled ? "opacity-60" : ""}`}
              >
                <input
                  type="radio"
                  name="lock"
                  disabled={disabled}
                  checked={prefs.lockMinutes === item.value}
                  onChange={() => setPrefs({ lockMinutes: item.value })}
                />
                <span>
                  {item.label}
                  {disabled ? <span className="ml-2 text-xs text-[#5b6f73]">Desk owner only</span> : null}
                </span>
              </label>
            );
          })}
        </div>
      </section>
    </div>
  );
}
