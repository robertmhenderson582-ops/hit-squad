"use client";

const LINES = [
  {
    role: "Superintendent General PF 01",
    cost: "$72,443",
    hours: "360 ST",
    meta: "ST $100.34 · OT $150.51 · DT $200.63 Wage $67.50 Merit",
  },
  {
    role: "Coordinator QA-QC 01",
    cost: "$63,827",
    hours: "360 ST",
    meta: "ST $83.98 · OT $122.00 · DT $160.01 Wage $64.00 Merit",
  },
  {
    role: "Coordinator Safety 01",
    cost: "$47,044",
    hours: "300 ST",
    meta: "ST $83.98 · OT $122.00 · DT $160.01 Wage $64.00 Merit",
  },
];

export function CrewManHours() {
  return (
    <section className="overflow-hidden rounded-xl">
      <div className="flex flex-wrap items-baseline justify-between bg-[#122226] px-4 py-3 text-white">
        <h2 className="font-display text-xl font-semibold">Supervision</h2>
        <p className="text-sm text-white/80">1,662 hrs · $174,734</p>
      </div>
      <div className="space-y-2 bg-[#eef3f2] px-3 py-3">
        {LINES.map((line) => (
          <article key={line.role} className="rounded-xl bg-white px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="rounded-full border border-[#d5e0de] px-3 py-1 text-sm">{line.role}</p>
              <p className="font-semibold text-[#163038]">
                {line.cost} <span className="ml-2 text-sm font-normal text-[#5b6f73]">{line.hours}</span>
              </p>
            </div>
            <p className="mt-2 text-xs text-[#5b6f73]">{line.meta}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
