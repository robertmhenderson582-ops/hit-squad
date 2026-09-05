"use client";

import { useMemo } from "react";
import { useEstimatePackage } from "@/components/EstimatePackage";
import { LaborRollup } from "@/components/LaborRollup";
import { computeRowHours, sumSplits } from "@/lib/hours-clock";
import { PHASE_IDS, PHASE_NAMES } from "@/lib/phase-schedule";
import {
  ACTIVITY_RESOURCES,
  activityHours,
  blankWorkActivity,
  isPhaseId,
  type WorkActivity,
} from "@/lib/work-activities";

export function WorkActivitiesDesk({ site = "", client = "" }: { site?: string; client?: string }) {
  const pack = useEstimatePackage();
  const crewHours = useMemo(() => {
    const rows = [...pack.crew.staff, ...pack.crew.generalForeman, ...pack.crew.foreman, ...pack.crew.direct];
    return sumSplits(rows.map((row) => computeRowHours(row, site, client, false, "", pack.jobMeta.holidays ?? []))).hours;
  }, [client, pack.crew, pack.jobMeta.holidays, site]);
  const workHours = activityHours(pack.activities);

  function addActivity() {
    pack.setActivities((current) => [...current, blankWorkActivity(current.length + 1)]);
  }

  function patch(id: string, next: Partial<WorkActivity>) {
    pack.setActivities((current) => current.map((row) => (row.id === id ? { ...row, ...next } : row)));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold text-[#163038]">Work Activities</h2>
          <p className="mt-1 text-sm text-[#5b6f73]">
            The work list for this estimate. Activities do not bill. Hours here sit next to crew hours.
          </p>
        </div>
        <button type="button" onClick={addActivity} className="rounded-lg bg-steel px-4 py-2 text-white">
          + Add activity
        </button>
      </div>
      <LaborRollup key={crewHours} estHours={crewHours} />
      <p className="text-sm text-[#5b6f73]">
        Activity hours {workHours.toLocaleString()} · Crew hours {crewHours.toLocaleString()}
      </p>
      <div className="plant-card overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <caption className="sr-only">Work activities</caption>
          <thead className="text-xs tracking-[0.12em] text-[#5b6f73]">
            <tr>
              <th className="px-3 py-2">Activity no.</th>
              <th className="px-3 py-2">WBS</th>
              <th className="px-3 py-2">Unit</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Resource</th>
              <th className="px-3 py-2">Phase</th>
              <th className="px-3 py-2">Hours</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {pack.activities.length === 0 ? (
              <tr className="border-t border-[#d5e0de]">
                <td colSpan={8} className="px-3 py-6 text-[#5b6f73]">
                  No activities yet. Add activity starts the work list — no import.
                </td>
              </tr>
            ) : (
              pack.activities.map((row) => (
                <tr key={row.id} className="border-t border-[#d5e0de] align-top">
                  <td className="px-3 py-2">
                    <input
                      value={row.activityNo}
                      onChange={(event) => patch(row.id, { activityNo: event.target.value })}
                      className="paper-field w-20"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={row.wbs}
                      onChange={(event) => patch(row.id, { wbs: event.target.value })}
                      className="paper-field w-24"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={row.unit}
                      onChange={(event) => patch(row.id, { unit: event.target.value })}
                      className="paper-field w-24"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={row.name}
                      onChange={(event) => patch(row.id, { name: event.target.value })}
                      className="paper-field min-w-[12rem]"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={row.resource}
                      onChange={(event) =>
                        patch(row.id, { resource: event.target.value as WorkActivity["resource"] })
                      }
                      className="paper-field"
                    >
                      <option value="">Resource</option>
                      {ACTIVITY_RESOURCES.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={row.phaseId}
                      onChange={(event) =>
                        patch(row.id, { phaseId: isPhaseId(event.target.value) ? event.target.value : "" })
                      }
                      className="paper-field"
                    >
                      <option value="">Phase</option>
                      {PHASE_IDS.map((id) => (
                        <option key={id} value={id}>
                          {PHASE_NAMES[id]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={0}
                      value={row.hours || ""}
                      onChange={(event) => patch(row.id, { hours: Math.max(0, Number(event.target.value) || 0) })}
                      className="paper-field w-24"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="text-sm text-[#5b6f73]"
                      onClick={() => pack.setActivities((current) => current.filter((item) => item.id !== row.id))}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
