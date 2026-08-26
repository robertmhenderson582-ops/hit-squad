import { writeActivities } from "./work-activities.ts";
import { writeEquipmentSheet } from "./equipment-sheet.ts";
import { writeFcrPacket } from "./change-order-packet.ts";
import { writeJobMeta } from "./staffing-plan.ts";
import { writeOtherCost } from "./other-cost.ts";
import { writeSchedule } from "./phase-schedule.ts";
import {
  EXAMPLE_TEMPLATE_IDS,
  examplePackage,
  isExampleTemplateId,
  type ExampleTemplateId,
} from "./example-packages.ts";

export const PACKAGE_STATUSES = ["Estimate", "Submitted", "Awarded", "Execute", "Close out"] as const;
export type PackageStatus = (typeof PACKAGE_STATUSES)[number];

export type SeatEstimate = {
  id: string;
  templateId: ExampleTemplateId;
  code: string;
  title: string;
  client: string;
  siteId: string;
  siteName: string;
  unit: string;
  type: "T&M" | "Hybrid" | "Lump sum";
  window: string;
  revision: string;
  total: string;
  estimator: string;
  status: PackageStatus;
  archived: boolean;
  deleted: boolean;
};

export const SEAT_ESTIMATE_PREFIX = "hs_seat_estimates_v1:";
export const SEEDED_SHEET_PREFIX = "hs_example_seeded_v1:";
export const CREW_STORE_PREFIX = "hs_crew_v1:";

export function copyId(seatId: string, templateId: ExampleTemplateId) {
  return `${seatId}:${templateId}`;
}

export function folderIsLocked(status: PackageStatus, kind: "example" | "new" = "example") {
  if (kind === "new") return false;
  return status === "Estimate" || status === "Submitted" || status === "Close out";
}

export function showsAwardFields(status: PackageStatus) {
  return status === "Awarded" || status === "Execute" || status === "Close out";
}

export function workingCopies(list: SeatEstimate[]) {
  return list.filter((row) => !row.deleted && !row.archived);
}

export function archivedCopies(list: SeatEstimate[]) {
  return list.filter((row) => !row.deleted && row.archived);
}

export function archiveCopy(list: SeatEstimate[], id: string) {
  return list.map((row) => (row.id === id ? { ...row, archived: true } : row));
}

export function restoreCopy(list: SeatEstimate[], id: string) {
  return list.map((row) => (row.id === id ? { ...row, archived: false } : row));
}

export function deleteCopy(list: SeatEstimate[], id: string) {
  return list.map((row) => (row.id === id ? { ...row, deleted: true } : row));
}

export function setCopyStatus(list: SeatEstimate[], id: string, status: PackageStatus) {
  return list.map((row) => (row.id === id ? { ...row, status } : row));
}

export function findCopy(list: SeatEstimate[], id: string) {
  return list.find((row) => !row.deleted && (row.id === id || row.templateId === id));
}

function buildCopy(seatId: string, seatName: string, templateId: ExampleTemplateId): SeatEstimate {
  const pack = examplePackage(templateId);
  return {
    id: copyId(seatId, templateId),
    templateId,
    code: pack.code,
    title: pack.title,
    client: pack.client,
    siteId: pack.siteId,
    siteName: pack.siteName,
    unit: pack.unit,
    type: pack.type,
    window: pack.window,
    revision: pack.revision,
    total: pack.totalLabel,
    estimator: seatName,
    status: "Estimate",
    archived: false,
    deleted: false,
  };
}

export function seedSeatList(seatId: string, seatName: string): SeatEstimate[] {
  return EXAMPLE_TEMPLATE_IDS.map((templateId) => buildCopy(seatId, seatName, templateId));
}

function storage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readSeatEstimates(seatId: string): SeatEstimate[] | null {
  const store = storage();
  if (!store || !seatId) return null;
  try {
    const raw = store.getItem(`${SEAT_ESTIMATE_PREFIX}${seatId}`);
    if (raw == null) return null;
    const parsed = JSON.parse(raw) as SeatEstimate[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeSeatEstimates(seatId: string, list: SeatEstimate[]) {
  const store = storage();
  if (!store || !seatId) return;
  try {
    store.setItem(`${SEAT_ESTIMATE_PREFIX}${seatId}`, JSON.stringify(list));
  } catch {
    // keep the previous copy
  }
}

export function writeExampleSheets(key: string, templateId: ExampleTemplateId) {
  const pack = examplePackage(templateId);
  const store = storage();
  writeSchedule(key, pack.schedule);
  writeJobMeta(key, pack.jobMeta);
  writeActivities(key, pack.activities);
  writeEquipmentSheet(key, pack.equipment);
  writeOtherCost(key, pack.otherCost);
  writeFcrPacket(key, pack.fcr);
  if (store) {
    try {
      store.setItem(`${CREW_STORE_PREFIX}${key}`, JSON.stringify(pack.crew));
      store.setItem(`${SEEDED_SHEET_PREFIX}${key}`, "1");
    } catch {
      // keep the previous copy
    }
  }
}

export function seedExampleSheetsOnce(key: string, templateId: ExampleTemplateId) {
  if (!key || key.startsWith("new:")) return false;
  const store = storage();
  if (store?.getItem(`${SEEDED_SHEET_PREFIX}${key}`)) return false;
  writeExampleSheets(key, templateId);
  return true;
}

export function ensureSeatEstimates(seatId: string, seatName: string): SeatEstimate[] {
  const existing = readSeatEstimates(seatId);
  if (existing) return existing;
  const list = seedSeatList(seatId, seatName);
  for (const row of list) seedExampleSheetsOnce(row.id, row.templateId);
  writeSeatEstimates(seatId, list);
  return list;
}

export function templateIdFromCopyId(id: string): ExampleTemplateId | undefined {
  const tail = id.includes(":") ? id.slice(id.lastIndexOf(":") + 1) : id;
  return isExampleTemplateId(tail) ? tail : isExampleTemplateId(id) ? id : undefined;
}

export function resetSeatEstimatesForTests() {
  const store = storage();
  if (!store) return;
  const keys: string[] = [];
  for (let i = 0; i < store.length; i += 1) {
    const key = store.key(i);
    if (
      key &&
      (key.startsWith(SEAT_ESTIMATE_PREFIX) ||
        key.startsWith(SEEDED_SHEET_PREFIX) ||
        key.startsWith(CREW_STORE_PREFIX) ||
        key.startsWith("hs_phase_v1:") ||
        key.startsWith("hs_job_v1:") ||
        key.startsWith("hs_activity_v1:") ||
        key.startsWith("hs_equip_v1:") ||
        key.startsWith("hs_other_v1:") ||
        key.startsWith("hs_fcr_v1:"))
    ) {
      keys.push(key);
    }
  }
  for (const key of keys) store.removeItem(key);
}
