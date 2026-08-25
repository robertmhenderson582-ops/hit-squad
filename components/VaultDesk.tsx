"use client";

const ROOMS: { name: string; note: string }[] = [
  { name: "Clients", note: "Plant and agreement names. Ids stay real underneath." },
  { name: "Estimates", note: "Working packages on this desk." },
  { name: "Rates", note: "Burdened craft rates. Not a published wage schedule." },
  { name: "Tickets", note: "Filed Ticket button items. Not Inbox." },
  { name: "Workbooks", note: "Estimate sheets and shop / rig copies." },
  { name: "Snapshots", note: "Dated dumps before an outage-window republish." },
];

export function VaultDesk() {
  return (
    <section className="plant-card px-5 py-5">
      <h2 className="text-2xl font-semibold text-[#163038]">Data vault</h2>
      <p className="mt-2 text-sm text-[#5b6f73]">
        Rooms on this desk only. Client data stays so a republish does not wipe plants and
        agreements. Open jobs can start fresh. This page does not share a Drive folder.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {ROOMS.map((room) => (
          <article key={room.name} className="rounded-lg border border-[#d5e0de] px-4 py-4">
            <p className="font-semibold text-[#163038]">{room.name}</p>
            <p className="mt-1 text-xs text-[#5b6f73]">{room.note}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
