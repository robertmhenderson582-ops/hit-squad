"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { CaptureMarkup } from "@/components/CaptureMarkup";
import { compressCapture, shootViewport } from "@/lib/capture";
import { mergeTickets, readTicketCache, rememberTicket, writeTicketCache } from "@/lib/ticket-cache";
import { makeTicket, TICKET_DRAFT_KEY, TICKET_KINDS, type DeskTicket, type TicketKind } from "@/lib/tickets";
import { unlockInboxAudio } from "@/lib/chime";
import { noteFeatureTrail } from "@/components/FeatureTrail";
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
    const parsed = JSON.parse(raw) as Partial<Draft>;
    return {
      ...EMPTY_DRAFT,
      ...parsed,
      kind: TICKET_KINDS.includes(parsed.kind as TicketKind) ? (parsed.kind as TicketKind) : "Broke",
    };
  } catch {
    return EMPTY_DRAFT;
  }
}

function hasStoredDraft(draft: Draft) {
  return Boolean(draft.note.trim() || draft.capture);
}

function announceTicketsChanged() {
  window.dispatchEvent(new Event("hs-tickets-changed"));
}

export function DeskFabs() {
  const { status, user } = useSession();
  const desk = useOwnerDesk();
  const inbox = useInbox();
  const [ticketOpen, setTicketOpen] = useState(false);
  const [hiddenForShot, setHiddenForShot] = useState(false);
  const [markupSrc, setMarkupSrc] = useState<string | null>(null);
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

  useEffect(() => {
    if (!ticketOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !markupSrc && !hiddenForShot) {
        setTicketOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hiddenForShot, markupSrc, ticketOpen]);

  if (status !== "authenticated" || !user) return null;
  const email = user.email;

  function persist(next: Draft) {
    setDraft(next);
    window.localStorage.setItem(TICKET_DRAFT_KEY, JSON.stringify(next));
  }

  function closeTicket() {
    persist(draft);
    setSavedDraft(hasStoredDraft(draft));
    setTicketOpen(false);
  }

  async function submit() {
    const capture = draft.capture ? await compressCapture(draft.capture) : null;
    const filed = makeTicket({
      kind: draft.kind,
      note: draft.note,
      capture,
      later: false,
      who: email,
    });
    rememberTicket(email, filed);
    announceTicketsChanged();
    window.localStorage.removeItem(TICKET_DRAFT_KEY);
    setDraft(EMPTY_DRAFT);
    setSavedDraft(false);
    setTicketOpen(false);
    setNote("Saved to Tickets. Not Inbox.");
    noteFeatureTrail("ticket");

    try {
      const response = await fetch("/api/desk/tickets", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: filed.id,
          kind: filed.kind,
          note: filed.note,
          capture: filed.capture,
          later: false,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setNote("Saved on this device. Tickets list has it.");
        return;
      }
      const serverTicket = data.ticket as DeskTicket | undefined;
      const serverList = (data.tickets ?? []) as DeskTicket[];
      writeTicketCache(
        email,
        mergeTickets(serverList, [serverTicket ?? filed, ...readTicketCache(email)]),
      );
      announceTicketsChanged();
    } catch {
      setNote("Saved on this device. Tickets list has it.");
    }
  }

  async function capture() {
    setHiddenForShot(true);
    setMarkupSrc(null);
    await new Promise((resolve) => window.setTimeout(resolve, 280));
    try {
      const shot = await Promise.race([
        shootViewport(),
        new Promise<string>((resolve) => window.setTimeout(() => resolve(""), 20000)),
      ]);
      if (!shot) {
        setNote("Capture could not grab the desk. Try again.");
        return;
      }
      const compact = await compressCapture(shot);
      setMarkupSrc(compact);
    } finally {
      setHiddenForShot(false);
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

  const showTicket = ticketOpen && !markupSrc;

  return (
    <>
    <div className={`desk-fabs print-hide ${hiddenForShot || markupSrc ? "hs-fabs-quiet" : ""}`}>
      {inbox.toast ? <div className="inbox-toast">{inbox.toast}</div> : null}
      {note && !showTicket && !markupSrc ? <p className="fab-note">{note}</p> : null}

      {inbox.open ? (
        <section className="inbox-card" role="dialog" aria-label="Inbox" data-capture="ignore">
          <div className="flex justify-end">
            <button type="button" onClick={inbox.closeInbox} className="text-[#5b6f73]" aria-label="Close inbox">
              ×
            </button>
          </div>
          <InboxPanel compact />
        </section>
      ) : null}

      {showTicket ? (
        <div
          className="ticket-scrim"
          role="presentation"
          onClick={() => {
            if (hiddenForShot || markupSrc) return;
            closeTicket();
          }}
        />
      ) : null}

      {showTicket ? (
        <section
          className="ticket-card"
          role="dialog"
          aria-label="Send a ticket"
          style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3">
            <div
              className="ticket-drag min-w-0 flex-1"
              onPointerDown={onDragStart}
              onPointerMove={onDrag}
              onPointerUp={() => {
                drag.current = null;
              }}
            >
              Send a ticket
            </div>
            <button type="button" onClick={closeTicket} className="text-xl leading-none text-[#5b6f73]" aria-label="Close ticket">
              ×
            </button>
          </div>
          <fieldset className="mt-3">
            <legend className="text-xs tracking-[0.14em] text-[#5b6f73]">KIND</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {TICKET_KINDS.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  aria-pressed={draft.kind === kind}
                  onClick={() => persist({ ...draft, kind })}
                  className={`rounded-full px-3 py-1.5 text-sm ${
                    draft.kind === kind ? "bg-steel text-white" : "border border-steel text-steel"
                  }`}
                >
                  {kind}
                </button>
              ))}
            </div>
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
            <button type="button" onClick={() => void capture()} className="rounded-lg border border-steel px-3 py-2 text-sm text-steel">
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
        data-capture="ignore"
      >
        Inbox
        {inbox.unread > 0 ? <span className="inbox-count">{inbox.unread}</span> : null}
      </button>
      <button
        type="button"
        onClick={() => {
          if (ticketOpen) closeTicket();
          else setTicketOpen(true);
        }}
        className="ticket-fab"
        data-capture="ignore"
      >
        {savedDraft ? "Draft" : "+ Ticket"}
      </button>
    </div>
    {markupSrc ? (
      <CaptureMarkup
        src={markupSrc}
        onDone={(marked) => {
          persist({ ...draft, capture: marked });
          setMarkupSrc(null);
          setTicketOpen(true);
          setNote("Capture attached. Capture stays off Inbox.");
        }}
        onCancel={() => {
          persist({ ...draft, capture: markupSrc });
          setMarkupSrc(null);
          setTicketOpen(true);
          setNote("Capture attached. Capture stays off Inbox.");
        }}
      />
    ) : null}
    </>
  );
}
