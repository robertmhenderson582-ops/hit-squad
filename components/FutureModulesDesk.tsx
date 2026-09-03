"use client";

import Link from "next/link";

export const FUTURE_MODULES = [
  { href: "/hse", name: "HSE", note: "Independent site safety module. Mark the package. Type talks, permits, and observations." },
  { href: "/quality", name: "Quality", note: "Independent Quality studio. Fillable forms, working boards, rolling-chart setup then map." },
  { href: "/accounting", name: "Accounting", note: "not open for trial yet." },
  { href: "/payroll", name: "Payroll", note: "not open for trial yet." },
  { href: "/team", name: "Team", note: "not open for trial yet." },
  { href: "/scheduling", name: "Scheduling", note: "not open for trial yet." },
] as const;

export function FutureModulesDesk() {
  return (
    <div className="mt-4 space-y-5">
      <section className="plant-card px-5 py-5">
        <h2 className="text-2xl font-semibold text-[#163038]">Future modules</h2>
        <p className="mt-2 text-sm text-[#5b6f73]">
          Quality and HSE are fillable modules on their own desks. No estimate interaction unless a lead
          later asks. Accounting, Payroll, Team, and Scheduling stay chrome only — no invented boards, no
          Checks numbers, no clocks.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {FUTURE_MODULES.map((item) => (
            <Link key={item.name} href={item.href} className="rounded-lg border border-[#d5e0de] px-4 py-4">
              <p className="font-semibold text-[#163038]">{item.name}</p>
              <p className="mt-1 text-sm text-[#5b6f73]">{item.note}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
