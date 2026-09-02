"use client";

import { useEffect, useMemo, useState } from "react";
import { CatalogPick } from "@/components/CatalogPick";
import { useConfirmRemove } from "@/components/ConfirmDialog";
import { CrewPhaseCards } from "@/components/CrewPhaseCards";
import { GripToPan } from "@/components/GripToPan";
import { useEstimatePackage } from "@/components/EstimatePackage";
import { CREW_LANES, SUPPORT_BILLED_AS_TITLES } from "@/lib/crew-lanes";
import {
  addSupportLine,
  applyExtraRangeEnvelopes,
  assignSupportBilledAs,
  assignSupportDuty,
  clampPerDiem,
  setPhaseOff,
  duplicateSupportLine,
  hydrateSupportLine,
  syncSupportRows,
  type CalendarRange,
  type SupportLine,
} from "@/lib/craft-labor";
import { computeRowHours, sumSplits } from "@/lib/hours-clock";
import { defaultLaborClass } from "@/lib/labor-class";
import { formatDeskDollars, formatShahanCrewCost, shahanCrewCostAmount, shahanCrewTitle, shahanTitleHasNoRate } from "@/lib/shahan-wood-river";
import { wageLookupOpts } from "@/lib/wage-lookup";

export type { SupportLine };

const SUPPORT_LANE = CREW_LANES.find((lane) => lane.id === "support");
const HEADERS = ["POSITION", "BILLED AS", "SHIFT", "MODE", "ST", "OT", "DT", "PD DAYS", "HOURS", "COST"];

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
  const [openId, setOpenId] = useState<string | null>(null);
  const phases = pack.schedule.phases;
  const units = pack.schedule.units ?? [];
  const multi = Boolean(pack.schedule.multiUnits);
  const lines = syncSupportRows(rows, phases, units, multi);
  const needsPhaseSeed = rows.some((row) => !hydrateSupportLine(row).ranges.some((range) => range.phaseId));

  const computed = useMemo(
    () =>
      lines.map((row) => {
        const hours = computeRowHours(row, site, client, pack.crew.otAfter8);
        const title = shahanCrewTitle(row);
        const opts = wageLookupOpts(site, { laborClass: row.laborClassOverride ?? defaultLaborClass(title) });
        return {
          ...row,
          ...hours,
          costAmount: shahanCrewCostAmount(title, hours, opts),
          cost: formatShahanCrewCost(title, hours, opts),
        };
      }),
    [client, lines, pack.crew.otAfter8, site],
  );
  const totals = useMemo(() => sumSplits(computed), [computed]);
  const costTotal = useMemo(
    () => Math.round(computed.reduce((sum, row) => sum + row.costAmount, 0) * 100) / 100,
    [computed],
  );
  const costLabel = formatDeskDollars(costTotal);

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
          ranges: applyExtraRangeEnvelopes(
            hydrated.ranges.map((range) => {
              if (range.id !== rangeId) return range;
              const next = { ...range, ...patch };
              return clampPerDiem(next, next.shift ?? hydrated.shift);
            }),
            phases,
          ),
        };
      }),
    );
  }

  function duplicatePosition(row: SupportLine) {
    const source = rows.find((item) => item.id === row.id) ?? row;
    const copy = duplicateSupportLine(source);
    onRows((current) => {
      const index = current.findIndex((item) => item.id === source.id);
      const next = [...current];
      next.splice(index < 0 ? current.length : index + 1, 0, copy);
      return next;
    });
    setOpenId(copy.id);
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
            {totals.hours.toLocaleString()} hrs · {totals.st.toLocaleString()} ST · {totals.ot.toLocaleString()} OT ·{" "}
            {totals.dt.toLocaleString()} DT · {totals.pd.toLocaleString()} PD
            {costLabel ? ` · ${costLabel}` : ""}
          </p>
        </div>
        <button type="button" onClick={addPosition} className="rounded-lg bg-steel px-3 py-2 text-sm text-white">
          + Add position
        </button>
      </div>
      <p className="mt-2 text-xs text-[#5b6f73]">
        Position is the duty. Billed as is the craft or working-foreman rate. Direct Craft and Foreman cards stay their own cards.
      </p>
      <GripToPan className="mt-4">
        <table className="min-w-[1100px] text-left text-sm">
          <thead className="text-xs tracking-[0.12em] text-[#5b6f73]">
            <tr>
              {HEADERS.map((header) => (
                <th key={header} className="whitespace-nowrap px-2 py-2">
                  {header}
                </th>
              ))}
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {computed.length === 0 ? (
              <tr className="border-t border-[#d5e0de]">
                <td colSpan={11} className="px-2 py-6 text-sm text-[#5b6f73]">
                  No support positions yet.
                </td>
              </tr>
            ) : null}
            {computed.map((row) => {
              const open = openId === row.id;
              return (
                <SupportAccordionRow
                  key={row.id}
                  row={row}
                  site={site}
                  client={client}
                  open={open}
                  onToggle={() => setOpenId(open ? null : row.id)}
                  onAssignDuty={(position) => assignDuty(row.id, position)}
                  onAssignBilledAs={(billedAs) => assignBilledAs(row.id, billedAs)}
                  onPatchRange={(rangeId, patch) => patchRange(row.id, rangeId, patch)}
                  onAddRange={(range) => patchRow(row.id, { ...row, ranges: [...row.ranges, range] })}
                  onRemoveRange={(rangeId) =>
                    patchRow(row.id, { ...row, ranges: row.ranges.filter((range) => range.id !== rangeId) })
                  }
                  onSetPhaseOff={(phaseId, off) =>
                    patchRow(row.id, { ...row, ranges: setPhaseOff(row.ranges, phaseId, off) })
                  }
                  onDuplicate={() => duplicatePosition(row)}
                  onRemove={() => void remove(row)}
                />
              );
            })}
          </tbody>
          {computed.length ? (
            <tfoot>
              <tr className="border-t-2 border-steel">
                <td className="px-2 py-3 text-sm font-semibold text-[#163038]">Grand total</td>
                <td className="px-2 py-3" />
                <td className="px-2 py-3" />
                <td className="px-2 py-3" />
                <td className="hud-readout px-2 py-3">{totals.st.toLocaleString()}</td>
                <td className="hud-readout px-2 py-3">{totals.ot.toLocaleString()}</td>
                <td className="hud-readout px-2 py-3">{totals.dt.toLocaleString()}</td>
                <td className="hud-readout px-2 py-3">{totals.pd.toLocaleString()}</td>
                <td className="hud-readout px-2 py-3">{totals.hours.toLocaleString()}</td>
                <td className="hud-readout px-2 py-3 font-semibold">{costLabel || "—"}</td>
                <td className="px-2 py-3" />
              </tr>
            </tfoot>
          ) : null}
        </table>
      </GripToPan>
    </section>
  );
}

