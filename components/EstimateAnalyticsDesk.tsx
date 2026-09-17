"use client";

import { useEffect, useMemo, useState } from "react";
import { useEstimatePackage } from "@/components/EstimatePackage";
import { readFcrPacket } from "@/lib/change-order-packet";
import {
  ANALYTICS_STC_LINES,
  ANALYTICS_STC_PPE_LABEL,
  ANALYTICS_STC_SAVINGS_HINT,
  deriveEstimateAnalytics,
  stcDefaultHint,
  type AnalyticsKind,
  type AnalyticsLineId,
  type EstimateAnalytics,
} from "@/lib/estimate-analytics";
import { fcrChangeOrderTotal } from "@/lib/estimate-desk-total";
import { readEquipmentSheet } from "@/lib/equipment-sheet";
import { computeRowHours, sumSplits } from "@/lib/hours-clock";
import {
  ANALYTICS_BRIDGE_SEED_NOTE,
  emptyAnalyticsLocked,
  emptyAnalyticsNb,
  emptyAnalyticsStc,
  hydrateAnalyticsBridge,
  hydrateAnalyticsStc,
  hydrateAnalyticsStcPct,
  stcPpeSavingsPctPoints,
  type AnalyticsBridgeMeta,
  type AnalyticsLockedAdders,
  type AnalyticsMode,
  type AnalyticsNbDrag,
} from "@/lib/estimate-money";
import { readOtherCost, syncOtherCostTravel } from "@/lib/other-cost";
import { onEstimateSheets } from "@/lib/sheet-events";
import { readSubSheet } from "@/lib/subcontractor";

