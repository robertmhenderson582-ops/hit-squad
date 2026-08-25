"use client";

import { useEffect, useState } from "react";
import type { DeskTicket } from "@/lib/tickets";

export function TicketsDesk() {
  const [tickets, setTickets] = useState<DeskTicket[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/desk/tickets", { credentials: "include", cache: "no-store" })
      .then((response) => response.json().then((data) => ({ ok: response.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) {
          setError(data.error || "Tickets could not load.");
          return;
        }
        setTickets(data.tickets ?? []);
      })
      .catch(() => setError("Tickets could not load."));
  }, []);

  return (
    <section className="plant-card mt-4 px-5 py-5">
      <h2 className="text-2xl font-semibold text-[#163038]">Tickets</h2>
      <p className="mt-2 text-sm text-[#5b6f73]">
        Filed from the Ticket button. They stay on this list. They do not copy into Inbox. Submit
        later does not send mail tonight.
      </p>
      {error ? <p className="mt-3 text-sm text-[#b74120]">{error}</p> : null}
      <div className="mt-4 space-y-4">
        {tickets.length === 0 ? (
          <p className="text-sm text-[#5b6f73]">No tickets yet.</p>
        ) : (
          tickets.map((row) => (
            <article key={row.id} className="rounded-lg border border-[#d5e0de] px-4 py-3">
              <p className="font-semibold text-[#163038]">
                {row.kind}
                {row.later ? " · later" : ""}
              </p>
              <p className="text-xs text-[#5b6f73]">
                {row.at} · {row.who}
              </p>
              {row.note ? <p className="mt-2 text-sm text-[#163038]">{row.note}</p> : null}
              {row.capture ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={row.capture} alt="Ticket capture" className="mt-3 max-h-40 rounded border border-[#d5e0de]" />
              ) : null}
            </article>
          ))
        )}
      </div>
    </section>
  );
}
