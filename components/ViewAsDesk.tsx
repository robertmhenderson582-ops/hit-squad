"use client";

import { useAlias, useLensUser, useOwnerDesk } from "@/components/OwnerDeskContext";
import { hasBuildDesk } from "@/lib/desk-role";
import { peopleByLane } from "@/lib/desk-people";
import { VIEW_RESPONSIBILITIES, VIEW_SITES, type ViewAsSeat, type ViewResponsibility } from "@/lib/owner-desk";
import { isJosephEmail } from "@/lib/tester-seats";

export function ViewAsDesk() {
  const desk = useOwnerDesk();
  const alias = useAlias();
  const lens = useLensUser();
  if (!desk) return <p className="text-[#5b6f73]">Owner desk only.</p>;
  const joseph = isJosephEmail(lens?.email);
  const buildDesk = hasBuildDesk(lens);

  return (
    <section className="plant-card px-5 py-5">
      <h2 className="text-2xl font-semibold text-[#163038]">View as</h2>
      <p className="mt-2 text-sm text-[#5b6f73]">
        {joseph
          ? "Responsibility and site change what you see on this device. Other people stay off this page."
          : "See that person's desk: their jobs, modules, and empty states. You stay signed in. An amber Viewing as bar with Exit stays on the desk. Users, Follow, Activity, vault, republish, branding, and Checks hide while viewing as. This does not seed logins."}
      </p>
      {buildDesk ? (
      <div className="mt-4 space-y-4">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => desk.setViewAs("owner")}
            className={`rounded-lg px-4 py-2 text-sm ${desk.viewAs === "owner" ? "bg-steel text-white" : "border border-steel text-steel"}`}
          >
            Owner
          </button>
        </div>
        {(["company", "standalone"] as const).map((lane) => {
          const rows = peopleByLane(desk.people)[lane];
          if (!rows.length) return null;
          return (
            <div key={lane}>
              <p className="font-mono text-[10px] tracking-[0.2em] text-steel">
                {lane === "company" ? "COMPANY" : "STANDALONE"}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {rows.map((row) => (
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
            </div>
          );
        })}
      </div>
      ) : null}
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
            <option key={item} value={item}>
              {alias(item)}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}
