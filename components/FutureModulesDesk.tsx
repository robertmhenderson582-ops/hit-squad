"use client";

import { useOwnerDesk } from "@/components/OwnerDeskContext";
import { useSession } from "@/components/SessionProvider";

const OWNER_SLOTS = [
  { name: "Accounting", note: "not open for trial yet." },
  { name: "Payroll", note: "not open for trial yet." },
  { name: "Team", note: "not open for trial yet." },
] as const;

export function FutureModulesDesk() {
  const { user } = useSession();
  const desk = useOwnerDesk();
  const seat = desk?.viewAs ?? "owner";
  const ownerChrome = user?.role === "owner" && (seat === "owner" || seat === "joseph");

  if (!ownerChrome) {
    return (
      <section className="plant-card px-5 py-5">
        <h2 className="text-2xl font-semibold text-[#163038]">Future modules</h2>
        <p className="mt-2 text-sm text-[#5b6f73]">Under construction.</p>
      </section>
    );
  }

  return (
    <section className="plant-card px-5 py-5">
      <h2 className="text-2xl font-semibold text-[#163038]">Future modules</h2>
      <p className="mt-2 text-sm text-[#5b6f73]">Chrome only. No boards, no clocks, no spend.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {OWNER_SLOTS.map((item) => (
          <article key={item.name} className="rounded-lg border border-[#d5e0de] px-4 py-4">
            <p className="font-semibold text-[#163038]">{item.name}</p>
            <p className="mt-1 text-sm text-[#5b6f73]">{item.note}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
