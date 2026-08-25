"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useEstimatePackage } from "@/components/EstimatePackage";
import {
  APPROVAL_STATUSES,
  blankLogRow,
  emptyFcrPacket,
  FCR_BLOCKS,
  FCR_DAY_LABELS,
  FCR_DAYS,
  fcrSummary,
  IMPACT_LEVELS,
  LOG_STATUSES,
  MILEAGE_YES_FLAT,
  peopleFromJob,
  readFcrPacket,
  writeFcrPacket,
  type FcrPacket,
  type FcrPeopleRow,
} from "@/lib/change-order-packet";

const SHELLS = ["Log", "Estimate", "SCR"] as const;

function money(value: number) {
  return value ? `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";
}

export function ChangeOrderPacket({ client, site }: { client?: string; site?: string }) {
  const pack = useEstimatePackage();
  const [shell, setShell] = useState<(typeof SHELLS)[number]>("Log");
  const [packet, setPacket] = useState<FcrPacket>(emptyFcrPacket);

  const jobPeople = useMemo(() => {
    const rows = [...pack.crew.staff, ...pack.crew.generalForeman, ...pack.crew.foreman, ...pack.crew.direct];
    return peopleFromJob(rows, site, client, pack.crew.otAfter8);
  }, [client, pack.crew, site]);

  useEffect(() => {
    const saved = readFcrPacket(pack.estimateKey);
    if (!saved.people.length && jobPeople.length) saved.people = jobPeople;
    setPacket(saved);
  }, [jobPeople, pack.estimateKey]);

  function persist(next: FcrPacket) {
    setPacket(next);
    writeFcrPacket(pack.estimateKey, next);
  }

  const summary = fcrSummary(packet, 0, pack.jobMeta.perDiemRate);

  return (
    <div className="mt-4 space-y-5">
      <p className="max-w-3xl text-sm leading-6 text-[#5b6f73]">
        On-job FCR packet. Hours come from this job’s Crew. Mileage Yes is a flat ${MILEAGE_YES_FLAT},
        not times headcount. East Coast still does not turn 12s into DT.
      </p>
      <nav className="flex flex-wrap gap-2 text-sm">
        {SHELLS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setShell(item)}
            className={`rounded px-3 py-1.5 ${shell === item ? "bg-steel text-white" : "border border-steel text-steel"}`}
          >
            {item}
          </button>
        ))}
      </nav>

      {shell === "Log" ? (
        <section className="plant-card px-5 py-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(
              [
                ["pm", "PM"],
                ["costTracker", "Cost Tracker"],
                ["publishDate", "Publish Date"],
                ["nte", "NTE"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block text-sm">
                {label}
                <input
                  className="paper-field mt-1"
                  value={packet.header[key]}
                  onChange={(event) =>
                    persist({ ...packet, header: { ...packet.header, [key]: event.target.value } })
                  }
                />
              </label>
            ))}
            <label className="block text-sm sm:col-span-2">
              Project Scope
              <textarea
                rows={2}
                className="paper-field mt-1"
                value={packet.header.projectScope}
                onChange={(event) =>
                  persist({ ...packet, header: { ...packet.header, projectScope: event.target.value } })
                }
              />
            </label>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => persist({ ...packet, log: [...packet.log, blankLogRow()] })}
              className="rounded-lg bg-steel px-3 py-1.5 text-sm text-white"
            >
              + Add FCR
            </button>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs tracking-[0.1em] text-[#5b6f73]">
                <tr>
                  {[
                    "SCR #",
                    "Request Date",
                    "Requested By",
                    "Reviewed By",
                    "Status",
                    "Scope Change Description",
                    "Project Impact",
                    "Impact Level",
                    "Approved By",
                    "Approval Status",
                    "Approval Date",
                    "Approved MH",
                    "Approved Cost $",
                    "Changes to Plan",
                    "Revised Comp Date",
                    "Notes",
                    "Logged By",
                  ].map((header) => (
                    <th key={header} className="px-2 py-2">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {packet.log.length === 0 ? (
                  <tr>
                    <td colSpan={17} className="px-2 py-4 text-[#5b6f73]">
                      No FCRs on this job.
                    </td>
                  </tr>
                ) : (
                  packet.log.map((row, index) => (
                    <tr key={row.id} className="border-t border-[#d5e0de] align-top">
                      {(
                        [
                          ["scr", 8],
                          ["requestDate", 10],
                          ["requestedBy", 10],
                          ["reviewedBy", 10],
                        ] as const
                      ).map(([key]) => (
                        <td key={key} className="px-2 py-2">
                          <input
                            className="paper-field min-w-[7rem]"
                            value={row[key]}
                            onChange={(event) => {
                              const next = packet.log.slice();
                              next[index] = { ...row, [key]: event.target.value };
                              persist({ ...packet, log: next });
                            }}
                          />
                        </td>
                      ))}
                      <td className="px-2 py-2">
                        <select
                          className="paper-field"
                          value={row.status}
                          onChange={(event) => {
                            const next = packet.log.slice();
                            next[index] = { ...row, status: event.target.value as (typeof LOG_STATUSES)[number] };
                            persist({ ...packet, log: next });
                          }}
                        >
                          {LOG_STATUSES.map((item) => (
                            <option key={item}>{item}</option>
                          ))}
                        </select>
                      </td>
                      {(["scope", "impact"] as const).map((key) => (
                        <td key={key} className="px-2 py-2">
                          <input
                            className="paper-field min-w-[8rem]"
                            value={row[key]}
                            onChange={(event) => {
                              const next = packet.log.slice();
                              next[index] = { ...row, [key]: event.target.value };
                              persist({ ...packet, log: next });
                            }}
                          />
                        </td>
                      ))}
                      <td className="px-2 py-2">
                        <select
                          className="paper-field"
                          value={row.impactLevel}
                          onChange={(event) => {
                            const next = packet.log.slice();
                            next[index] = { ...row, impactLevel: event.target.value as (typeof IMPACT_LEVELS)[number] };
                            persist({ ...packet, log: next });
                          }}
                        >
                          {IMPACT_LEVELS.map((item) => (
                            <option key={item}>{item}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <input
                          className="paper-field min-w-[7rem]"
                          value={row.approvedBy}
                          onChange={(event) => {
                            const next = packet.log.slice();
                            next[index] = { ...row, approvedBy: event.target.value };
                            persist({ ...packet, log: next });
                          }}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <select
                          className="paper-field"
                          value={row.approvalStatus}
                          onChange={(event) => {
                            const next = packet.log.slice();
                            next[index] = {
                              ...row,
                              approvalStatus: event.target.value as (typeof APPROVAL_STATUSES)[number],
                            };
                            persist({ ...packet, log: next });
                          }}
                        >
                          {APPROVAL_STATUSES.map((item) => (
                            <option key={item}>{item}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <input
                          className="paper-field min-w-[7rem]"
                          value={row.approvalDate}
                          onChange={(event) => {
                            const next = packet.log.slice();
                            next[index] = { ...row, approvalDate: event.target.value };
                            persist({ ...packet, log: next });
                          }}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min={0}
                          className="paper-field w-20"
                          value={row.approvedMh || ""}
                          onChange={(event) => {
                            const next = packet.log.slice();
                            next[index] = { ...row, approvedMh: Number(event.target.value) || 0 };
                            persist({ ...packet, log: next });
                          }}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min={0}
                          className="paper-field w-24"
                          value={row.approvedCost || ""}
                          onChange={(event) => {
                            const next = packet.log.slice();
                            next[index] = { ...row, approvedCost: Number(event.target.value) || 0 };
                            persist({ ...packet, log: next });
                          }}
                        />
                      </td>
                      {(["planChanges", "revisedComp", "notes", "loggedBy"] as const).map((key) => (
                        <td key={key} className="px-2 py-2">
                          <input
                            className="paper-field min-w-[7rem]"
                            value={row[key]}
                            onChange={(event) => {
                              const next = packet.log.slice();
                              next[index] = { ...row, [key]: event.target.value };
                              persist({ ...packet, log: next });
                            }}
                          />
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {shell === "Estimate" ? (
        <section className="plant-card px-5 py-5">
          <h2 className="text-2xl font-semibold text-[#163038]">Estimate</h2>
          <p className="mt-1 text-sm text-[#5b6f73]">
            Staff Day / Night and Craft Day / Night from this job’s hours. 10s = Mon–Fri. 12s = 10+2.
            Saturday OT / Sunday DT when those days are on. PT = DT. East Coast still does not turn
            12s into DT. Mileage Yes is a flat ${MILEAGE_YES_FLAT}, not times headcount. Dollars stay
            off a Monroe / Bayway / Rodeo rate tab.
          </p>
          <button
            type="button"
            onClick={() => persist({ ...packet, people: jobPeople })}
            className="mt-3 rounded-lg border border-steel px-3 py-1.5 text-sm text-steel"
          >
            Load from Crew
          </button>
          {FCR_BLOCKS.map((block) => {
            const rows = packet.people.filter((row) => row.block === block);
            return (
              <div key={block} className="mt-5">
                <h3 className="font-semibold text-[#163038]">{block}</h3>
                <div className="mt-2 overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="text-xs tracking-[0.1em] text-[#5b6f73]">
                      <tr>
                        {["POSITION", "WEEKS", "MILEAGE", "DAYS PD", "HC"].map((header) => (
                          <th key={header} className="px-2 py-2" rowSpan={2}>
                            {header}
                          </th>
                        ))}
                        {FCR_DAY_LABELS.map((day) => (
                          <th key={day} className="px-2 py-2 text-center" colSpan={3}>
                            {day}
                          </th>
                        ))}
                        <th className="px-2 py-2 text-center" colSpan={3}>
                          TOTAL
                        </th>
                        <th className="px-2 py-2" rowSpan={2}>
                          MILEAGE $
                        </th>
                      </tr>
                      <tr>
                        {[...FCR_DAYS, "tot"].flatMap((day) =>
                          ["ST", "OT", "DT"].map((kind) => (
                            <th key={`${day}-${kind}`} className="px-1 py-1 font-mono text-[10px]">
                              {kind}
                            </th>
                          )),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length === 0 ? (
                        <tr>
                          <td colSpan={30} className="px-2 py-3 text-[#5b6f73]">
                            Empty.
                          </td>
                        </tr>
                      ) : (
                        rows.map((row) => (
                          <PeopleRow
                            key={row.id}
                            row={row}
                            onChange={(nextRow) =>
                              persist({
                                ...packet,
                                people: packet.people.map((item) => (item.id === row.id ? nextRow : item)),
                              })
                            }
                          />
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <label className="block text-sm">
              Sub
              <input
                type="number"
                min={0}
                className="paper-field mt-1"
                value={packet.sub || ""}
                onChange={(event) => persist({ ...packet, sub: Number(event.target.value) || 0 })}
              />
            </label>
            <label className="block text-sm">
              Equipment
              <input
                type="number"
                min={0}
                className="paper-field mt-1"
                value={packet.equipment || ""}
                onChange={(event) => persist({ ...packet, equipment: Number(event.target.value) || 0 })}
              />
            </label>
            <label className="block text-sm">
              Misc
              <input
                type="number"
                min={0}
                className="paper-field mt-1"
                value={packet.misc || ""}
                onChange={(event) => persist({ ...packet, misc: Number(event.target.value) || 0 })}
              />
            </label>
          </div>
          <p className="mt-4 text-sm text-[#163038]">
            Staff Labor {summary.staffHours}h · Craft Labor {summary.craftHours}h · Per Diem{" "}
            {money(summary.perDiem)} · Mileage {money(summary.mileage)} · Sub {money(summary.sub)} · Equipment{" "}
            {money(summary.equipment)} · Misc {money(summary.misc)}
          </p>
        </section>
      ) : null}

      {shell === "SCR" ? (
        <section className="plant-card space-y-3 px-5 py-5">
          <h2 className="text-2xl font-semibold text-[#163038]">SCR form</h2>
          {(
            [
              ["taRm", "TA / RM"],
              ["categories", "Categories"],
              ["moc", "MOC"],
              ["sap", "SAP"],
              ["costNote", "Cost"],
              ["scheduleNote", "Schedule"],
              ["signOff", "Sign-off"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block text-sm">
              {label}
              <input
                className="paper-field mt-1"
                value={packet.scr[key]}
                onChange={(event) => persist({ ...packet, scr: { ...packet.scr, [key]: event.target.value } })}
              />
            </label>
          ))}
        </section>
      ) : null}
    </div>
  );
}

function PeopleRow({ row, onChange }: { row: FcrPeopleRow; onChange: (next: FcrPeopleRow) => void }) {
  return (
    <tr className="border-t border-[#d5e0de]">
      <td className="px-2 py-2">{row.position}</td>
      <td className="px-2 py-2">
        <input
          type="number"
          min={0}
          className="paper-field w-16"
          value={row.weeks}
          onChange={(event) => onChange({ ...row, weeks: Number(event.target.value) || 0 })}
        />
      </td>
      <td className="px-2 py-2">
        <select
          className="paper-field"
          value={row.mileage ? "yes" : "no"}
          onChange={(event) => onChange({ ...row, mileage: event.target.value === "yes" })}
        >
          <option value="no">No</option>
          <option value="yes">Yes</option>
        </select>
      </td>
      <td className="px-2 py-2">{row.daysPd}</td>
      <td className="px-2 py-2">
        <input
          type="number"
          min={0}
          className="paper-field w-16"
          value={row.headcount}
          onChange={(event) => onChange({ ...row, headcount: Number(event.target.value) || 0 })}
        />
      </td>
      {FCR_DAYS.map((day) => (
        <Fragment key={day}>
          <td className="px-1 py-2 font-mono text-xs">{row.week?.[day]?.st || ""}</td>
          <td className="px-1 py-2 font-mono text-xs">{row.week?.[day]?.ot || ""}</td>
          <td className="px-1 py-2 font-mono text-xs">{row.week?.[day]?.dt || ""}</td>
        </Fragment>
      ))}
      <td className="px-1 py-2 font-mono text-xs">{row.st || ""}</td>
      <td className="px-1 py-2 font-mono text-xs">{row.ot || ""}</td>
      <td className="px-1 py-2 font-mono text-xs">{row.dt || ""}</td>
      <td className="px-2 py-2 font-semibold">{row.mileage ? money(MILEAGE_YES_FLAT) : "—"}</td>
    </tr>
  );
}
