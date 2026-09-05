"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  blankCraftRow,
  hydrateSupportLines,
  syncCraftRows,
  syncSupportRows,
  type CraftRow,
  type SupportLine,
} from "@/lib/craft-labor";
import {
  CREW_STORE_PREFIX,
  addUnit,
  applyOtPick,
  applyUnitOtPick,
  defaultPhaseSchedule,
  patchPhase,
  patchUnitPhase,
  readSchedule,
  removeUnit,
  renameUnit,
  setMultiUnits,
  setProjectStart,
  writeSchedule,
  type PhaseId,
  type PhaseOtPick,
  type PhaseRow,
  type PhaseScheduleState,
} from "@/lib/phase-schedule";
import { emptyJobMeta, readJobMeta, writeJobMeta, type JobMeta } from "@/lib/staffing-plan";
import { readActivities, writeActivities, type WorkActivity } from "@/lib/work-activities";
import { packIdFromStoreKey, findLocalPack, renameLocalPackTitle, touchLocalPack, writeLocalPackStatus } from "@/lib/local-estimates";
import {
  DEFAULT_ESTIMATE_STATUS,
  parseEstimateStatus,
  readEstimateStatus,
  writeEstimateStatus,
  type EstimateStatus,
} from "@/lib/estimate-status";
import { hydrateFromVault, flushVaultUpsert, scheduleVaultUpsert } from "@/lib/estimate-vault-client";
import { persistCrewTravel } from "@/lib/other-cost";
import { onEstimateSheets } from "@/lib/sheet-events";
import { emptyOrgChart, readOrgChart, writeOrgChart, type OrgChartState } from "@/lib/org-chart";

type CrewState = {
  staff: CraftRow[];
  generalForeman: CraftRow[];
  foreman: CraftRow[];
  direct: CraftRow[];
  support: SupportLine[];
  otAfter8: boolean;
};

type EstimatePackageApi = {
  estimateKey: string;
  schedule: PhaseScheduleState;
  crew: CrewState;
  jobMeta: JobMeta;
  activities: WorkActivity[];
  orgChart: OrgChartState;
  vaultSaveError: string;
  setProjectStartDate: (start: string) => void;
  patch: (id: PhaseId, next: Partial<PhaseRow>) => void;
  pickOt: (id: PhaseId, pick: PhaseOtPick) => void;
  setCrew: (next: CrewState | ((current: CrewState) => CrewState)) => void;
  replaceFromImport: (next: { schedule: PhaseScheduleState; crew: CrewState; title?: string }) => void;
  setOrgChart: (next: OrgChartState | ((current: OrgChartState) => OrgChartState)) => void;
  setJobMeta: (next: JobMeta | ((current: JobMeta) => JobMeta)) => void;
  status: EstimateStatus;
  setPackStatus: (status: EstimateStatus) => EstimateStatus | null;
  setPackTitle: (title: string) => string | null;
  setActivities: (next: WorkActivity[] | ((current: WorkActivity[]) => WorkActivity[])) => void;
  addCraftRow: () => CraftRow;
  setMultiUnitsOn: (on: boolean) => void;
  addJobUnit: () => void;
  removeJobUnit: (id: string) => void;
  renameJobUnit: (id: string, name: string) => void;
  patchUnit: (unitId: string, id: PhaseId, next: Partial<PhaseRow>) => void;
  pickUnitOt: (unitId: string, id: PhaseId, pick: PhaseOtPick) => void;
};

const EstimatePackageContext = createContext<EstimatePackageApi | null>(null);

function emptyCrew(): CrewState {
  return { staff: [], generalForeman: [], foreman: [], direct: [], support: [], otAfter8: false };
}

function readPackStatus(estimateKey: string): EstimateStatus {
  const packId = packIdFromStoreKey(estimateKey);
  if (!packId) return DEFAULT_ESTIMATE_STATUS;
  const local = findLocalPack(packId);
  if (local?.status) return parseEstimateStatus(local.status);
  return readEstimateStatus(packId);
}

/** Write missing pack status once so vault JSON becomes source of truth. */
function hydratePackStatus(estimateKey: string, status: EstimateStatus) {
  const packId = packIdFromStoreKey(estimateKey);
  if (!packId) return;
  const local = findLocalPack(packId);
  if (local?.status) {
    writeEstimateStatus(packId, parseEstimateStatus(local.status));
    return;
  }
  writeLocalPackStatus(packId, status);
  writeEstimateStatus(packId, status);
}

function readCrew(key: string): CrewState {
  if (typeof window === "undefined" || !key) return emptyCrew();
  try {
    const raw = window.localStorage.getItem(`${CREW_STORE_PREFIX}${key}`);
    if (!raw) return emptyCrew();
    const parsed = JSON.parse(raw) as Partial<CrewState>;
    return {
      staff: Array.isArray(parsed.staff) ? parsed.staff : [],
      generalForeman: Array.isArray(parsed.generalForeman) ? parsed.generalForeman : [],
      foreman: Array.isArray(parsed.foreman) ? parsed.foreman : [],
      direct: Array.isArray(parsed.direct) ? parsed.direct : [],
      support: hydrateSupportLines(parsed.support),
      otAfter8: Boolean(parsed.otAfter8),
    };
  } catch {
    return emptyCrew();
  }
}

