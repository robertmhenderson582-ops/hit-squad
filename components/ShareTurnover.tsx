"use client";

import { useState } from "react";
import { VISUAL_ROSTER } from "@/lib/owner-desk";

export function ShareTurnover({ title }: { title?: string }) {
  const [open, setOpen] = useState<"share" | "turnover" | null>(null);
  const [person, setPerson] = useState("");
  const [keepShared, setKeepShared] = useState(true);
  const [note, setNote] = useState<string | null>(null);

  return (
    <>
      <button type="button" onClick={() => setOpen("share")} className="rounded border border-white/20 px-3 py-1.5 text-white/90">
        Share
      </button>
      <button type="button" onClick={() => setOpen("turnover")} className="rounded border border-white/20 px-3 py-1.5 text-white/90">
        Turn over
      </button>
      {open ? (
        <div className="modal-scrim" role="dialog" aria-modal="true">
          <div className="estimate-modal px-6 py-5">
            {open === "share" ? (
              <>
                <h2 className="font-display text-2xl text-[#163038]">Share with Madison</h2>
                <p className="mt-2 text-sm text-[#5b6f73]">
                  Look only. Owner stays owner. {title || "This job"} stays on this desk. No email.
                </p>
                <div className="mt-5 flex justify-end gap-3">
                  <button type="button" onClick={() => setOpen(null)} className="rounded-lg border border-steel px-4 py-2 text-steel">
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNote("Shared with Madison. Owner stays owner.");
                      setOpen(null);
                    }}
                    className="rounded-lg bg-steel px-4 py-2 text-white"
                  >
                    Share
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="font-display text-2xl text-[#163038]">Turn over</h2>
                <p className="mt-2 text-sm text-[#5b6f73]">
                  Pick a person. The job becomes theirs. Owner still sees it. Inbox note is a
                  placeholder. No email and no login required.
                </p>
                <label className="mt-4 block text-sm">
                  Person
                  <select value={person} onChange={(event) => setPerson(event.target.value)} className="paper-field mt-1">
                    <option value="">Select a person</option>
                    {VISUAL_ROSTER.map((row) => (
                      <option key={row.id} value={row.name}>
                        {row.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="mt-3 flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={keepShared} onChange={(event) => setKeepShared(event.target.checked)} />
                  Keep shared
                </label>
                <div className="mt-5 flex justify-end gap-3">
                  <button type="button" onClick={() => setOpen(null)} className="rounded-lg border border-steel px-4 py-2 text-steel">
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!person}
                    onClick={() => {
                      setNote(`Turned over to ${person}. Owner still sees it.${keepShared ? " Kept shared." : ""} Inbox note placeholder.`);
                      setOpen(null);
                    }}
                    className="rounded-lg bg-steel px-4 py-2 text-white disabled:opacity-40"
                  >
                    Turn over
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
      {note ? <p className="max-w-xs text-[11px] text-white/70">{note}</p> : null}
    </>
  );
}
