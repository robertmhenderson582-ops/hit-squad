"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  blankCraftRow,
  craftRowFromPhases,
  syncCraftRows,
  type CraftRow,
} from "@/lib/craft-labor";
import {
  CREW_STORE_PREFIX,
  applyOtPick,
  defaultPhaseSchedule,
  patchPhase,
  readSchedule,
  setProjectStart,
  writeSchedule,
  type PhaseId,
  type PhaseOtPick,
  type PhaseRow,
  type PhaseScheduleState,
} from "@/lib/phase-schedule";
import { emptyJobMeta, readJobMeta, writeJobMeta, type JobMeta } from "@/lib/staffing-plan";
import { readActivities, writeActivities, type WorkActivity } from "@/lib/work-activities";
import type { SupportLine } from "@/components/SupportCrewCard";

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
  setProjectStartDate: (start: string) => void;
  patch: (id: PhaseId, next: Partial<PhaseRow>) => void;
  pickOt: (id: PhaseId, pick: PhaseOtPick) => void;
  setCrew: (next: CrewState | ((current: CrewState) => CrewState)) => void;
  setJobMeta: (next: JobMeta | ((current: JobMeta) => JobMeta)) => void;
  setActivities: (next: WorkActivity[] | ((current: WorkActivity[]) => WorkActivity[])) => void;
  addCraftRow: () => CraftRow;
};

const EstimatePackageContext = createContext<EstimatePackageApi | null>(null);

function emptyCrew(): CrewState {
  return { staff: [], generalForeman: [], foreman: [], direct: [], support: [], otAfter8: false };
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
      support: Array.isArray(parsed.support) ? parsed.support : [],
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

function syncCrew(crew: CrewState, phases: PhaseRow[]): CrewState {
  return {
    ...crew,
    staff: syncCraftRows(crew.staff, phases),
    generalForeman: syncCraftRows(crew.generalForeman, phases),
    foreman: syncCraftRows(crew.foreman, phases),
    direct: syncCraftRows(crew.direct, phases),
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
  const [crew, setCrewState] = useState<CrewState>(() => syncCrew(readCrew(estimateKey), readSchedule(estimateKey).phases));
  const [jobMeta, setJobMetaState] = useState<JobMeta>(() => readJobMeta(estimateKey));
  const [activities, setActivitiesState] = useState<WorkActivity[]>(() => readActivities(estimateKey) ?? []);

  useEffect(() => {
    const next = readSchedule(estimateKey);
    setSchedule(next);
    setCrewState(syncCrew(readCrew(estimateKey), next.phases));
    setJobMetaState(readJobMeta(estimateKey));
    setActivitiesState(readActivities(estimateKey) ?? []);
  }, [estimateKey]);

  useEffect(() => {
    writeSchedule(estimateKey, schedule);
  }, [estimateKey, schedule]);

  useEffect(() => {
    writeCrew(estimateKey, crew);
  }, [crew, estimateKey]);

  useEffect(() => {
    writeJobMeta(estimateKey, jobMeta);
  }, [estimateKey, jobMeta]);

  useEffect(() => {
    writeActivities(estimateKey, activities);
  }, [activities, estimateKey]);

  const api = useMemo<EstimatePackageApi>(
    () => ({
      estimateKey,
      schedule,
      crew,
      jobMeta,
      activities,
      setProjectStartDate(start) {
        setSchedule((current) => {
          const next = setProjectStart(current, start);
          setCrewState((existing) => syncCrew(existing, next.phases));
          return next;
        });
      },
      patch(id, next) {
        setSchedule((current) => {
          const updated = patchPhase(current, id, next);
          setCrewState((existing) => syncCrew(existing, updated.phases));
          return updated;
        });
      },
      pickOt(id, pick) {
        setSchedule((current) => {
          const updated = applyOtPick(current, id, pick);
          setCrewState((existing) => syncCrew(existing, updated.phases));
          return updated;
        });
      },
      setCrew(next) {
        setCrewState((current) => (typeof next === "function" ? next(current) : next));
      },
      setJobMeta(next) {
        setJobMetaState((current) => (typeof next === "function" ? next(current) : next));
      },
      setActivities(next) {
        setActivitiesState((current) => (typeof next === "function" ? next(current) : next));
      },
      addCraftRow() {
        return craftRowFromPhases(schedule.phases);
      },
    }),
    [activities, crew, estimateKey, jobMeta, schedule],
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
      jobMeta: emptyJobMeta(),
      activities: [],
      setProjectStartDate() {},
      patch() {},
      pickOt() {},
      setCrew() {},
      setJobMeta() {},
      setActivities() {},
      addCraftRow: () => blankCraftRow(),
    } satisfies EstimatePackageApi;
  }
  return ctx;
}
