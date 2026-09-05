"use client";

import { useMemo, useState } from "react";
import { GripToPan } from "@/components/GripToPan";
import { useEstimatePackage } from "@/components/EstimatePackage";
import { noteFeatureTrail } from "@/components/FeatureTrail";
import { P66_CONTRACTOR } from "@/lib/p66-ips-crafts";
import {
  cellValue,
  generateStaffingPlan,
  staffingFilename,
  staffingPhasesFromSchedule,
  staffingPlanToXlsx,
  visibleStaffingRows,
} from "@/lib/staffing-plan";
import { downloadXlsx } from "@/lib/xlsx-minimal";

export function StaffingPlanDesk({
  site,
  client,
  name,
}: {
  site?: string;
  client?: string;
  name?: string;
}) {
  const pack = useEstimatePackage();
  const [showFull, setShowFull] = useState(false);
  const plan = useMemo(
    () =>
      generateStaffingPlan({
        site,
        client,
        phases: staffingPhasesFromSchedule(pack.schedule),
        crew: pack.crew,
        holidays: pack.jobMeta.holidays,
      }),
    [client, pack.crew, pack.jobMeta.holidays, pack.schedule, site],
  );
  const rows = visibleStaffingRows(plan, showFull);
  const coastLabel = plan.coast === "west" ? "West Coast (John)" : "East Coast (Nathan)";

  async function exportPlan() {
    const bytes = await staffingPlanToXlsx(plan, {
      projectName: name || "Staffing Plan",
      afeName: pack.jobMeta.afeName,
      area: pack.jobMeta.area,
    });
    downloadXlsx(staffingFilename({ projectName: name || "Staffing Plan", afeName: pack.jobMeta.afeName }), bytes);
    noteFeatureTrail("staffing export");
  }

  return (
    <section className="plant-card px-5 py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold text-[#163038]">Staffing</h2>
          <p className="mt-2 max-w-3xl text-sm text-[#5b6f73]">
            Generated from this estimate’s Crew and Phases. Day / Night follow the shift on each
            phase window. Empty P66 crafts stay blank. {coastLabel} craft list.
          </p>
        </div>
        <button
          type="button"
          onClick={exportPlan}
          className="rounded-lg bg-steel px-4 py-2 text-sm text-white"
        >
          Export P66 staffing plan
        </button>
      </div>
      <label className="mt-4 inline-flex items-center gap-2 text-sm text-[#163038]">
        <input
          type="checkbox"
          checked={showFull}
          onChange={(event) => setShowFull(event.target.checked)}
        />
        Show full P66 template
      </label>
      {!rows.length ? (
        <p className="mt-4 text-sm text-[#5b6f73]">
          Add people on Crew. Staffing fills Day / Night from those calendars and the phase dates.
        </p>
      ) : null}
      <GripToPan className="staffing-pan mt-4 max-h-[70vh] overflow-y-auto">
        <table className="staffing-grid">
          <thead>
            <tr>
              <th className="staffing-sticky-left" rowSpan={2}>
                Craft
              </th>
              <th className="staffing-sticky-code" rowSpan={2}>
                Code
              </th>
              {plan.dates.map((date) => (
                <th key={date.ymd} colSpan={2}>
                  {date.header}
                </th>
              ))}
            </tr>
            <tr>
              {plan.dates.flatMap((date) => [
                <th key={`${date.ymd}-day`}>Day</th>,
                <th key={`${date.ymd}-night`}>Night</th>,
              ])}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.code}-${row.craftName}`}>
                <td className="staffing-sticky-left">{row.craftName}</td>
                <td className="staffing-sticky-code">{row.code}</td>
                {plan.dates.flatMap((date) => [
                  <td key={`${row.craftName}-${date.ymd}-day`}>{cellValue(row.cells[date.ymd], "day") ?? ""}</td>,
                  <td key={`${row.craftName}-${date.ymd}-night`}>{cellValue(row.cells[date.ymd], "night") ?? ""}</td>,
                ])}
              </tr>
            ))}
          </tbody>
        </table>
      </GripToPan>
      <p className="mt-3 text-xs text-[#5b6f73]">
        Export contractor: {P66_CONTRACTOR}. Totals on the sheet are SUM formulas. Use the striped bar
        above the grid to slide dates.
      </p>
    </section>
  );
}
