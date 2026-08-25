"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { shootViewport } from "@/lib/capture";
import { TICKET_DRAFT_KEY, TICKET_KINDS, type TicketKind } from "@/lib/tickets";
import { unlockInboxAudio } from "@/lib/chime";
import { InboxPanel } from "@/components/InboxPanel";
import { useInbox } from "@/components/InboxProvider";
import { useOwnerDesk } from "@/components/OwnerDeskContext";
import { useSession } from "@/components/SessionProvider";

type Draft = {
  kind: TicketKind;
  note: string;
  capture: string | null;
};

const EMPTY_DRAFT: Draft = { kind: "Broke", note: "", capture: null };

function readDraft(): Draft {
  try {
    const raw = window.localStorage.getItem(TICKET_DRAFT_KEY);
    if (!raw) return EMPTY_DRAFT;
    return { ...EMPTY_DRAFT, ...(JSON.parse(raw) as Partial<Draft>) };
  } catch {
    return EMPTY_DRAFT;
  }
}

function hasStoredDraft(draft: Draft) {
  return Boolean(draft.note.trim() || draft.capture);
}

export function DeskFabs() {
  const { status, user } = useSession();
  const desk = useOwnerDesk();
  const inbox = useInbox();
  const [ticketOpen, setTicketOpen] = useState(false);
  const [hiddenForShot, setHiddenForShot] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [savedDraft, setSavedDraft] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef<{ ox: number; oy: number; sx: number; sy: number } | null>(null);
  const joseph = desk?.viewAs === "joseph" || user?.name === "Joseph Henderson";

  useEffect(() => {
    if (status === "authenticated") {
      const next = readDraft();
      setDraft(next);
      setSavedDraft(hasStoredDraft(next));
    }
  }, [status]);

  if (status !== "authenticated" || !user) return null;

  function persist(next: Draft) {
    setDraft(next);
    window.localStorage.setItem(TICKET_DRAFT_KEY, JSON.stringify(next));
  }

  async function submit() {
    const response = await fetch("/api/desk/tickets", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...draft, later: false }),
    });
    const data = await response.json();
    if (!response.ok) {
      setNote(data.error || "Could not save ticket.");
      return;
    }
    window.localStorage.removeItem(TICKET_DRAFT_KEY);
    setDraft(EMPTY_DRAFT);
    setSavedDraft(false);
    setTicketOpen(false);
    setNote("Saved to Tickets. Not Inbox.");
  }

  async function capture() {
    setHiddenForShot(true);
    setTicketOpen(false);
    await new Promise((resolve) => window.setTimeout(resolve, 80));
    try {
      const shot = await Promise.race([
        shootViewport(),
        new Promise<string>((resolve) => window.setTimeout(() => resolve(""), 2500)),
      ]);
      if (shot) persist({ ...draft, capture: shot });
      setNote(shot ? "Capture attached. Capture stays off Inbox." : "Capture finished. Ticket is back.");
    } finally {
      setHiddenForShot(false);
      setTicketOpen(true);
    }
  }

  function onDragStart(event: PointerEvent<HTMLDivElement>) {
    drag.current = { ox: event.clientX, oy: event.clientY, sx: pos.x, sy: pos.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onDrag(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    setPos({
      x: drag.current.sx + event.clientX - drag.current.ox,
      y: drag.current.sy + event.clientY - drag.current.oy,
    });
  }

  const showTicket = ticketOpen && !hiddenForShot;

  return (
    <div className="desk-fabs print-hide">
      {inbox.toast ? <div className="inbox-toast">{inbox.toast}</div> : null}
      {note && !showTicket ? <p className="fab-note">{note}</p> : null}

      {inbox.open ? (
        <section className="inbox-card" role="dialog" aria-label="Inbox">
          <div className="flex justify-end">
            <button type="button" onClick={inbox.closeInbox} className="text-[#5b6f73]" aria-label="Close inbox">
              ×
            </button>
          </div>
          <InboxPanel compact />
        </section>
      ) : null}

      {showTicket ? <div className="ticket-scrim" aria-hidden="true" /> : null}

      {showTicket ? (
        <section
          className="ticket-card"
          role="dialog"
          aria-label="Send a ticket"
          style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
        >
          <div
            className="ticket-drag"
            onPointerDown={onDragStart}
            onPointerMove={onDrag}
            onPointerUp={() => {
              drag.current = null;
            }}
          >
            Send a ticket
          </div>
          <fieldset className="mt-3 space-y-2">
            <legend className="text-xs tracking-[0.14em] text-[#5b6f73]">KIND</legend>
            {TICKET_KINDS.map((kind) => (
              <label key={kind} className="flex items-center gap-2 text-sm font-medium text-[#163038]">
                <input
                  type="radio"
                  name="ticket-kind"
                  checked={draft.kind === kind}
                  onChange={() => persist({ ...draft, kind })}
                />
                {kind}
              </label>
            ))}
          </fieldset>
          <textarea
            value={draft.note}
            onChange={(event) => persist({ ...draft, note: event.target.value })}
            rows={4}
            className="paper-field mt-3"
            placeholder="What happened"
          />
          {draft.capture ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={draft.capture} alt="Capture" className="mt-3 max-h-28 rounded border border-[#d5e0de]" />
          ) : null}
          {note ? <p className="mt-2 text-xs text-[#5b6f73]">{note}</p> : null}
          {joseph ? (
            <p className="mt-2 text-xs text-[#5b6f73]">
              Submit emails robertmhenderson582@gmail.com. Mail is not sent from this trial.
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={capture} className="rounded-lg border border-steel px-3 py-2 text-sm text-steel">
              Capture screen
            </button>
            <button
              type="button"
              onClick={() => {
                persist(draft);
                setSavedDraft(true);
                setNote("Draft saved on this device.");
              }}
              className="rounded-lg border border-steel px-3 py-2 text-sm text-steel"
            >
              {savedDraft ? "Draft" : "Save for later"}
            </button>
            <button type="button" onClick={() => void submit()} className="rounded-lg bg-steel px-3 py-2 text-sm text-white">
              Submit
            </button>
          </div>
          <Link href="/tickets" className="mt-3 inline-block text-sm text-steel underline">
            Tickets list
          </Link>
        </section>
      ) : null}

      <button
        type="button"
        onClick={() => {
          unlockInboxAudio();
          if (inbox.open) inbox.closeInbox();
          else inbox.openInbox();
        }}
        className={`inbox-fab ${inbox.unread > 0 ? "inbox-fab-pulse" : ""}`}
      >
        Inbox
        {inbox.unread > 0 ? <span className="inbox-count">{inbox.unread}</span> : null}
      </button>
      <button type="button" onClick={() => setTicketOpen((open) => !open)} className="ticket-fab">
        {savedDraft ? "Draft" : "+ Ticket"}
      </button>
    </div>
  );
}
