"use client";

import { useEffect, useState } from "react";
import { CatalogPick } from "@/components/CatalogPick";
import { useConfirmRemove } from "@/components/ConfirmDialog";
import { CrewPhaseCards } from "@/components/CrewPhaseCards";
import { useEstimatePackage } from "@/components/EstimatePackage";
import { CREW_LANES } from "@/lib/crew-lanes";
import {
  addSupportLine,
  assignSupportBilledAs,
  assignSupportDuty,
  clampPerDiem,
  hydrateSupportLine,
  syncSupportRows,
  type CalendarRange,
  type SupportLine,
} from "@/lib/craft-labor";

export type { SupportLine };

const SUPPORT_LANE = CREW_LANES.find((lane) => lane.id === "support");
const DIRECT_LANE = CREW_LANES.find((lane) => lane.id === "direct");

export function SupportCrewCard({
  rows,
  onRows,
  site = "",
  client = "",
}: {
  rows: SupportLine[];
  onRows: (next: SupportLine[] | ((current: SupportLine[]) => SupportLine[])) => void;
  site?: string;
  client?: string;
}) {
  const confirmRemove = useConfirmRemove();
  const pack = useEstimatePackage();
  const [openId, setOpenId] = useState<string | null | undefined>(undefined);
  const phases = pack.schedule.phases;
  const units = pack.schedule.units ?? [];
  const multi = Boolean(pack.schedule.multiUnits);
  const lines = syncSupportRows(rows, phases, units, multi);
  const resolvedOpen = openId === undefined ? (lines[0]?.id ?? null) : openId;
  const needsPhaseSeed = rows.some((row) => !hydrateSupportLine(row).ranges.some((range) => range.phaseId));

  useEffect(() => {
    if (!needsPhaseSeed) return;
    onRows((current) => syncSupportRows(current, phases, units, multi));
  }, [multi, needsPhaseSeed, onRows, phases, units]);

  function addPosition() {
    const next = addSupportLine(phases, units, multi);
    onRows((current) => [...syncSupportRows(current, phases, units, multi), next]);
    setOpenId(next.id);
  }

  function patchRow(id: string, next: SupportLine) {
    onRows((current) => current.map((row) => (row.id === id ? next : hydrateSupportLine(row))));
  }

  function assignDuty(id: string, position: string) {
    onRows((current) =>
      current.map((row) =>
        row.id === id
          ? assignSupportDuty(row, position, pack.schedule.phases, pack.schedule.units, pack.schedule.multiUnits)
          : hydrateSupportLine(row),
      ),
    );
  }

  function assignBilledAs(id: string, billedAs: string) {
    onRows((current) =>
      current.map((row) =>
        row.id === id
          ? assignSupportBilledAs(row, billedAs, pack.schedule.phases, pack.schedule.units, pack.schedule.multiUnits)
          : hydrateSupportLine(row),
      ),
    );
  }

  function patchRange(rowId: string, rangeId: string, patch: Partial<CalendarRange>) {
    onRows((current) =>
      current.map((row) => {
        const hydrated = hydrateSupportLine(row);
        if (hydrated.id !== rowId) return hydrated;
        return {
          ...hydrated,
          ranges: hydrated.ranges.map((range) => {
            if (range.id !== rangeId) return range;
            const next = { ...range, ...patch };
            return clampPerDiem(next, next.shift ?? hydrated.shift);
          }),
        };
      }),
    );
  }

  async function remove(row: SupportLine) {
    if (
      !(await confirmRemove(row.position || "this position", {
        title: "Remove this position?",
        confirmLabel: "Remove",
      }))
    ) {
      return;
    }
    onRows((current) => current.filter((item) => item.id !== row.id));
    setOpenId((current) => (current === row.id ? null : current));
  }

  return (
    <section className="plant-card px-5 py-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold text-[#163038]">Support</h2>
          <p className="text-sm text-[#5b6f73]">
            Position is the duty. Billed as is the craft rate. Direct Craft stays on its own card.
          </p>
        </div>
        <button type="button" onClick={addPosition} className="rounded-lg bg-steel px-3 py-2 text-sm text-white">
          + Add position
        </button>
      </div>
      <div className="mt-4 space-y-3">
        {lines.length === 0 ? (
          <p className="text-sm text-[#5b6f73]">No support positions yet.</p>
        ) : (
          <>
            <div className="grid grid-cols-[auto_1fr_1fr_auto] gap-3 px-3 text-xs tracking-[0.12em] text-[#5b6f73]">
              <p />
              <p>POSITION</p>
              <p>BILLED AS</p>
              <p />
            </div>
            {lines.map((row) => {
              const open = resolvedOpen === row.id;
              return (
                <article key={row.id} className="rounded-lg border border-[#d5e0de] px-3 py-3">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setOpenId(open ? null : row.id)}
                      title={open ? "Collapse" : "Expand"}
                      aria-label={open ? "Collapse" : "Expand"}
                      aria-expanded={open}
                      className="crew-chevron"
                    >
                      <svg className="crew-chevron-icon" viewBox="0 0 24 24" aria-hidden="true">
                        {open ? (
                          <path
                            d="M6 9.5 12 15.5 18 9.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.75"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        ) : (
                          <path
                            d="M9.5 6 15.5 12 9.5 18"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.75"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        )}
                      </svg>
                      <span className="crew-chevron-label">{open ? "Collapse" : "Expand"}</span>
                    </button>
                    <CatalogPick
                      label="Position"
                      value={row.position}
                      options={SUPPORT_LANE?.positions ?? []}
                      placeholder="Select position"
                      onChange={(position) => assignDuty(row.id, position)}
                      allowCustom
                    />
                    <CatalogPick
                      label="Billed as"
                      value={row.billedAs}
                      options={DIRECT_LANE?.positions ?? []}
                      placeholder="Select billed as"
                      onChange={(billedAs) => assignBilledAs(row.id, billedAs)}
                      allowCustom
                    />
                    <button
                      type="button"
                      onClick={() => void remove(row)}
                      title="Remove position"
                      aria-label="Remove position"
                      className="trash-btn"
                    >
                      ⌫
                    </button>
                  </div>
                  {open ? (
                    <div className="mt-3 rounded-lg bg-[#f4f1e8] px-3 py-3">
                      <CrewPhaseCards
                        row={row}
                        site={site}
                        client={client}
                        onPatchRange={(rangeId, patch) => patchRange(row.id, rangeId, patch)}
                        onAddRange={(range) =>
                          patchRow(row.id, { ...row, ranges: [...row.ranges, range] })
                        }
                        onRemoveRange={(rangeId) =>
                          patchRow(row.id, {
                            ...row,
                            ranges: row.ranges.filter((range) => range.id !== rangeId),
                          })
                        }
                      />
                    </div>
                  ) : null}
                </article>
              );
            })}
          </>
        )}
      </div>
    </section>
  );
}
