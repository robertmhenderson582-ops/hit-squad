import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { deskPackageTotal } from "./estimate-desk-total.ts";
import { packSnapshotToXlsxInput } from "./estimate-pack-xlsx.ts";
import {
  formatJobCardDate,
  formatJobCardMoney,
  jobCardFace,
  jobCardGrandTotal,
  jobCardPhaseStarts,
  packHasBillableWork,
} from "./job-card-face.ts";
import { PACK_INDEX_KEY, PACK_STORE_PREFIX } from "./local-estimates.ts";
import { CREW_STORE_PREFIX, PHASE_STORE_PREFIX } from "./phase-schedule.ts";
import { RODEO_U110_PACK_ID } from "./rodeo-monroe-wake.ts";

function memoryStore(seed: Record<string, string> = {}) {
  const data = { ...seed };
  return {
    getItem(key: string) {
      return key in data ? data[key] : null;
    },
    setItem(key: string, value: string) {
      data[key] = value;
    },
  };
}

const liveCrew = {
  staff: [],
  generalForeman: [],
  foreman: [],
  direct: [
    {
      id: "bm-1",
      position: "Boilermaker Journeyman",
      shift: "Days",
      ranges: [
        {
          start: "2026-01-12",
          end: "2026-01-16",
          hoursPerShift: 10,
          headcount: 2,
          nightHeadcount: 0,
          perDiemPeople: 0,
          days: [true, true, true, true, true, false, false],
        },
      ],
    },
  ],
  support: [],
};

const liveSchedule = {
  projectStart: "2026-01-11",
  multiUnits: false,
  units: [],
  phases: [
    {
      id: "pre",
      name: "Pre-Turnaround",
      on: true,
      start: "2026-01-11",
      stop: "2026-01-15",
      daysPerWeek: 5,
      hoursPerDay: 8,
      otAfter8: true,
      sundaysOff: [],
    },
    {
      id: "mech",
      name: "Mechanical Window",
      on: true,
      start: "2026-01-16",
      stop: "2026-01-20",
      daysPerWeek: 5,
      hoursPerDay: 10,
      otAfter8: true,
      sundaysOff: [],
    },
  ],
};

describe("job card face", () => {
  it("formats money and phase starts from live pack sheets and does not invent a total", () => {
    assert.equal(formatJobCardMoney(2410000), "$2,410,000.00");
    assert.equal(formatJobCardDate("2026-01-11"), "Jan 11, 2026");
    assert.equal(formatJobCardDate("not-a-date"), "");
    const starts = jobCardPhaseStarts(liveSchedule);
    assert.deepEqual(
      starts.map((row) => `${row.name}:${row.start}`),
      ["Pre-Turnaround:2026-01-11", "Mechanical Window:2026-01-16"],
    );
    assert.equal(packHasBillableWork({ packId: "new-cat2", crew: liveCrew }), true);
    assert.equal(packHasBillableWork({ packId: "new-empty" }), false);
    const snap = {
      packId: "new-cat2pit",
      key: "new:new-cat2pit",
      title: "Madison CAT 2",
      client: "Phillips 66",
      site: "Wood River — Roxana, IL",
      siteId: "site-madison",
      createdAt: 10,
      updatedAt: 20,
      crew: liveCrew,
      schedule: liveSchedule,
    };
    const total = jobCardGrandTotal(snap);
    assert.equal(total, deskPackageTotal(packSnapshotToXlsxInput(snap)));
    assert.equal(total == null || total > 0, true);
    assert.equal(jobCardGrandTotal({ ...snap, crew: undefined }), null);
    assert.equal(
      jobCardGrandTotal({
        packId: RODEO_U110_PACK_ID,
        key: `new:${RODEO_U110_PACK_ID}`,
        title: "Rodeo U110",
        client: "Phillips 66",
        site: "Rodeo",
        siteId: "site-rodeo",
        createdAt: 1,
        updatedAt: 1,
        crew: liveCrew,
      }),
      null,
    );
  });

  it("reads the hydrated local pack on the Jobs card and stays blank without sheets", () => {
    const packId = "new-cat2pit";
    const key = `new:${packId}`;
    const identity = {
      packId,
      key,
      title: "Madison CAT 2",
      client: "Phillips 66",
      site: "Wood River — Roxana, IL",
      siteId: "site-madison",
      createdAt: 10,
      updatedAt: 20,
    };
    const store = memoryStore({
      [PACK_INDEX_KEY]: JSON.stringify([identity]),
      [`${PACK_STORE_PREFIX}${key}`]: JSON.stringify(identity),
      [`${CREW_STORE_PREFIX}${key}`]: JSON.stringify(liveCrew),
      [`${PHASE_STORE_PREFIX}${key}`]: JSON.stringify(liveSchedule),
    });
    const face = jobCardFace(identity, store);
    assert.equal(face.grandTotal == null || face.grandTotal > 0, true);
    assert.match(face.grandTotalLabel, /^\$/);
    assert.match(face.phaseStartsLabel, /Pre-Turnaround · Jan 11, 2026/);
    assert.match(face.phaseStartsLabel, /Mechanical Window · Jan 16, 2026/);
    assert.equal(jobCardFace(identity, memoryStore()).grandTotalLabel, "—");
    assert.equal(jobCardFace(null, store).grandTotalLabel, "—");

    const tree = readFileSync(fileURLToPath(new URL("../components/JobTreeDesk.tsx", import.meta.url)), "utf8");
    assert.match(tree, /jobCardFace/);
    assert.match(tree, /GRAND TOTAL/);
    assert.match(tree, /PHASE STARTS/);
  });
});