function formatAmount(kind: AnalyticsKind, amount: number | null) {
  if (amount == null) return "—";
  if (kind === "hours") {
    return amount ? amount.toLocaleString("en-US", { maximumFractionDigits: 1 }) : "—";
  }
  if (kind === "percent") {
    return `${(amount * 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
  }
  if (!amount && kind !== "per-hour") return "—";
  return `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function stcRow(id: AnalyticsLineId) {
  return ANALYTICS_STC_LINES.find((row) => row.id === id);
}

function DraftNumber({
  label,
  value,
  onCommit,
  suffix,
  placeholder = "",
  step = 0.01,
  testId,
}: {
  label: string;
  value: number | null;
  onCommit: (raw: string) => void;
  suffix?: string;
  placeholder?: string;
  step?: number;
  testId?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value == null ? "" : String(value));
  return (
    <label className="inline-flex items-center gap-1 text-xs text-[#5b6f73]">
      <span className="sr-only">{label}</span>
      <input
        type="number"
        min={0}
        step={step}
        inputMode="decimal"
        className="paper-field w-[4.75rem] px-2 py-1 text-right text-sm text-[#163038]"
        placeholder={placeholder}
        value={shown}
        onChange={(event) => {
          const raw = event.target.value;
          setDraft(raw);
          if (raw.trim() === "" || (Number.isFinite(Number(raw)) && !raw.endsWith("."))) {
            onCommit(raw);
          }
        }}
        onBlur={() => {
          if (draft != null) onCommit(draft);
          setDraft(null);
        }}
        data-analytics-field={testId}
        aria-label={label}
      />
      {suffix ? <span>{suffix}</span> : null}
    </label>
  );
}

export function EstimateAnalyticsDesk({ client = "", site = "" }: { client?: string; site?: string }) {
  const pack = useEstimatePackage();
  const [tick, setTick] = useState(0);
  const bridgeMeta = hydrateAnalyticsBridge(pack.jobMeta.analyticsBridge);

  useEffect(() => onEstimateSheets(() => setTick((n) => n + 1)), []);

  const crewRows = useMemo(
    () => [
      ...pack.crew.staff,
      ...pack.crew.generalForeman,
      ...pack.crew.foreman,
      ...pack.crew.direct,
      ...pack.crew.support,
    ],
    [pack.crew],
  );
  const hours = useMemo(
    () =>
      sumSplits(
        crewRows.map((row) => computeRowHours(row, site, client, pack.crew.otAfter8, "", pack.jobMeta.holidays ?? [])),
      ),
    [client, crewRows, pack.crew.otAfter8, pack.jobMeta.holidays, site],
  );

  const sheet: EstimateAnalytics = useMemo(() => {
    void tick;
    const equipment = readEquipmentSheet(pack.estimateKey);
    const other = syncOtherCostTravel(readOtherCost(pack.estimateKey), pack.crew, {
      staffPerMile: pack.jobMeta.staffMileageRate,
      craftPerMile: pack.jobMeta.craftMileageRate,
    });
    return deriveEstimateAnalytics({
      crew: pack.crew,
      site,
      client,
      equipment,
      otherCost: other,
      subcontractor: readSubSheet(pack.estimateKey),
      jobMeta: pack.jobMeta,
      changeOrders: fcrChangeOrderTotal(readFcrPacket(pack.estimateKey)),
      hours: hours.hours,
    });
  }, [client, hours.hours, pack.crew, pack.estimateKey, pack.jobMeta, site, tick]);

  function patchBridge(next: Partial<AnalyticsBridgeMeta> | ((current: AnalyticsBridgeMeta) => AnalyticsBridgeMeta)) {
    pack.setJobMeta((current) => {
      const base = hydrateAnalyticsBridge(current.analyticsBridge);
      const patched = typeof next === "function" ? next(base) : { ...base, ...next };
      return { ...current, analyticsBridge: patched };
    });
  }

  function setStcSavingsPct(raw: string) {
    pack.setJobMeta((current) => ({
      ...current,
      analyticsStc: { ...emptyAnalyticsStc(), stcPpeSavingsPct: hydrateAnalyticsStcPct(raw) },
    }));
  }

  function setLocked(key: keyof AnalyticsLockedAdders, raw: string) {
    const parsed = hydrateAnalyticsStcPct(raw);
    patchBridge((current) => ({
      ...current,
      locked: {
        ...emptyAnalyticsLocked(),
        ...current.locked,
        [key]: key === "stcPpePerHour" ? (parsed ?? emptyAnalyticsLocked().stcPpePerHour) : parsed,
      },
    }));
  }

  function setNb(key: keyof AnalyticsNbDrag, raw: string) {
    patchBridge((current) => ({
      ...current,
      nb: { ...emptyAnalyticsNb(), ...current.nb, [key]: hydrateAnalyticsStcPct(raw) },
    }));
  }

  const lockedMode = bridgeMeta.mode === "locked";

  return (
    <div className="mt-4 space-y-5">
      <fieldset className="flex flex-wrap gap-3" data-analytics-mode-toggle>
        <legend className="sr-only">Analytics OH / profit mode</legend>
        {(
          [
            { id: "pct" as const, title: "Book OH / profit", note: "OH and labor profit from hours × base wage × book %. STC & PPE budget is always hours × $/hr." },
            { id: "locked" as const, title: "Locked $/hr COMP adders", note: "Optional OH / profit $/hr. STC & PPE budget stays hours × $/hr. East WR default $3.60/hr." },
          ] satisfies Array<{ id: AnalyticsMode; title: string; note: string }>
        ).map((option) => {
          const selected = bridgeMeta.mode === option.id;
          return (
            <label
              key={option.id}
              className={`choice-tile min-w-[14rem] flex-1 cursor-pointer rounded-lg border px-3 py-3 ${
                selected ? "choice-tile-on" : ""
              }`}
            >
              <span className="choice-tile-title flex items-center gap-2 text-sm font-semibold">
                <input
                  type="radio"
                  name="analytics-burden-mode"
                  className="accent-steel"
                  checked={selected}
                  onChange={() => patchBridge({ mode: option.id })}
                />
                {option.title}
              </span>
              <span className="choice-tile-note mt-1 block text-xs">{option.note}</span>
            </label>
          );
        })}
      </fieldset>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <section className="plant-card px-5 py-5" aria-label="Analytics">
          <h2 className="text-2xl font-semibold text-[#163038]">Profit breakdown</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs tracking-[0.12em] text-[#5b6f73]">
                <tr>
                  <th className="px-2 py-2">Description</th>
                  <th className="px-2 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {sheet.lines.map((line) => {
                  const stc = stcRow(line.id);
                  const savings = stc ? hydrateAnalyticsStc(pack.jobMeta.analyticsStc) : null;
                  const lockedKey =
                    line.id === "oh" || line.id === "total-oh-base-wages"
                      ? "ohPerHour"
                      : line.id === "labor" || line.id === "total-profit-base-wages"
                        ? "profitPerHour"
                        : null;
                  return (
                    <tr key={line.id} className="border-t border-[#d5e0de]" data-analytics-line={line.id}>
                      <td className="px-2 py-2">
                        {stc ? (
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span>{line.label}</span>
                            <DraftNumber
                              label={`${line.label} dollars per hour`}
                              value={bridgeMeta.locked.stcPpePerHour}
                              suffix="$/hr"
                              testId="stc-ppe-locked"
                              onCommit={(raw) => setLocked("stcPpePerHour", raw)}
                            />
                            <DraftNumber
                              label="Predicted savings percent"
                              value={savings ? stcPpeSavingsPctPoints(savings) : null}
                              suffix="%"
                              placeholder="set…"
                              testId="stc-ppe-savings"
                              onCommit={setStcSavingsPct}
                            />
                            <span className="text-[11px] text-[#5b6f73]">{stcDefaultHint()}</span>
                          </div>
                        ) : lockedMode && lockedKey && (lockedKey === "ohPerHour" || lockedKey === "profitPerHour") ? (
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span>{line.label}</span>
                            <DraftNumber
                              label={`${line.label} dollars per hour`}
                              value={bridgeMeta.locked[lockedKey]}
                              suffix="$/hr"
                              placeholder="—"
                              testId={lockedKey}
                              onCommit={(raw) => setLocked(lockedKey, raw)}
                            />
                          </div>
                        ) : (
                          line.label
                        )}
                      </td>
                      <td className="px-2 py-2 text-right font-semibold text-[#163038]">
                        {formatAmount(line.kind, line.amount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="plant-card px-5 py-5" aria-label={ANALYTICS_STC_PPE_LABEL}>
          <h3 className="text-lg font-semibold text-[#163038]">{ANALYTICS_STC_PPE_LABEL}</h3>
          <p className="mt-1 text-xs text-[#5b6f73]">Overall budget from hours × $/hr. Coding is not split.</p>
          <p className="mt-1 text-xs text-[#5b6f73]">{ANALYTICS_STC_SAVINGS_HINT}</p>
          <ul className="mt-4 space-y-3">
            {sheet.rollups.map((row) => (
              <li key={row.id} className="flex items-baseline justify-between gap-3">
                <span className="text-xs tracking-[0.12em] text-[#5b6f73]">{row.label}</span>
                <span className="font-semibold text-[#163038]">{formatAmount("money", row.amount)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="plant-card px-5 py-5" aria-label="Drag stack" data-analytics-drag>
        <h2 className="text-2xl font-semibold text-[#163038]">Drag stack</h2>
        <p className="mt-1 text-sm text-[#5b6f73]">Estimate-side assumptions. Not Turnip actuals.</p>
        <p className="mt-1 text-xs text-[#5b6f73]" data-analytics-seed-note>
          {ANALYTICS_BRIDGE_SEED_NOTE}
        </p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold text-[#163038]">Wage / fringe erosion vs fixed OH + profit</p>
            <p className="mt-1 text-xs text-[#5b6f73]">Fixed adders do not rise with wages.</p>
            <div className="mt-2 flex flex-wrap gap-3">
              <DraftNumber
                label="Erosion dollars per manhour"
                value={bridgeMeta.erosionPerHour}
                suffix="$/MH"
                testId="erosion-per-hour"
                onCommit={(raw) => patchBridge({ erosionPerHour: hydrateAnalyticsStcPct(raw) })}
              />
              <DraftNumber
                label="Erosion percent of base wages"
                value={bridgeMeta.erosionPctOfBw}
                suffix="% of BW"
                testId="erosion-pct"
                onCommit={(raw) => patchBridge({ erosionPctOfBw: hydrateAnalyticsStcPct(raw) })}
              />
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-[#163038]">STC & PPE budget vs COMP embed</p>
            <p className="mt-1 text-xs text-[#5b6f73]">{sheet.bridge.drags.find((row) => row.id === "stc-embed")?.note}</p>
            <p className="mt-2 text-right font-semibold text-[#163038]">
              {formatAmount("money", sheet.bridge.drags.find((row) => row.id === "stc-embed")?.amount ?? 0)}
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold text-[#163038]">NB (no sell)</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <DraftNumber label="Onboarding" value={bridgeMeta.nb.onboarding} suffix="$" placeholder="Onboarding" testId="nb-onboarding" onCommit={(raw) => setNb("onboarding", raw)} />
              <DraftNumber label="Drug / DISA / Background" value={bridgeMeta.nb.drugDisa} suffix="$" placeholder="Drug/DISA" testId="nb-drug" onCommit={(raw) => setNb("drugDisa", raw)} />
              <DraftNumber label="NB Safety / Small tools (920)" value={bridgeMeta.nb.safety920} suffix="$" placeholder="920" testId="nb-920" onCommit={(raw) => setNb("safety920", raw)} />
              <DraftNumber label="Site classes / training" value={bridgeMeta.nb.siteClasses} suffix="$" placeholder="Classes" testId="nb-classes" onCommit={(raw) => setNb("siteClasses", raw)} />
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-[#163038]">PD volume</p>
            <p className="mt-1 text-xs text-[#5b6f73]">
              Pack PD {formatAmount("money", sheet.bridge.packPd || null)}. Extra drag is an assumption.
            </p>
            <div className="mt-2">
              <DraftNumber
                label="Extra PD drag"
                value={bridgeMeta.extraPd}
                suffix="$"
                testId="extra-pd"
                onCommit={(raw) => patchBridge({ extraPd: hydrateAnalyticsStcPct(raw) })}
              />
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-[#163038]">JVIC passthrough (no markup)</p>
            <p className="mt-1 text-xs text-[#5b6f73]">Profit $0. Drag is the markup if it had sold.</p>
            <div className="mt-2">
              <DraftNumber
                label="JVIC passthrough"
                value={bridgeMeta.jvic}
                suffix="$"
                testId="jvic"
                onCommit={(raw) => patchBridge({ jvic: hydrateAnalyticsStcPct(raw) })}
              />
            </div>
          </div>
        </div>
        <ul className="mt-4 space-y-2 border-t border-[#d5e0de] pt-3 text-sm">
          {sheet.bridge.drags.map((row) => (
            <li key={row.id} className="flex items-baseline justify-between gap-3" data-analytics-drag-line={row.id}>
              <span className="text-[#5b6f73]">{row.label}</span>
              <span className="font-semibold text-[#163038]">{formatAmount("money", row.amount || null)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="plant-card px-5 py-5" aria-label="Bridge summary" data-analytics-bridge>
        <h2 className="text-2xl font-semibold text-[#163038]">Bridge summary</h2>
        <p className="mt-1 text-sm text-[#5b6f73]">Bridged margin is estimate + assumption until actuals land.</p>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-[#5b6f73]">Book margin</dt>
            <dd className="font-semibold text-[#163038]">
              {formatAmount("money", sheet.bridge.bookProfit)} · {formatAmount("percent", sheet.bridge.bookMargin)}
            </dd>
          </div>
          {lockedMode ? (
            <div className="flex justify-between gap-3">
              <dt className="text-[#5b6f73]">After COMP locked adders</dt>
              <dd className="font-semibold text-[#163038]">
                {formatAmount("money", sheet.bridge.afterLockedProfit)} · {formatAmount("percent", sheet.bridge.afterLockedMargin)}
              </dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-3">
            <dt className="text-[#5b6f73]">After drag stack</dt>
            <dd className="font-semibold text-[#163038]">{formatAmount("money", sheet.bridge.dragTotal || null)}</dd>
          </div>
          <div className="flex justify-between gap-3 border-t border-[#d5e0de] pt-2">
            <dt className="font-semibold text-[#163038]">Bridged margin</dt>
            <dd className="font-semibold text-[#163038]" data-analytics-bridged>
              {formatAmount("money", sheet.bridge.bridgedProfit)} · {formatAmount("percent", sheet.bridge.bridgedMargin)}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
