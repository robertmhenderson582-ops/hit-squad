"use client";

import { useEffect, useState } from "react";
import type { RepublishState, RepublishWait } from "@/lib/owner-desk";

const WAITS: { value: RepublishWait; label: string }[] = [
  { value: 0, label: "Immediate" },
  { value: 5, label: "5 minutes" },
  { value: 10, label: "10 minutes" },
  { value: 15, label: "15 minutes" },
];

export function RepublishDesk() {
  const [state, setState] = useState<RepublishState | null>(null);
  const [wait, setWait] = useState<RepublishWait>(5);
  const [note, setNote] = useState("");

  async function load() {
    const response = await fetch("/api/desk/owner-settings", { credentials: "include", cache: "no-store" });
    const data = await response.json();
    setState(data.republish ?? null);
  }

  useEffect(() => {
    load();
  }, []);

  async function post(body: Record<string, unknown>) {
    const response = await fetch("/api/desk/owner-settings", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    setState(data.republish ?? null);
  }

  return (
    <section className="plant-card px-5 py-5">
      <h2 className="text-2xl font-semibold text-[#163038]">Heads up — republish</h2>
      <p className="mt-2 text-sm text-[#5b6f73]">
        Look only. This does not take the live site down. Immediate / 5 / 10 / 15 puts a sticky
        banner and countdown on testers. Immediate locks testers; owner stays in. Inbox notice goes
        to people signed in right now, not the whole roster. A new build clears an old Wait.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {WAITS.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setWait(item.value)}
            className={`rounded-lg px-4 py-2 text-sm ${wait === item.value ? "bg-steel text-white" : "border border-steel text-steel"}`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <label className="mt-4 block">
        Optional note
        <input value={note} onChange={(event) => setNote(event.target.value)} className="paper-field mt-1" />
      </label>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => post({ action: "republish", waitMinutes: wait, note })}
          className="rounded-lg bg-steel px-4 py-2 text-white"
        >
          Give heads up
        </button>
        <button
          type="button"
          onClick={() => post({ action: "republish", waitMinutes: 0, note })}
          className="rounded-lg border border-[#b74120] px-4 py-2 text-[#b74120]"
        >
          Shut down now
        </button>
        <button type="button" onClick={() => post({ action: "back" })} className="rounded-lg border border-steel px-4 py-2 text-steel">
          We&apos;re back
        </button>
      </div>
      {state?.active ? (
        <p className="mt-4 text-sm text-[#163038]">
          {state.waitMinutes === 0
            ? "Immediate chrome. Testers lock. Owner stays in. The live site is still up."
            : `Banner up. Save. Comes down in ${state.waitMinutes} minutes.`}
          {state.note ? ` ${state.note}` : ""}
        </p>
      ) : (
        <p className="mt-4 text-sm text-[#5b6f73]">No Wait on this build.</p>
      )}
    </section>
  );
}
