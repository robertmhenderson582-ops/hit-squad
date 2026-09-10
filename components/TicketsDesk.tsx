"use client";

import { useCallback, useEffect, useState } from "react";
import { useConfirmRemove } from "@/components/ConfirmDialog";
import { PhotoViewer } from "@/components/PhotoViewer";
import { useDeskLens, useOwnerDesk } from "@/components/OwnerDeskContext";
import { useSession } from "@/components/SessionProvider";
import { deskFetch } from "@/lib/estimate-vault-client";
import { burnCaption } from "@/lib/capture";
import { buildDeskChrome } from "@/lib/desk-role";
import {
  TICKET_UNVAULTED_MARK,
  TICKETS_VAULT_WRITE_ERROR,
  hydrateTickets,
  ticketsVaultStored,
  type ListedTicket,
} from "@/lib/ticket-cache";
import { ticketCopyText, type DeskTicket } from "@/lib/tickets";

export function TicketsDesk() {
  const { user } = useSession();
  const desk = useOwnerDesk();
  const { lens, viewingAs } = useDeskLens();
  const confirmRemove = useConfirmRemove();
  const ownerChrome = buildDeskChrome(user, desk?.viewAs, desk?.followSeat);
  const [tickets, setTickets] = useState<ListedTicket[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<{ src: string; caption: string } | null>(null);
  const mine = user?.email || "";
  const viewer = viewingAs ? lens?.email || "" : mine;

  const refresh = useCallback(
    (server: DeskTicket[] = [], store?: string | null, stored?: boolean) => {
      if (!viewer) {
        setTickets(server.map((row) => ({ ...row, vaulted: ticketsVaultStored(store, stored) })));
        return;
      }
      if (viewingAs) {
        setTickets(hydrateTickets(server, viewer, false, { persist: false, store, stored }));
        return;
      }
      setTickets(hydrateTickets(server, mine, ownerChrome, { store, stored }));
    },
    [mine, ownerChrome, viewer, viewingAs],
  );

  useEffect(() => {
    if (viewer) refresh();
    deskFetch("/api/desk/tickets")
      .then((response) => response.json().then((data) => ({ ok: response.ok, data })))
      .then(({ ok, data }) => {
        if (!ok || !ticketsVaultStored(data.store, data.stored)) {
          setError(typeof data.error === "string" && data.error ? data.error : "Tickets could not load.");
          if (mine) refresh([], data.store, false);
          return;
        }
        setError(null);
        refresh((data.tickets ?? []) as DeskTicket[], data.store, data.stored);
      })
      .catch(() => {
        setError("Tickets could not load.");
        if (mine) refresh([], null, false);
      });
  }, [mine, ownerChrome, refresh, viewer]);

  useEffect(() => {
    function onChange() {
      if (mine) refresh();
    }
    window.addEventListener("hs-tickets-changed", onChange);
    return () => window.removeEventListener("hs-tickets-changed", onChange);
  }, [mine, refresh]);

  async function patch(id: string, body: { done?: boolean; notifyFix?: boolean | null }) {
    const response = await fetch("/api/desk/tickets", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...body }),
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok && ticketsVaultStored(data.store, data.stored)) {
      refresh((data.tickets ?? []) as DeskTicket[], data.store, data.stored);
    } else {
      setError(typeof data.error === "string" && data.error ? data.error : TICKETS_VAULT_WRITE_ERROR);
    }
  }

  async function remove(id: string, label: string) {
    if (!(await confirmRemove(label, { title: "Remove this ticket?", confirmLabel: "Delete" }))) return;
    const response = await fetch("/api/desk/tickets", {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok && ticketsVaultStored(data.store, data.stored)) {
      refresh((data.tickets ?? []) as DeskTicket[], data.store, data.stored);
    } else {
      setError(typeof data.error === "string" && data.error ? data.error : TICKETS_VAULT_WRITE_ERROR);
    }
  }

  async function removeDone() {
    if (!(await confirmRemove("Done tickets leave this list.", { title: "Delete done?", confirmLabel: "Delete done" }))) {
      return;
    }
    const response = await fetch("/api/desk/tickets", {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: true }),
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok && ticketsVaultStored(data.store, data.stored)) {
      refresh((data.tickets ?? []) as DeskTicket[], data.store, data.stored);
    } else {
      setError(typeof data.error === "string" && data.error ? data.error : TICKETS_VAULT_WRITE_ERROR);
    }
  }

  async function copyShot(row: DeskTicket) {
    if (!row.capture) return;
    const burned = await burnCaption(row.capture, `${row.who}\n${row.note || row.kind}`);
    const blob = await (await fetch(burned)).blob();
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
  }

  function copyText(row: DeskTicket) {
    void navigator.clipboard.writeText(ticketCopyText(row));
  }

  function copyAll() {
    void navigator.clipboard.writeText(tickets.map(ticketCopyText).join("\n\n"));
  }

  const visible = ownerChrome ? tickets : tickets.filter((row) => row.who === (viewer || user?.email));

  return (
    <section className="plant-card mt-4 px-5 py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-[#163038]">Tickets</h2>
          <p className="mt-2 text-sm text-[#5b6f73]">
            Filed from Suggestion Box. Success shows only after the tickets vault confirms the
            write. They do not copy into Inbox.
          </p>
        </div>
        {ownerChrome ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={copyAll} className="rounded-lg border border-steel px-3 py-2 text-sm text-steel">
              Copy all
            </button>
            <button type="button" onClick={() => void removeDone()} className="rounded-lg border border-steel px-3 py-2 text-sm text-steel">
              Delete done
            </button>
          </div>
        ) : (
          <p className="text-sm text-[#5b6f73]">Your tickets only. Testers cannot delete.</p>
        )}
      </div>
      {error ? <p className="mt-3 text-sm text-[#b74120]">{error}</p> : null}
      <div className="mt-4 space-y-4">
        {visible.length === 0 ? (
          <p className="text-sm text-[#5b6f73]">No tickets yet.</p>
        ) : (
          visible.map((row) => (
            <article key={row.id} className="rounded-lg border border-[#d5e0de] px-4 py-3">
              <p className="font-semibold text-[#163038]">
                {row.kind}
                {row.later ? " · later" : ""}
                {row.done ? " · done" : ""}
                {row.vaulted ? "" : ` · ${TICKET_UNVAULTED_MARK}`}
              </p>
              <p className="text-xs text-[#5b6f73]">
                {row.at} · {row.who}
              </p>
              {row.note ? <p className="mt-2 text-sm text-[#163038]">{row.note}</p> : null}
              {row.capture ? (
                <button
                  type="button"
                  onClick={() => setView({ src: row.capture as string, caption: `${row.who} · ${row.note || row.kind}` })}
                  className="mt-3 block"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={row.capture} alt="Ticket capture" className="max-h-40 rounded border border-[#d5e0de]" />
                </button>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2 text-sm">
                <button type="button" onClick={() => copyText(row)} className="text-steel">
                  Copy
                </button>
                {row.capture ? (
                  <button type="button" onClick={() => void copyShot(row)} className="text-steel">
                    Copy screenshot
                  </button>
                ) : null}
                {ownerChrome ? (
                  <>
                    <label className="flex items-center gap-1 text-[#5b6f73]">
                      <input type="checkbox" checked={row.done} onChange={(event) => void patch(row.id, { done: event.target.checked })} />
                      Done
                    </label>
                    <span className="text-[#5b6f73]">Notify of fix</span>
                    <button
                      type="button"
                      onClick={() => void patch(row.id, { notifyFix: true })}
                      className={row.notifyFix === true ? "font-semibold text-steel" : "text-[#5b6f73]"}
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      onClick={() => void patch(row.id, { notifyFix: false })}
                      className={row.notifyFix === false ? "font-semibold text-steel" : "text-[#5b6f73]"}
                    >
                      No
                    </button>
                    <button type="button" onClick={() => void remove(row.id, row.kind)} className="text-[#b74120]">
                      Delete
                    </button>
                  </>
                ) : null}
              </div>
            </article>
          ))
        )}
      </div>
      {view ? <PhotoViewer src={view.src} caption={view.caption} onClose={() => setView(null)} /> : null}
    </section>
  );
}
