"use client";

import { useEffect, useState } from "react";
import { deskFetch } from "@/lib/estimate-vault-client";
import type { HandoffSeat } from "@/lib/handoff";

export function HandoffDialog({
  title,
  open,
  onClose,
  onPick,
  heading = "Turn over",
  body,
  confirmLabel = "Turn over",
  busyLabel = "Turning over…",
  people: peopleProp,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  onPick: (person: HandoffSeat) => Promise<string | null>;
  heading?: string;
  body?: string;
  confirmLabel?: string;
  busyLabel?: string;
  people?: HandoffSeat[];
}) {
  const [people, setPeople] = useState<HandoffSeat[]>(peopleProp ?? []);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const presetKey = peopleProp?.map((row) => row.email).join(",") ?? "";

  useEffect(() => {
    if (!open) return;
    setEmail("");
    setError(null);
    if (peopleProp) {
      setPeople(peopleProp);
      return;
    }
    let cancelled = false;
    (async () => {
      const response = await deskFetch("/api/desk/handoff");
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
  }, [open, presetKey]);

  if (!open) return null;
  const selected = people.find((row) => row.email === email);

  return (
    <div className="modal-scrim" role="dialog" aria-modal="true">
      <div className="estimate-modal px-6 py-5">
        <h2 className="font-display text-2xl text-[#163038]">{heading}</h2>
        <p className="mt-2 text-sm text-[#5b6f73]">
          {body ||
            `${title} leaves this Jobs list and opens on the person you pick. They can finish it. You keep a Transferred note here.`}
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
        {error ? (
          <p
            role="alert"
            className="mt-3 rounded-lg border-2 border-[#8b1e1e] bg-[#8b1e1e] px-3 py-2 text-sm font-semibold text-white"
          >
            {error}
          </p>
        ) : null}
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
              setError(null);
              try {
                const nextError = await onPick(selected);
                if (nextError) {
                  setError(nextError);
                  return;
                }
                onClose();
              } catch {
                setError(`Could not ${confirmLabel.toLowerCase()} that job.`);
              } finally {
                setBusy(false);
              }
            }}
            className="rounded-lg bg-steel px-4 py-2 text-white disabled:opacity-40"
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
