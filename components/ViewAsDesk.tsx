"use client";

import { VIEW_RESPONSIBILITIES, VIEW_SITES, VISUAL_ROSTER, type ViewAsSeat, type ViewResponsibility } from "@/lib/owner-desk";
import { useOwnerDesk } from "@/components/OwnerDeskContext";

export function ViewAsDesk() {
  const desk = useOwnerDesk();
  if (!desk) return <p className="text-[#5b6f73]">Owner desk only.</p>;

  return (
    <section className="plant-card px-5 py-5">
      <h2 className="text-2xl font-semibold text-[#163038]">View as</h2>
      <p className="mt-2 text-sm text-[#5b6f73]">
        Owner in View as is still the owner. Republish must not lock him. Settings / Users / Follow /
        Activity stay. This does not seed logins.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => desk.setViewAs("owner")}
          className={`rounded-lg px-4 py-2 text-sm ${desk.viewAs === "owner" ? "bg-steel text-white" : "border border-steel text-steel"}`}
        >
          Owner
        </button>
        {VISUAL_ROSTER.map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => desk.setViewAs(row.id as ViewAsSeat)}
            className={`rounded-lg px-4 py-2 text-sm ${desk.viewAs === row.id ? "bg-steel text-white" : "border border-steel text-steel"}`}
          >
            {row.name}
          </button>
        ))}
      </div>
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
    </section>
  );
}
