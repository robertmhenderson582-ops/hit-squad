"use client";

const ROOMS = ["Clients", "Estimates", "Rates", "Tickets", "Workbooks", "Snapshots"];

export function VaultDesk() {
  return (
    <section className="plant-card px-5 py-5">
      <h2 className="text-2xl font-semibold text-[#163038]">Data vault</h2>
      <p className="mt-2 text-sm text-[#5b6f73]">
        Drive folder Hit Squad Estimators → Data. Client data stays so a republish does not wipe
        plants and agreements. Open jobs can start fresh. Keep that folder private. This desk does
        not share the folder.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {ROOMS.map((room) => (
          <a
            key={room}
            href="https://drive.google.com"
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-[#d5e0de] px-4 py-4"
          >
            <p className="font-semibold text-[#163038]">{room}</p>
            <p className="mt-1 text-xs text-[#5b6f73]">
              {room === "Snapshots" ? "dated dumps before an outage-window republish" : "Hit Squad Estimators → Data"}
            </p>
          </a>
        ))}
      </div>
    </section>
  );
}
