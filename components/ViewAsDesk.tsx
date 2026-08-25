"use client";

import { VIEW_RESPONSIBILITIES, VIEW_SITES, type ViewResponsibility } from "@/lib/owner-desk";
import { useOwnerDesk } from "@/components/OwnerDeskContext";

export function ViewAsDesk() {
  const desk = useOwnerDesk();
  if (!desk) return <p className="text-[#5b6f73]">Owner desk only.</p>;

  return (
    <section className="plant-card px-5 py-5">
      <h2 className="text-2xl font-semibold text-[#163038]">View as</h2>
      <p className="mt-2 text-sm text-[#5b6f73]">
        Pick responsibility + site. Does not hide Settings / Users / Follow / Activity. Does not lock
        the owner out of republish heads-up. Joseph later.
      </p>
      <label className="mt-4 block">
        Responsibility
        <select
          value={desk.viewResponsibility}
          onChange={(event) => desk.setViewLens(event.target.value as ViewResponsibility, desk.viewSite)}
          className="paper-field mt-1"
        >
          {VIEW_RESPONSIBILITIES.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </label>
      <label className="mt-3 block">
        Site
        <select
          value={desk.viewSite}
          onChange={(event) => desk.setViewLens(desk.viewResponsibility, event.target.value)}
          className="paper-field mt-1"
        >
          {VIEW_SITES.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </label>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => desk.setViewAs("owner")}
          className={`rounded-lg px-4 py-2 text-sm ${desk.viewAs === "owner" ? "bg-steel text-white" : "border border-steel text-steel"}`}
        >
          Owner
        </button>
        <button
          type="button"
          onClick={() => desk.setViewAs("joseph")}
          className={`rounded-lg px-4 py-2 text-sm ${desk.viewAs === "joseph" ? "bg-steel text-white" : "border border-steel text-steel"}`}
        >
          Joseph (later)
        </button>
      </div>
    </section>
  );
}