function writeCrew(key: string, crew: CrewState) {
  if (typeof window === "undefined" || !key) return;
  try {
    window.localStorage.setItem(`${CREW_STORE_PREFIX}${key}`, JSON.stringify(crew));
  } catch {
    // keep the previous copy
  }
}

function syncCrew(crew: CrewState, schedule: PhaseScheduleState): CrewState {
  const phases = schedule.phases;
  const units = schedule.units ?? [];
  const multi = Boolean(schedule.multiUnits);
  return {
    ...crew,
    staff: syncCraftRows(crew.staff, phases, units, multi),
    generalForeman: syncCraftRows(crew.generalForeman, phases, units, multi),
    foreman: syncCraftRows(crew.foreman, phases, units, multi),
    direct: syncCraftRows(crew.direct, phases, units, multi),
    support: syncSupportRows(crew.support, phases, units, multi),
  };
}

export function EstimatePackageProvider({
  estimateKey,
  children,
}: {
  estimateKey: string;
  children: React.ReactNode;
}) {
  const [schedule, setSchedule] = useState<PhaseScheduleState>(() => readSchedule(estimateKey));
  const [crew, setCrewState] = useState<CrewState>(() => syncCrew(readCrew(estimateKey), readSchedule(estimateKey)));
  const [orgChart, setOrgChartState] = useState<OrgChartState>(() => readOrgChart(estimateKey));
  const [jobMeta, setJobMetaState] = useState<JobMeta>(() => readJobMeta(estimateKey));
  const [activities, setActivitiesState] = useState<WorkActivity[]>(() => readActivities(estimateKey) ?? []);
  const [status, setStatusState] = useState<EstimateStatus>(() => readPackStatus(estimateKey));
  const [ready, setReady] = useState(false);
  const [vaultSaveError, setVaultSaveError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    const packId = packIdFromStoreKey(estimateKey);
    const boot = packId ? hydrateFromVault() : Promise.resolve([]);
    void boot.finally(() => {
      if (cancelled) return;
      const next = readSchedule(estimateKey);
      setSchedule(next);
      setCrewState(syncCrew(readCrew(estimateKey), next));
      setOrgChartState(readOrgChart(estimateKey));
      setJobMetaState(readJobMeta(estimateKey));
      setActivitiesState(readActivities(estimateKey) ?? []);
      const nextStatus = readPackStatus(estimateKey);
      setStatusState(nextStatus);
      hydratePackStatus(estimateKey, nextStatus);
      setReady(true);
      if (packId) {
        void flushVaultUpsert(packId).then((result) => {
          if (cancelled) return;
          if (!result.ok && "error" in result && result.error) setVaultSaveError(result.error);
          else setVaultSaveError("");
        });
      }
    });
    return () => {
      cancelled = true;
      if (packId) void flushVaultUpsert(packId);
    };
  }, [estimateKey]);

  useEffect(() => {
    if (!ready) return;
    writeSchedule(estimateKey, schedule);
    const packId = packIdFromStoreKey(estimateKey);
    if (packId) {
      touchLocalPack(packId);
      scheduleVaultUpsert(packId);
    }
  }, [estimateKey, ready, schedule]);

  useEffect(() => {
    if (!ready) return;
    writeCrew(estimateKey, crew);
    persistCrewTravel(estimateKey, crew, {
      staffPerMile: jobMeta.staffMileageRate,
      craftPerMile: jobMeta.craftMileageRate,
    });
    const packId = packIdFromStoreKey(estimateKey);
    if (packId) {
      touchLocalPack(packId);
      scheduleVaultUpsert(packId);
    }
  }, [crew, estimateKey, jobMeta.craftMileageRate, jobMeta.staffMileageRate, ready]);

  useEffect(() => {
    if (!ready) return;
    writeOrgChart(estimateKey, orgChart);
    const packId = packIdFromStoreKey(estimateKey);
    if (packId) {
      touchLocalPack(packId);
      scheduleVaultUpsert(packId);
    }
  }, [estimateKey, orgChart, ready]);

  useEffect(() => {
    if (!ready) return;
    writeJobMeta(estimateKey, jobMeta);
    const packId = packIdFromStoreKey(estimateKey);
    if (packId) {
      touchLocalPack(packId);
      scheduleVaultUpsert(packId);
    }
  }, [estimateKey, jobMeta, ready]);

  useEffect(() => {
    if (!ready) return;
    writeActivities(estimateKey, activities);
    const packId = packIdFromStoreKey(estimateKey);
    if (packId) {
      touchLocalPack(packId);
      scheduleVaultUpsert(packId);
    }
  }, [activities, estimateKey, ready]);

  useEffect(() => {
    if (!ready) return;
    const packId = packIdFromStoreKey(estimateKey);
    if (!packId) return;
    return onEstimateSheets(() => {
      touchLocalPack(packId);
      scheduleVaultUpsert(packId);
    });
  }, [estimateKey, ready]);

  const api = useMemo<EstimatePackageApi>(
    () => ({
      estimateKey,
      schedule,
      crew,
      orgChart,
      vaultSaveError,
      jobMeta,
      activities,
      status,
      setProjectStartDate(start) {
        setSchedule((current) => {
          const next = setProjectStart(current, start);
          setCrewState((existing) => syncCrew(existing, next));
          return next;
        });
      },
      patch(id, next) {
        setSchedule((current) => {
          const updated = patchPhase(current, id, next);
          setCrewState((existing) => syncCrew(existing, updated));
          return updated;
        });
      },
      pickOt(id, pick) {
        setSchedule((current) => {
          const updated = applyOtPick(current, id, pick);
          setCrewState((existing) => syncCrew(existing, updated));
          return updated;
        });
      },
      setMultiUnitsOn(on) {
        setSchedule((current) => {
          const updated = setMultiUnits(current, on);
          setCrewState((existing) => syncCrew(existing, updated));
          return updated;
        });
      },
      addJobUnit() {
        setSchedule((current) => {
          const updated = addUnit(current);
          setCrewState((existing) => syncCrew(existing, updated));
          return updated;
        });
      },
      removeJobUnit(id) {
        setSchedule((current) => {
          const updated = removeUnit(current, id);
          setCrewState((existing) => syncCrew(existing, updated));
          return updated;
        });
      },
      renameJobUnit(id, name) {
        setSchedule((current) => renameUnit(current, id, name));
      },
      patchUnit(unitId, id, next) {
        setSchedule((current) => {
          const updated = patchUnitPhase(current, unitId, id, next);
          setCrewState((existing) => syncCrew(existing, updated));
          return updated;
        });
      },
      pickUnitOt(unitId, id, pick) {
        setSchedule((current) => {
          const updated = applyUnitOtPick(current, unitId, id, pick);
          setCrewState((existing) => syncCrew(existing, updated));
          return updated;
        });
      },
      setCrew(next) {
        setCrewState((current) => (typeof next === "function" ? next(current) : next));
      },
      replaceFromImport(next) {
        setSchedule(next.schedule);
        setCrewState({
          staff: next.crew.staff ?? [],
          generalForeman: next.crew.generalForeman ?? [],
          foreman: next.crew.foreman ?? [],
          direct: next.crew.direct ?? [],
          support: hydrateSupportLines(next.crew.support),
          otAfter8: Boolean(next.crew.otAfter8),
        });
        if (next.title) {
          const packId = packIdFromStoreKey(estimateKey);
          if (packId) {
            renameLocalPackTitle(packId, next.title);
            touchLocalPack(packId);
            scheduleVaultUpsert(packId);
          }
        }
      },
      setOrgChart(next) {
        setOrgChartState((current) => (typeof next === "function" ? next(current) : next));
      },
      setJobMeta(next) {
        setJobMetaState((current) => (typeof next === "function" ? next(current) : next));
      },
      setPackStatus(next) {
        const parsed = parseEstimateStatus(next);
        setStatusState(parsed);
        const packId = packIdFromStoreKey(estimateKey);
        if (!packId) return parsed;
        const saved = writeLocalPackStatus(packId, parsed);
        writeEstimateStatus(packId, parsed);
        if (saved) {
          touchLocalPack(packId);
          scheduleVaultUpsert(packId);
          return saved.status ?? parsed;
        }
        return parsed;
      },
      setPackTitle(title) {
        const packId = packIdFromStoreKey(estimateKey);
        if (!packId) return null;
        const renamed = renameLocalPackTitle(packId, title);
        if (renamed) {
          touchLocalPack(packId);
          scheduleVaultUpsert(packId);
          return renamed.title;
        }
        return null;
      },
      setActivities(next) {
        setActivitiesState((current) => (typeof next === "function" ? next(current) : next));
      },
      addCraftRow() {
        return blankCraftRow();
      },
    }),
    [activities, crew, estimateKey, jobMeta, orgChart, schedule, status, vaultSaveError],
  );

  return <EstimatePackageContext.Provider value={api}>{children}</EstimatePackageContext.Provider>;
}

export function useEstimatePackage() {
  const ctx = useContext(EstimatePackageContext);
  if (!ctx) {
    return {
      estimateKey: "",
      schedule: defaultPhaseSchedule(),
      crew: emptyCrew(),
      orgChart: emptyOrgChart(),
      vaultSaveError: "",
      jobMeta: emptyJobMeta(),
      activities: [],
      setProjectStartDate() {},
      patch() {},
      pickOt() {},
      setCrew() {},
      replaceFromImport() {},
      setOrgChart() {},
      setJobMeta() {},
      status: DEFAULT_ESTIMATE_STATUS,
      setPackStatus() {
        return null;
      },
      setPackTitle() {
        return null;
      },
      setActivities() {},
      addCraftRow: () => blankCraftRow(),
      setMultiUnitsOn() {},
      addJobUnit() {},
      removeJobUnit() {},
      renameJobUnit() {},
      patchUnit() {},
      pickUnitOt() {},
    } satisfies EstimatePackageApi;
  }
  return ctx;
}
