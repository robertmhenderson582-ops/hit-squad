"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useEstimatePackage } from "@/components/EstimatePackage";
import { LaborRollup } from "@/components/LaborRollup";
import { computeRowHours, sumSplits } from "@/lib/hours-clock";
import { PHASE_IDS, PHASE_NAMES } from "@/lib/phase-schedule";
import {
  ACTIVITY_RESOURCES,
  activityAssigneeChoices,
  activityHours,
  blankWorkActivity,
  isPhaseId,
  namedPeopleFromOrgChart,
  type ActivityResource,
  type WorkActivity,
} from "@/lib/work-activities";

function ExpandingDescription({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.max(el.scrollHeight, 44)}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      rows={2}
      onChange={(event) => onChange(event.target.value)}
      className="paper-field min-w-[18rem] max-w-xl resize-y overflow-hidden whitespace-pre-wrap"
      placeholder="Description"
      aria-label="Activity description"
    />
  );
}

function ResourcePicker({
  row,
  jobPeople,
  onChange,
}: {
  row: WorkActivity;
  jobPeople: string[];
  onChange: (next: Pick<WorkActivity, "resource" | "resources" | "people">) => void;
}) {
  const [draft, setDraft] = useState("");
  const people = activityAssigneeChoices(row, jobPeople);

  function setResources(resources: ActivityResource[]) {
    onChange({ resource: resources[0] ?? "", resources, people: row.people });
  }

  function toggleResource(item: ActivityResource, on: boolean) {
    setResources(on ? [...row.resources.filter((value) => value !== item), item] : row.resources.filter((value) => value !== item));
  }

  function setPeople(next: string[]) {
    onChange({ resource: row.resource, resources: row.resources, people: next });
  }

  function togglePerson(name: string, on: boolean) {
    setPeople(on ? [...row.people.filter((value) => value !== name), name] : row.people.filter((value) => value !== name));
  }

  function addPerson() {
    const name = draft.trim();
    if (!name) return;
    if (!row.people.includes(name)) setPeople([...row.people, name]);
    setDraft("");
  }

  return (
    <div className="min-w-[12rem] space-y-2">
      <fieldset>
        <legend className="sr-only">Craft resources</legend>
        <div className="flex flex-col gap-1">
          {ACTIVITY_RESOURCES.map((item) => (
            <label key={item} className="flex items-center gap-2 text-sm text-[#163038]">
              <input
                type="checkbox"
                checked={row.resources.includes(item)}
                onChange={(event) => toggleResource(item, event.target.checked)}
              />
              <span>{item}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="border-t border-[#d5e0de] pt-2">
        <legend className="mb-1 text-xs tracking-[0.12em] text-[#5b6f73]">People</legend>
        {people.length === 0 ? <p className="text-xs text-[#5b6f73]">No names on this job yet.</p> : null}
        <div className="flex flex-col gap-1">
          {people.map((name) => (
            <label key={name} className="flex items-center gap-2 text-sm text-[#163038]">
              <input type="checkbox" checked={row.people.includes(name)} onChange={(event) => togglePerson(name, event.target.checked)} />
              <span>{name}</span>
            </label>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addPerson();
              }
            }}
            className="paper-field min-w-[8rem] flex-1"
            placeholder="Add name"
            aria-label="Add person to this activity"
          />
          <button type="button" className="text-sm text-steel" onClick={addPerson}>
            Add
          </button>
        </div>
      </fieldset>
    </div>
  );
}

export function WorkActivitiesDesk({ site = "", client = "" }: { site?: string; client?: string }) {
  const pack = useEstimatePackage();
  const crewHours = useMemo(() => {
    const rows = [...pack.crew.staff, ...pack.crew.generalForeman, ...pack.crew.foreman, ...pack.crew.direct];
    return sumSplits(rows.map((row) => computeRowHours(row, site, client, false, "", pack.jobMeta.holidays ?? []))).hours;
  }, [client, pack.crew, pack.jobMeta.holidays, site]);
  const workHours = activityHours(pack.activities);
  const jobPeople = useMemo(() => namedPeopleFromOrgChart(pack.orgChart.names), [pack.orgChart.names]);

  function addActivity() {
    pack.setActivities((current) => [...current, blankWorkActivity(current)]);
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
            The work list for this estimate. Activity numbers stay 001 / 002 on this job. Activities do not bill. Hours
            here sit next to crew hours.
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
              <th className="px-3 py-2">Description</th>
              <th className="px-3 py-2">Resources</th>
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
                      readOnly
                      className="paper-field w-20 text-center font-mono"
                      aria-label={`Activity number ${row.activityNo}`}
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
                    <ExpandingDescription
                      value={row.description || row.name}
                      onChange={(description) => patch(row.id, { description, name: description })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <ResourcePicker
                      row={row}
                      jobPeople={jobPeople}
                      onChange={(next) =>
                        patch(row.id, {
                          ...next,
                          resource: next.resources[0] ?? "",
                        })
                      }
                    />
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
