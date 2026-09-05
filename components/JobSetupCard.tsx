"use client";

import { useEffect, useState } from "react";
import { CreatedBy } from "@/components/CreatedBy";
import { useAlias, useLensUser } from "@/components/OwnerDeskContext";
import { StatusStamp } from "@/components/StatusStamp";
import {
  clampEstimateStatus,
  estimateStatusLane,
  isEstimateLocked,
  needsStatusConfirm,
  statusConfirmCopy,
  statusNeedsManager,
  statusOptionsForSite,
  type EstimateStatus,
} from "@/lib/estimate-status";
import { isProjectManagerOrAbove } from "@/lib/desk-role";
import { DateField } from "@/components/DateField";
import { useEstimatePackage } from "@/components/EstimatePackage";
import { displayEstimateType, ESTIMATE_TYPES, type EstimateType } from "@/lib/estimate-type";
import { jobEventLabel } from "@/lib/job-event";
import {
  readEquipmentSheet,
  writeEquipmentSheet,
} from "@/lib/equipment-sheet";
import { PACK_TITLE_MAX, normalizePackTitle } from "@/lib/local-estimates";
import {
  SHAHAN_BOOK_ID,
  SHAHAN_BOOK_LABEL,
  rematchCrewToShahan,
  rematchEquipmentSheetToShahan,
} from "@/lib/shahan-wood-river";
import { applyPlantJobRates, offerRateBookForSite } from "@/lib/wage-lookup";
import {
  CBA_INCREASE_LABEL,
  EQUIPMENT_CONTINGENCY_LABEL,
  LABOR_CONTINGENCY_LABEL,
  MORE_FUND_LABEL,
  SUBS_CONTINGENCY_LABEL,
} from "@/lib/estimate-money";

