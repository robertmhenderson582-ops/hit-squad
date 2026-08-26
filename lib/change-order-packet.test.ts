import assert from "node:assert/strict";
import { test } from "node:test";
import {
  APPROVAL_STATUSES,
  blankLogRow,
  emptyFcrHeader,
  emptyScr,
  emptyWeek,
  fcrBlockFor,
  fcrSummary,
  FCR_BLOCKS,
  IMPACT_LEVELS,
  LOG_STATUSES,
  mileageDollars,
  MILEAGE_YES_FLAT,
  peopleFromJob,
  peopleHours,
} from "./change-order-packet.ts";

const WOOD = "Wood River — Roxana, IL";
const P66 = "Phillips 66";

function range(partial: {
  start: string;
  end: string;
  hoursPerShift: number;
  days?: boolean[];
  headcount?: number;
  nightHeadcount?: number;
  perDiemPeople?: number;
  nightPerDiemPeople?: number;
}) {
  return {
    start: partial.start,
    end: partial.end,
    hoursPerShift: partial.hoursPerShift,
    headcount: partial.headcount ?? 1,
    nightHeadcount: partial.nightHeadcount ?? 0,
    perDiemPeople: partial.perDiemPeople ?? 1,
    nightPerDiemPeople: partial.nightPerDiemPeople ?? 0,
    days: partial.days ?? [false, true, true, true, true, true, false],
  };
}

test("V1 on-job packet shape stays locked to the Drive books", () => {
  assert.deepEqual([...LOG_STATUSES], ["Open", "Pending", "Cancelled"]);
  assert.deepEqual([...IMPACT_LEVELS], ["Low", "High", "Critical"]);
  assert.deepEqual([...APPROVAL_STATUSES], ["Approved", "Pending"]);
  assert.deepEqual([...FCR_BLOCKS], ["Staff Day", "Staff Night", "Craft Day", "Craft Night"]);
  assert.deepEqual(Object.keys(emptyFcrHeader()), [
    "pm",
    "costTracker",
    "publishDate",
    "nte",
    "projectScope",
  ]);
  assert.deepEqual(Object.keys(blankLogRow()).filter((key) => key !== "id"), [
    "scr",
    "requestDate",
    "requestedBy",
    "reviewedBy",
    "status",
    "scope",
    "impact",
    "impactLevel",
    "approvedBy",
    "approvalStatus",
    "approvalDate",
    "approvedMh",
    "approvedCost",
    "planChanges",
    "revisedComp",
    "notes",
    "loggedBy",
  ]);
  assert.deepEqual(Object.keys(emptyScr()), [
    "taRm",
    "categories",
    "moc",
    "sap",
    "costNote",
    "scheduleNote",
    "signOff",
  ]);
});

test("mileage Yes is a flat $2500, never times headcount", () => {
  assert.equal(MILEAGE_YES_FLAT, 2500);
  assert.equal(mileageDollars(true), 2500);
  assert.equal(mileageDollars(false), 0);
  const packet = {
    header: { pm: "", costTracker: "", publishDate: "", nte: "", projectScope: "" },
    log: [],
    people: [
      {
        id: "a",
        block: "Craft Day" as const,
        position: "Boilermaker Journeyman",
        weeks: 1,
        mileage: true,
        daysPd: 0,
        headcount: 2,
        week: emptyWeek(),
        st: 0,
        ot: 0,
        dt: 0,
      },
      {
        id: "b",
        block: "Craft Day" as const,
        position: "Pipefitter Journeyman",
        weeks: 1,
        mileage: true,
        daysPd: 0,
        headcount: 2,
        week: emptyWeek(),
        st: 0,
        ot: 0,
        dt: 0,
      },
    ],
    sub: 0,
    equipment: 0,
    misc: 0,
    scr: { taRm: "", categories: "", moc: "", sap: "", costNote: "", scheduleNote: "", signOff: "" },
  };
  assert.equal(fcrSummary(packet).mileage, 5000);
});

