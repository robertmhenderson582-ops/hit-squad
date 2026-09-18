/**
 * Jobs-card face: live estimate grand total + phase starts.
 * Reads the same pack sheets the desk already uses. Never invents dollars.
 */
import { fcrChangeOrderTotal, fcrFromUnknown, deskPackageTotal } from "./estimate-desk-total.ts";
import {
  collectPack,
  crewHasRows,
  equipmentHasWork,
  fcrHasWork,
  otherCostHasWork,
  scheduleHasWork,
  subcontractorHasWork,
  type EstimatePackSnapshot,
} from "./estimate-pack.ts";
import { packSnapshotToXlsxInput } from "./estimate-pack-xlsx.ts";
import { awardedJobNumberForPack, clientPoNumberForPack, jobCodeFromPackId } from "./his-wood-river.ts";
import type { LocalPack, StorageLike } from "./local-estimates.ts";
import { liveJobSetupPhases, PHASE_NAMES, parseYmd, type PhaseScheduleState } from "./phase-schedule.ts";
import { isWakeIdentityOnly } from "./rodeo-monroe-wake.ts";

export type JobCardFace = {
  grandTotal: number | null;
  grandTotalLabel: string;
  phaseStarts: Array<{ id: string; name: string; start: string; startLabel: string }>;
  phaseStartsLabel: string;
  statusLabel: string;
  jobCode: string;
  jobNumber: string;
  clientPoNumber: string;
};

const EMPTY_FACE: JobCardFace = {
  grandTotal: null,
  grandTotalLabel: "—",
  phaseStarts: [],
  phaseStartsLabel: "—",
  statusLabel: "",
  jobCode: "",
  jobNumber: "",
  clientPoNumber: "",
};

export function formatJobCardMoney(amount: number): string {
  return `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatJobCardDate(ymd: string): string {
  const date = parseYmd(ymd);
  if (!date) return "";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function packHasBillableWork(pack?: EstimatePackSnapshot | null): boolean {
  if (!pack) return false;
  return (
    crewHasRows(pack.crew) ||
    equipmentHasWork(pack.equipment) ||
    otherCostHasWork(pack.otherCost) ||
    subcontractorHasWork(pack.subcontractor) ||
    fcrHasWork(pack.fcr)
  );
}

export function jobCardPhaseStarts(schedule: unknown): JobCardFace["phaseStarts"] {
  const phases = liveJobSetupPhases(schedule as PhaseScheduleState | undefined);
  const seen = new Set<string>();
  const rows: JobCardFace["phaseStarts"] = [];
  for (const phase of phases) {
    const start = typeof phase.start === "string" ? phase.start : "";
    const label = formatJobCardDate(start);
    if (!start || !label) continue;
    const name = phase.name || PHASE_NAMES[phase.id] || phase.id;
    const key = `${phase.id}:${start}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ id: phase.id, name, start, startLabel: label });
  }
  return rows;
}

export function jobCardGrandTotal(pack?: EstimatePackSnapshot | null): number | null {
  if (!pack || isWakeIdentityOnly(pack) || !packHasBillableWork(pack)) return null;
  const total = deskPackageTotal({
    ...packSnapshotToXlsxInput(pack),
    changeOrders: fcrChangeOrderTotal(fcrFromUnknown(pack.fcr)),
  });
  if (!Number.isFinite(total)) return null;
  return Math.round(total * 100) / 100;
}

function jobCodeForCard(pack?: { packId?: string; code?: string } | null) {
  const coded = (pack?.code || "").trim().toUpperCase();
  if (/^EST-/.test(coded)) return coded;
  return jobCodeFromPackId(pack?.packId || "");
}

function statusForCard(
  pack?: { status?: string } | null,
  snapshot?: EstimatePackSnapshot | null,
) {
  const live = (pack?.status || "").trim();
  const stored = (snapshot?.status || "").trim();
  // Vault / collectPack wins when it has a real workflow status.
  // HIS awarded default Locked must not beat vault In progress.
  if (stored && stored !== "Draft") return stored;
  if (live) return live;
  return stored;
}

export function jobCardFace(
  pack?: (Pick<LocalPack, "packId" | "title" | "client" | "site"> & {
    status?: string;
    code?: string;
    jobNumber?: string;
    clientPoNumber?: string;
  }) | null,
  store?: StorageLike | null,
): JobCardFace {
  const jobCode = jobCodeForCard(pack);
  const jobNumber = awardedJobNumberForPack(pack, pack);
  const clientPoNumber = clientPoNumberForPack(pack, pack);
  if (!pack?.packId || !store) {
    return {
      ...EMPTY_FACE,
      statusLabel: (pack?.status || "").trim(),
      jobCode,
      jobNumber,
      clientPoNumber,
    };
  }
  const snapshot = collectPack(store, pack.packId);
  const meta = snapshot?.jobMeta as { jobNumber?: string; clientPoNumber?: string } | undefined;
  const liveJobNumber = awardedJobNumberForPack({ ...pack, jobNumber: pack.jobNumber }, meta);
  const liveClientPo = clientPoNumberForPack({ ...pack, clientPoNumber: pack.clientPoNumber }, meta);
  if (!snapshot) {
    return {
      ...EMPTY_FACE,
      statusLabel: (pack.status || "").trim(),
      jobCode,
      jobNumber: liveJobNumber,
      clientPoNumber: liveClientPo,
    };
  }
  const grandTotal = jobCardGrandTotal(snapshot);
  const phaseStarts = jobCardPhaseStarts(snapshot.schedule);
  return {
    grandTotal,
    grandTotalLabel: grandTotal == null ? "—" : formatJobCardMoney(grandTotal),
    phaseStarts,
    phaseStartsLabel: phaseStarts.length
      ? phaseStarts.map((row) => `${row.name} · ${row.startLabel}`).join(" · ")
      : scheduleHasWork(snapshot.schedule)
        ? "—"
        : "—",
    statusLabel: statusForCard(pack, snapshot),
    jobCode,
    jobNumber: liveJobNumber,
    clientPoNumber: liveClientPo,
  };
}