export function JobSetupCard({
  type,
  client,
  site,
  name,
  onName,
  otRule,
  author,
  code,
  window,
  existingClient = false,
  status = "Draft",
  onStatus,
  statusLocked = false,
  children,
}: {
  type: string;
  client: string;
  site?: string;
  name: string;
  onName?: (next: string) => void;
  otRule: string;
  author?: string;
  code?: string;
  window?: string;
  existingClient?: boolean;
  status?: EstimateStatus;
  onStatus?: (next: EstimateStatus) => void;
  statusLocked?: boolean;
  children?: React.ReactNode;
}) {
  const pack = useEstimatePackage();
  const alias = useAlias();
  const lens = useLensUser();
  const [estimateType, setEstimateType] = useState<EstimateType>(displayEstimateType(type));
  const [rateStatus, setRateStatus] = useState("");
  const [confirmRates, setConfirmRates] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<EstimateStatus | null>(null);
  const [estimateName, setEstimateName] = useState(name);

  useEffect(() => {
    setEstimateName(name);
  }, [name]);

  function commitEstimateName(raw: string) {
    const next = normalizePackTitle(raw);
    if (!next) {
      setEstimateName(name);
      return;
    }
    setEstimateName(next);
    if (next === name) return;
    const saved = pack.setPackTitle(next);
    if (saved) onName?.(saved);
    else setEstimateName(name);
  }
  const offer = offerRateBookForSite(site || "");
  const canAward = isProjectManagerOrAbove(lens);
  const lane = estimateStatusLane(site || "", client);
  const options = statusOptionsForSite(site || "", client);
  const liveStatus = clampEstimateStatus(status, site || "", client);

  function requestStatus(next: EstimateStatus) {
    if (statusLocked && next !== "Draft") return;
    if (statusNeedsManager(liveStatus, next) && !canAward) return;
    if (next === liveStatus) return;
    if (needsStatusConfirm(liveStatus, next)) {
      setPendingStatus(next);
      return;
    }
    commitStatus(next);
  }

  function commitStatus(next: EstimateStatus) {
    pack.setPackStatus(next);
    onStatus?.(next);
  }

  useEffect(() => {
    if (liveStatus !== status) commitStatus(liveStatus);
  }, [liveStatus, status]);

  function requestUpdateRates() {
    if (!offer.ok) {
      setConfirmRates(false);
      setRateStatus(alias(offer.message));
      return;
    }
    setRateStatus("");
    setConfirmRates(true);
  }

  function applyPlantRates() {
    if (!offer.ok) return;
    const book = offer.book;
    pack.setJobMeta((current) => applyPlantJobRates(current, book));
    pack.setCrew((current) => rematchCrewToShahan(current, { catalog: book.catalog }));
    if (book.bookId === SHAHAN_BOOK_ID) {
      writeEquipmentSheet(pack.estimateKey, rematchEquipmentSheetToShahan(readEquipmentSheet(pack.estimateKey)));
    }
    setConfirmRates(false);
    setRateStatus(`${book.bookLabel} is on this estimate. Staff PD $${book.staffPd}. Craft PD $${book.craftPd}.`);
  }

  return (
    <section className="plant-card mx-auto max-w-3xl px-6 py-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold text-[#163038]">Job setup</h1>
        {author ? <CreatedBy author={author} /> : null}
      </div>
      <div className="mt-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold tracking-[0.18em] text-[#5b6f73]">STATUS</span>
          <StatusStamp value={liveStatus.toUpperCase()} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {options.map((item) => {
            const locked =
              (statusLocked && item !== "Draft") || (statusNeedsManager(liveStatus, item) && !canAward);
            const active = liveStatus === item;
            return (
              <button
                key={item}
                type="button"
                disabled={locked}
                title={
                  statusLocked && item !== "Draft"
                    ? "New sheet stays Draft"
                    : statusNeedsManager(liveStatus, item) && !canAward
                      ? lane === "budget"
                        ? "Project Manager or above can set Locked"
                        : "Project Manager or above can set Locked, Submitted, or Awarded"
                      : undefined
                }
                onClick={() => requestStatus(item)}
                className={`rounded-full px-3 py-1.5 text-sm ${
                  active ? "bg-steel text-white" : "border border-steel text-steel"
                } ${locked ? "cursor-not-allowed opacity-50" : ""}`}
              >
                {item}
              </button>
            );
          })}
        </div>
        <p className="mt-1 text-xs text-[#5b6f73]">
          {lane === "budget"
            ? "Draft, In progress, Budgetary, Review, Locked. Budget lane — set budgets; no Submitted or Awarded."
            : "Draft, In progress, Budgetary, Review, Locked, Submitted, Awarded. Project Manager or above sets Locked, Submitted, or Awarded."}
        </p>
        {isEstimateLocked(liveStatus) ? (
          <p className="mt-1 text-xs text-[#5b6f73]">
            Locked — stamped on the desk and Excel. This pass does not block edits.
          </p>
        ) : null}
        {pendingStatus ? (
          <div className="mt-3 rounded-lg border border-[#c5d4d4] bg-white px-3 py-3">
            <p className="text-sm text-[#163038]">{statusConfirmCopy(liveStatus, pendingStatus)}</p>
            <div className="mt-3 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setPendingStatus(null)}
                className="rounded-lg border border-steel px-4 py-2 text-steel"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  commitStatus(pendingStatus);
                  setPendingStatus(null);
                }}
                className="rounded-lg bg-steel px-4 py-2 text-white"
              >
                Change status
              </button>
            </div>
          </div>
        ) : null}
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        {existingClient ? (
          <span className="pill bg-steel text-white">Existing customer</span>
        ) : (
          <>
            <span className="pill border border-[#c5d4d4] bg-white">Existing customer</span>
            <span className="pill bg-steel text-white">New / potential client</span>
          </>
        )}
      </div>
      <label className="mt-6 block">
        <span className="text-xs font-semibold tracking-[0.18em] text-[#5b6f73]">ESTIMATE TYPE</span>
        <select
          value={estimateType}
          onChange={(event) => setEstimateType(event.target.value as EstimateType)}
          className="paper-field mt-2"
        >
          {ESTIMATE_TYPES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-[#5b6f73]">
          How this sheet is priced: T&amp;M, lump sum, CR/FF, or Hybrid. {jobEventLabel(client, site)} is the job
          itself. This list is never Outage.
        </p>
      </label>
      <label className="mt-4 block">
        <span className="text-xs font-semibold tracking-[0.18em] text-[#5b6f73]">CLIENT</span>
        <input readOnly value={client} className="paper-field mt-2" />
      </label>
      <label className="mt-4 block">
        <span className="text-xs font-semibold tracking-[0.18em] text-[#5b6f73]">ESTIMATE NAME</span>
        <input
          value={estimateName}
          maxLength={PACK_TITLE_MAX}
          required
          className="paper-field mt-2"
          onChange={(event) => setEstimateName(event.target.value)}
          onBlur={() => commitEstimateName(estimateName)}
        />
      </label>
      <div className="mt-4">
        <span className="text-xs font-semibold tracking-[0.18em] text-[#5b6f73]">PROJECT START</span>
        <DateField
          value={pack.schedule.projectStart}
          onChange={(start) => pack.setProjectStartDate(start)}
          className="mt-2"
          aria-label="Project start"
        />
      </div>
      <label className="mt-4 block">
        <span className="text-xs font-semibold tracking-[0.18em] text-[#5b6f73]">AFE / TA NAME</span>
        <input
          className="paper-field mt-2"
          placeholder="AFE or TA name"
          value={pack.jobMeta.afeName}
          onChange={(event) => pack.setJobMeta((current) => ({ ...current, afeName: event.target.value }))}
        />
      </label>
      <label className="mt-4 block">
        <span className="text-xs font-semibold tracking-[0.18em] text-[#5b6f73]">AREA / UNIT</span>
        <input
          className="paper-field mt-2"
          placeholder="CAT, Coker, FCC…"
          value={pack.jobMeta.area}
          onChange={(event) => pack.setJobMeta((current) => ({ ...current, area: event.target.value }))}
        />
        <p className="mt-1 text-xs text-[#5b6f73]">
          Which unit you are bidding — CAT, Coker, FCC. Leave the refinery name on the Client line.
        </p>
      </label>
      <label className="mt-4 block">
        <span className="text-xs font-semibold tracking-[0.18em] text-[#5b6f73]">OVERTIME / RATE</span>
        <input readOnly value={alias(otRule)} className="paper-field mt-2" />
        <p className="mt-1 text-xs text-[#5b6f73]">Locked from the plant. Not a field. There is no picker.</p>
      </label>
      {children}
      {code || window ? (
        <p className="mt-4 text-sm text-[#5b6f73]">
          {code ? `${code}. ` : ""}
          {window
            ? `The job card still shows ${window}. Crew follows Project start and the phase START/STOP table above — those can differ from the job card.`
            : ""}
        </p>
      ) : null}
      <div className="mt-6 rounded-lg border border-[#d5e0de] bg-[#f4f1e8] px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold tracking-[0.12em] text-[#5b6f73]">UPDATE RATES</h2>
            <p className="mt-1 text-sm text-[#163038]">
              {alias(
                "Pull the live book for this site. Wood River, Yates, Rodeo, Bayway, Ferndale, and Monroe Energy books are loaded. Hours, headcount, dates, qty, freight, and typed third-party stay.",
              )}
            </p>
          </div>
          <button type="button" onClick={requestUpdateRates} className="rounded-lg bg-steel px-3 py-2 text-sm text-white">
            Update rates
          </button>
        </div>
        {confirmRates && offer.ok ? (
          <div className="mt-3 rounded-lg border border-[#c5d4d4] bg-white px-3 py-3">
            <p className="text-sm text-[#163038]">
              Pull {alias(offer.bookLabel)}? Staff PD ${offer.book.staffPd} and Craft PD ${offer.book.craftPd}.
              Crew titles rematch when they are in the book. Unmatched titles stay and show No rate. The Rates dropdown does not rewrite Crew.
            </p>
            <div className="mt-3 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmRates(false)}
                className="rounded-lg border border-steel px-4 py-2 text-steel"
              >
                Cancel
              </button>
              <button type="button" onClick={applyPlantRates} className="rounded-lg bg-steel px-4 py-2 text-white">
                Pull {alias(offer.bookLabel)}
              </button>
            </div>
          </div>
        ) : null}
        {rateStatus ? <p className="mt-2 text-sm text-[#163038]">{rateStatus}</p> : null}
        {pack.jobMeta.rateBook ? (
          <p className="mt-2 text-xs text-[#5b6f73]">
            Rate book on this estimate: {alias(offer.ok ? offer.bookLabel : SHAHAN_BOOK_LABEL)}.
          </p>
        ) : null}
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-semibold tracking-[0.18em] text-[#5b6f73]">STAFF PER DIEM $ / DAY</span>
          <input
            type="number"
            min={0}
            className="paper-field mt-2"
            value={pack.jobMeta.staffPerDiemRate || ""}
            onChange={(event) =>
              pack.setJobMeta((current) => ({ ...current, staffPerDiemRate: Number(event.target.value) || 0 }))
            }
          />
          <p className="mt-1 text-xs text-[#5b6f73]">Staff + GF. Shahan TM OCIP default is $140.</p>
        </label>
        <label className="block">
          <span className="text-xs font-semibold tracking-[0.18em] text-[#5b6f73]">CRAFT PER DIEM $ / DAY</span>
          <input
            type="number"
            min={0}
            className="paper-field mt-2"
            value={pack.jobMeta.craftPerDiemRate || ""}
            onChange={(event) =>
              pack.setJobMeta((current) => ({ ...current, craftPerDiemRate: Number(event.target.value) || 0 }))
            }
          />
          <p className="mt-1 text-xs text-[#5b6f73]">Foreman + Direct + Support. Shahan TM OCIP default is $130.</p>
        </label>
        <label className="block">
          <span className="text-xs font-semibold tracking-[0.18em] text-[#5b6f73]">STAFF MILEAGE $ / MILE</span>
          <input
            type="number"
            min={0}
            step="0.01"
            className="paper-field mt-2"
            value={pack.jobMeta.staffMileageRate || ""}
            onChange={(event) =>
              pack.setJobMeta((current) => ({ ...current, staffMileageRate: Number(event.target.value) || 0 }))
            }
          />
          <p className="mt-1 text-xs text-[#5b6f73]">Seeds Other Cost Travel Staff. No Shahan default — type it here.</p>
        </label>
        <label className="block">
          <span className="text-xs font-semibold tracking-[0.18em] text-[#5b6f73]">CRAFT MILEAGE $ / MILE</span>
          <input
            type="number"
            min={0}
            step="0.01"
            className="paper-field mt-2"
            value={pack.jobMeta.craftMileageRate || ""}
            onChange={(event) =>
              pack.setJobMeta((current) => ({ ...current, craftMileageRate: Number(event.target.value) || 0 }))
            }
          />
          <p className="mt-1 text-xs text-[#5b6f73]">Seeds Other Cost Travel Craft. You can still override on that line.</p>
        </label>
      </div>
      <div className="mt-6 rounded-lg border border-[#d5e0de] bg-[#f4f1e8] px-4 py-4">
        <h2 className="text-sm font-semibold tracking-[0.12em] text-[#5b6f73]">CONTINGENCY · CBA · M.O.R.E.</h2>
        <p className="mt-1 text-sm text-[#5b6f73]">
          Three independent percents. Separate from 6.5% markup. Labor is Crew ST/OT/DT only — not PD.
          Affiliate subs stay out of markup and still take the subs contingency.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="text-xs font-semibold tracking-[0.16em] text-[#5b6f73]">{LABOR_CONTINGENCY_LABEL.toUpperCase()} %</span>
            <input
              type="number"
              min={0}
              className="paper-field mt-2"
              value={pack.jobMeta.laborContingencyPct || ""}
              onChange={(event) =>
                pack.setJobMeta((current) => ({ ...current, laborContingencyPct: Number(event.target.value) || 0 }))
              }
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold tracking-[0.16em] text-[#5b6f73]">{EQUIPMENT_CONTINGENCY_LABEL.toUpperCase()} %</span>
            <input
              type="number"
              min={0}
              className="paper-field mt-2"
              value={pack.jobMeta.equipmentContingencyPct || ""}
              onChange={(event) =>
                pack.setJobMeta((current) => ({ ...current, equipmentContingencyPct: Number(event.target.value) || 0 }))
              }
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold tracking-[0.16em] text-[#5b6f73]">{SUBS_CONTINGENCY_LABEL.toUpperCase()} %</span>
            <input
              type="number"
              min={0}
              className="paper-field mt-2"
              value={pack.jobMeta.subsContingencyPct || ""}
              onChange={(event) =>
                pack.setJobMeta((current) => ({ ...current, subsContingencyPct: Number(event.target.value) || 0 }))
              }
            />
          </label>
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm text-[#163038]">
          <input
            type="checkbox"
            checked={pack.jobMeta.cbaIncreaseOn}
            onChange={(event) => pack.setJobMeta((current) => ({ ...current, cbaIncreaseOn: event.target.checked }))}
          />
          {CBA_INCREASE_LABEL} — CBA craft only
        </label>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-semibold tracking-[0.16em] text-[#5b6f73]">CBA EFFECTIVE DATE</span>
            <input
              type="date"
              className="paper-field mt-2"
              value={pack.jobMeta.cbaIncreaseDate}
              disabled={!pack.jobMeta.cbaIncreaseOn}
              onChange={(event) => pack.setJobMeta((current) => ({ ...current, cbaIncreaseDate: event.target.value }))}
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold tracking-[0.16em] text-[#5b6f73]">CBA INCREASE %</span>
            <input
              type="number"
              min={0}
              className="paper-field mt-2"
              value={pack.jobMeta.cbaIncreaseOn ? pack.jobMeta.cbaIncreasePct || "" : ""}
              disabled={!pack.jobMeta.cbaIncreaseOn}
              onChange={(event) =>
                pack.setJobMeta((current) => ({ ...current, cbaIncreasePct: Number(event.target.value) || 0 }))
              }
            />
          </label>
        </div>
        <label className="mt-4 block">
          <span className="text-xs font-semibold tracking-[0.16em] text-[#5b6f73]">{MORE_FUND_LABEL.toUpperCase()} $ / HR</span>
          <input
            type="number"
            step="0.01"
            className="paper-field mt-2"
            value={pack.jobMeta.moreFundPerHour ?? ""}
            placeholder="Empty = $0. No default."
            onChange={(event) => {
              const raw = event.target.value;
              pack.setJobMeta((current) => ({
                ...current,
                moreFundPerHour: raw === "" ? null : Number(raw),
              }));
            }}
          />
          <p className="mt-1 text-xs text-[#5b6f73]">
            Typed $/hr. Empty is $0 and stays off the rail. Credit or cost. Craft hours only. Never seeded.
          </p>
        </label>
      </div>
    </section>
  );
}
