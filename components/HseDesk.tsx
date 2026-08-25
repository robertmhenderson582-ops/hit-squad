"use client";

import { LeadStudio } from "@/components/LeadStudio";

export function HseDesk() {
  return (
    <div className="mt-4">
      <p className="max-w-3xl text-sm leading-6 text-[#5b6f73]">
        Empty HSE chrome for the field trial. Lead studio only — no filled board.
      </p>
      <LeadStudio title="HSE lead studio" />
    </div>
  );
}