test("people land on Staff/Craft Day/Night from this job", () => {
  assert.equal(fcrBlockFor("Cost Analyst", "Days"), "Staff Day");
  assert.equal(fcrBlockFor("Superintendent", "Nights"), "Staff Night");
  assert.equal(fcrBlockFor("Boilermaker Journeyman", "Days"), "Craft Day");
  assert.equal(fcrBlockFor("Boilermaker Journeyman", "Days & nights"), "Craft Day");
  const rows = peopleFromJob([
    { id: "1", position: "Project Manager", shift: "Days", hours: { st: 40, ot: 0, dt: 0, pd: 5, hours: 40, workedDays: 5 } },
  ]);
  assert.equal(rows[0]?.block, "Staff Day");
  assert.equal(rows[0]?.daysPd, 5);
});

test("10s are Mon–Fri ST; 12s are 10+2; East Coast never DT after 12", () => {
  const tens = peopleFromJob(
    [
      {
        id: "10s",
        position: "Boilermaker Journeyman",
        shift: "Days",
        ranges: [range({ start: "2026-09-07", end: "2026-09-11", hoursPerShift: 10 })],
      },
    ],
    WOOD,
    P66,
  );
  assert.equal(tens[0]?.week.mo.st, 10);
  assert.equal(tens[0]?.week.th.st, 10);
  assert.equal(tens[0]?.week.fr.ot, 10);
  assert.equal(tens[0]?.week.sa.st + tens[0]?.week.sa.ot + tens[0]?.week.sa.dt, 0);
  assert.equal(tens[0]?.st, 40);
  assert.equal(tens[0]?.ot, 10);

  const twelves = peopleFromJob(
    [
      {
        id: "12s",
        position: "Pipefitter Journeyman",
        shift: "Days",
        ranges: [range({ start: "2026-09-07", end: "2026-09-11", hoursPerShift: 12 })],
      },
    ],
    WOOD,
    P66,
  );
  assert.equal(twelves[0]?.week.mo.st, 10);
  assert.equal(twelves[0]?.week.mo.ot, 2);
  assert.equal(twelves[0]?.week.mo.dt, 0);
  assert.equal(twelves[0]?.dt, 0);
});

test("Sat expands to OT after weekly 40; Sunday is DT", () => {
  const rows = peopleFromJob(
    [
      {
        id: "wknd",
        position: "Welder",
        shift: "Days",
        ranges: [
          range({
            start: "2026-09-07",
            end: "2026-09-13",
            hoursPerShift: 10,
            days: [true, true, true, true, true, true, true],
          }),
        ],
      },
    ],
    WOOD,
    P66,
  );
  assert.equal(rows[0]?.week.sa.ot, 10);
  assert.equal(rows[0]?.week.su.dt, 10);
  assert.equal(rows[0]?.dt, 10);
});

test("Days & nights splits into Day and Night blocks from this job", () => {
  const rows = peopleFromJob(
    [
      {
        id: "dual",
        position: "Boilermaker Journeyman",
        shift: "Days & nights",
        ranges: [
          range({
            start: "2026-09-07",
            end: "2026-09-07",
            hoursPerShift: 10,
            days: [false, true, false, false, false, false, false],
            headcount: 1,
            nightHeadcount: 1,
            perDiemPeople: 1,
            nightPerDiemPeople: 1,
          }),
        ],
      },
    ],
    WOOD,
    P66,
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.block, "Craft Day");
  assert.equal(rows[1]?.block, "Craft Night");
  assert.equal(rows[0]?.week.mo.st, 10);
  assert.equal(rows[1]?.week.mo.st, 10);
});

test("summary uses this job hours and PD, not a shipped rate tab", () => {
  const people = peopleFromJob(
    [
      {
        id: "pm",
        position: "Project Manager",
        shift: "Days",
        ranges: [range({ start: "2026-09-07", end: "2026-09-11", hoursPerShift: 10, perDiemPeople: 1 })],
      },
    ],
    WOOD,
    P66,
  );
  people[0].mileage = true;
  const summary = fcrSummary(
    {
      header: { pm: "", costTracker: "", publishDate: "", nte: "", projectScope: "" },
      log: [],
      people,
      sub: 100,
      equipment: 50,
      misc: 25,
      scr: { taRm: "", categories: "", moc: "", sap: "", costNote: "", scheduleNote: "", signOff: "" },
    },
    0,
    185,
  );
  assert.equal(summary.staffHours, 50);
  assert.equal(summary.staffLabor, 0);
  assert.equal(summary.craftLabor, 0);
  assert.equal(summary.perDiem, 5 * 185);
  assert.equal(summary.mileage, 2500);
  assert.equal(summary.sub, 100);
  assert.equal(peopleHours(people[0]), 50);
});
