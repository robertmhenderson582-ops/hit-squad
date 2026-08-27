"use client";

import { useEffect, useState } from "react";
import type { HandoffSeat } from "@/lib/handoff";

export function HandoffDialog({
  title,
  open,
  onClose,
  onPick,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  onPick: (person: HandoffSeat) => Promise<string | null>;
}) {
  const [people, setPeople] = useState<HandoffSeat[]>([]);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setEmail("");
    setError(null);
    let cancelled = false;
    (async () => {
      const response = await fetch("/api/desk/handoff", { credentials: "include", cache: "no-store" });
      const data = (await response.json()) as { people?: HandoffSeat[]; error?: string };
      if (cancelled) return;
      if (!response.ok) {
        setError(data.error || "Could not load the desk list.");
        return;
      }
      setPeople(Array.isArray(data.people) ? data.people : []);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;
  const selected = people.find((row) => row.email === email);

  return (
    <div className="modal-scrim" role="dialog" aria-modal="true">
      <div className="estimate-modal px-6 py-5">
        <h2 className="font-display text-2xl text-[#163038]">Turn over</h2>
        <p className="mt-2 text-sm text-[#5b6f73]">
          {title} leaves this Jobs list and opens on the person you pick. They can finish it. You
          keep a Transferred note here.
        </p>
        <label className="mt-4 block text-sm">
          Person
          <select
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="paper-field mt-1"
          >
            <option value="">Select a person</option>
            {people.map((row) => (
              <option key={row.email} value={row.email}>
                {row.name}
              </option>
            ))}
          </select>
        </label>
        {error ? <p className="mt-3 text-sm text-amber-flare">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-steel px-4 py-2 text-steel">
            Cancel
          </button>
          <button
            type="button"
            disabled={!selected || busy}
            onClick={async () => {
              if (!selected) return;
              setBusy(true);
              const nextError = await onPick(selected);
              setBusy(false);
              if (nextError) {
                setError(nextError);
                return;
              }
              onClose();
            }}
            className="rounded-lg bg-steel px-4 py-2 text-white disabled:opacity-40"
          >
            {busy ? "Turning over…" : "Turn over"}
          </button>
        </div>
      </div>
    </div>
  );
}
