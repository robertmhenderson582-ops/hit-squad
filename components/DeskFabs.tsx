"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { shootViewport } from "@/lib/capture";
import { TICKET_DRAFT_KEY, TICKET_KINDS, type TicketKind } from "@/lib/tickets";
import { useInbox } from "@/components/InboxProvider";
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

export function DeskFabs() {
  const { status, user } = useSession();
  const inbox = useInbox();
  const [ticketOpen, setTicketOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [note, setNote] = useState<string | null>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef<{ ox: number; oy: number; sx: number; sy: number } | null>(null);

  useEffect(() => {
    if (status === "authenticated") setDraft(readDraft());
  }, [status]);

  if (status !== "authenticated" || !user) return null;

  function persist(next: Draft) {
    setDraft(next);
    window.localStorage.setItem(TICKET_DRAFT_KEY, JSON.stringify(next));
  }

  async function submit(later: boolean) {
    const response = await fetch("/api/desk/tickets", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...draft, later }),
    });
    const data = await response.json();
    if (!response.ok) {
      setNote(data.error || "Could not save ticket.");
      return;
    }
    window.localStorage.removeItem(TICKET_DRAFT_KEY);
    setDraft(EMPTY_DRAFT);
    setTicketOpen(false);
    setNote(later ? "Saved to Tickets. Mail is not sent tonight." : "Saved to Tickets.");
  }

  async function capture() {
    setTicketOpen(false);
    const shot = await shootViewport();
    persist({ ...draft, capture: shot });
    setTicketOpen(true);
    setNote("Capture attached. Ticket stays off Inbox.");
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

  return (
    <div className="desk-fabs print-hide">
      {inbox.toast ? <div className="inbox-toast">{inbox.toast}</div> : null}
      {note && !ticketOpen ? <p className="fab-note">{note}</p> : null}

      {inbox.open ? (
        <section className="inbox-card" role="dialog" aria-label="Inbox">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold text-[#163038]">Inbox</h2>
              <p className="mt-1 text-sm text-[#5b6f73]">Testers do not see each other.</p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={inbox.startDraft} className="inbox-new">
                + New
              </button>
              <button type="button" onClick={inbox.closeInbox} className="text-[#5b6f73]" aria-label="Close inbox">
                ×
              </button>
            </div>
          </div>
          <div className="mt-6 space-y-5">
            {inbox.threads.length === 0 ? (
              <p className="text-sm text-[#5b6f73]">No threads on this seat.</p>
            ) : (
              inbox.threads.map((thread) => (
                <article key={thread.id}>
                  <p className="font-semibold text-[#163038]">{thread.name}</p>
                  <p className="text-sm text-[#5b6f73]">{thread.preview}</p>
                </article>
              ))
            )}
          </div>
          {inbox.draft ? (
            <p className="mt-5 text-sm text-[#5b6f73]">New thread stays on this desk. Testers never see each other.</p>
          ) : null}
        </section>
      ) : null}

      {ticketOpen ? (
        <section
          className="ticket-card"
          role="dialog"
          aria-label="Ticket"
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
            Ticket
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
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={capture} className="rounded-lg border border-steel px-3 py-2 text-sm text-steel">
              Capture
            </button>
            <button
              type="button"
              onClick={() => {
                persist(draft);
                setNote("Saved for later on this device.");
              }}
              className="rounded-lg border border-steel px-3 py-2 text-sm text-steel"
            >
              Save for later
            </button>
            <button type="button" onClick={() => submit(false)} className="rounded-lg bg-steel px-3 py-2 text-sm text-white">
              Submit
            </button>
            <button type="button" onClick={() => submit(true)} className="rounded-lg border border-steel px-3 py-2 text-sm text-steel">
              Submit later
            </button>
          </div>
          <Link href="/tickets" className="mt-3 inline-block text-sm text-steel underline">
            Tickets list
          </Link>
        </section>
      ) : null}

      <button
        type="button"
        onClick={inbox.open ? inbox.closeInbox : inbox.openInbox}
        className={`inbox-fab ${inbox.unread > 0 ? "inbox-fab-pulse" : ""}`}
      >
        Inbox
      </button>
      <button type="button" onClick={() => setTicketOpen((open) => !open)} className="ticket-fab">
        + Ticket
      </button>
    </div>
  );
}
