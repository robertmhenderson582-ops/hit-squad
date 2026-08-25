"use client";

import { useState } from "react";

const TABS = ["Summary", "Job sheet", "Rates", "Print only"] as const;
const LINES = ["Labor", "Truck", "Rod", "Fuel", "Mileage", "Per diem"] as const;

export function ShopRigSheet({
  client,
  name,
}: {
  client?: string;
  name?: string;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Summary");

  return (
    <section className="plant-card px-5 py-5">
      <p className="font-mono text-[10px] tracking-[0.2em] text-[#5b6f73]">SHOP / RIG</p>
      <h2 className="mt-1 font-display text-2xl">{name || "Shop / rig sheet"}</h2>
      <p className="mt-2 text-sm text-[#5b6f73]">
        {client || "Shop"} · Small sheet chrome only. No rate math.
      </p>
      <nav className="mt-4 flex flex-wrap gap-2 text-sm">
        {TABS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={`rounded px-3 py-1.5 ${tab === item ? "bg-steel text-white" : "border border-steel text-steel"}`}
          >
            {item}
          </button>
        ))}
      </nav>
      {tab === "Print only" ? (
        <p className="mt-4 text-sm text-[#5b6f73]">Prints always come out Day / paper white.</p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {LINES.map((line) => (
            <label key={line} className="block text-sm">
              {line}
              <input className="paper-field mt-1" placeholder="—" />
            </label>
          ))}
        </div>
      )}
    </section>
  );
}