function SupportAccordionRow({
  row,
  site,
  client,
  open,
  onToggle,
  onAssignDuty,
  onAssignBilledAs,
  onPatchRange,
  onAddRange,
  onRemoveRange,
  onSetPhaseOff,
  onDuplicate,
  onRemove,
}: {
  row: SupportLine;
  site: string;
  client: string;
  open: boolean;
  onToggle: () => void;
  onAssignDuty: (position: string) => void;
  onAssignBilledAs: (billedAs: string) => void;
  onPatchRange: (rangeId: string, patch: Partial<CalendarRange>) => void;
  onAddRange: (range: CalendarRange) => void;
  onRemoveRange: (rangeId: string) => void;
  onSetPhaseOff: (phaseId: string, off: boolean) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const billedTitle = shahanCrewTitle(row);
  const noRate = shahanTitleHasNoRate(billedTitle, {
    laborClass: row.laborClassOverride ?? defaultLaborClass(billedTitle),
  });
  return (
    <>
      <tr className="border-t border-[#d5e0de] align-top">
        <td className="px-2 py-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggle}
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
              value={row.position}
              options={SUPPORT_LANE?.positions ?? []}
              placeholder="Select position"
              onChange={onAssignDuty}
              allowCustom
            />
          </div>
        </td>
        <td className="px-2 py-2">
          <CatalogPick
            value={row.billedAs}
            options={SUPPORT_BILLED_AS_TITLES}
            placeholder="Select billed as"
            onChange={onAssignBilledAs}
            allowCustom
          />
        </td>
        <td className="px-2 py-2">
          <span className="text-sm text-[#5b6f73]">Per phase</span>
        </td>
        <td className="px-2 py-2">
          <span className="paper-field inline-flex min-h-[2.6rem] items-center">Calendar</span>
        </td>
        <td className="hud-readout px-2 py-2">{row.st.toLocaleString()}</td>
        <td className="hud-readout px-2 py-2">{row.ot.toLocaleString()}</td>
        <td className="hud-readout px-2 py-2">{row.dt.toLocaleString()}</td>
        <td className="hud-readout px-2 py-2">{row.pd}</td>
        <td className="hud-readout px-2 py-2">{row.hours.toLocaleString()}</td>
        <td className="hud-readout px-2 py-2 font-semibold">
          {row.cost ? (
            row.cost
          ) : noRate ? (
            <span className="text-xs font-medium text-[#8a4b2f]" title="This title is not in the Shahan Wood River book">
              No rate
            </span>
          ) : null}
        </td>
        <td className="px-2 py-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onDuplicate}
              title="Duplicate"
              aria-label="Duplicate position"
              className="grid h-10 w-10 place-items-center rounded-lg text-[#5b6f73]"
            >
              ⧉
            </button>
            <button
              type="button"
              onClick={onRemove}
              title="Remove position"
              aria-label="Remove position"
              className="trash-btn"
            >
              ⌫
            </button>
          </div>
        </td>
      </tr>
      {open ? (
        <tr>
          <td colSpan={11} className="bg-[#f4f1e8] px-4 py-4">
            <CrewPhaseCards
              row={row}
              site={site}
              client={client}
              onPatchRange={onPatchRange}
              onAddRange={onAddRange}
              onRemoveRange={onRemoveRange}
              onSetPhaseOff={onSetPhaseOff}
            />
          </td>
        </tr>
      ) : null}
    </>
  );
}
