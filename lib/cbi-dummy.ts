import { CREW_STORE_PREFIX, PHASE_STORE_PREFIX, defaultPhaseSchedule } from "./phase-schedule.ts";
import { assignedCompanyId, type CompanyScope } from "./companies.ts";
import { rememberLocalPack, writeStoreJson, type LocalPack, type StorageLike } from "./local-estimates.ts";
import { JAMES_EMAIL } from "./tester-seats.ts";

/** Tiny CBI shop sketch on James’s seat. Cat 2 phase shape only. Made-up rates. */
export const CBI_DUMMY_PACK_ID = "new-cbi-shape-1";
export const CBI_DUMMY_TITLE = "Shop sketch";

export function cbiDummyPack(): LocalPack {
  return {
    packId: CBI_DUMMY_PACK_ID,
    key: `new:${CBI_DUMMY_PACK_ID}`,
    title: CBI_DUMMY_TITLE,
    client: "CBI",
    site: "Shop",
    siteId: "site-shop",
    createdAt: 1,
    updatedAt: 1,
    ownerEmail: JAMES_EMAIL,
    estimator: "James Cain",
  };
}

export function shouldSeedCbiDummy(scope?: CompanyScope | null): boolean {
  if (!scope || scope.isOwner) return false;
  if (scope.email.trim().toLowerCase() !== JAMES_EMAIL) return false;
  return assignedCompanyId(scope) === "cbi";
}

export function dummyPacksForUser(scope?: CompanyScope | null): LocalPack[] {
  return shouldSeedCbiDummy(scope) ? [cbiDummyPack()] : [];
}

function madeUpCrew() {
  return {
    staff: [],
    generalForeman: [],
    foreman: [],
    direct: [
      {
        id: "cbi-hand-1",
        position: "Shop hand",
        shift: "Days",
        st: 61,
        ot: 91.5,
        dt: 122,
        pd: 0,
        hours: 40,
        cost: "2440",
        clockOverride: "auto",
        laborClassOverride: null,
        ranges: [
          {
            id: "cbi-range-1",
            start: "2026-09-14",
            end: "2026-09-18",
            headcount: 2,
            nightHeadcount: 0,
            hoursPerShift: 8,
            perDiemPeople: 0,
            days: [false, true, true, true, true, true, false],
          },
        ],
      },
    ],
    support: [],
    otAfter8: false,
  };
}

/** Write the sketch locally so View-as-James can open it. Safe to call more than once. */
export function ensureCbiDummyPack(
  store: StorageLike | null = typeof window === "undefined" ? null : window.localStorage,
): LocalPack | null {
  if (!store) return null;
  const pack = cbiDummyPack();
  rememberLocalPack(
    {
      packId: pack.packId,
      title: pack.title,
      client: pack.client,
      site: pack.site,
      ownerEmail: pack.ownerEmail,
      estimator: pack.estimator,
    },
    store,
  );
  const key = pack.key;
  if (!store.getItem(`${PHASE_STORE_PREFIX}${key}`)) {
    const schedule = defaultPhaseSchedule();
    schedule.projectStart = "2026-09-14";
    schedule.phases = schedule.phases.map((phase) =>
      phase.id === "mech"
        ? { ...phase, on: true, start: "2026-09-14", stop: "2026-09-18", daysPerWeek: 5, hoursPerDay: 8 }
        : { ...phase, on: false },
    );
    writeStoreJson(store, `${PHASE_STORE_PREFIX}${key}`, schedule);
  }
  if (!store.getItem(`${CREW_STORE_PREFIX}${key}`)) {
    writeStoreJson(store, `${CREW_STORE_PREFIX}${key}`, madeUpCrew());
  }
  return pack;
}

export function mergeDummyPacks(packs: LocalPack[], scope?: CompanyScope | null): LocalPack[] {
  const extras = dummyPacksForUser(scope);
  if (!extras.length) return packs;
  const seen = new Set(packs.map((row) => row.packId));
  return [...packs, ...extras.filter((row) => !seen.has(row.packId))];
}
