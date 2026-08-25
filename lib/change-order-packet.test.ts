import assert from "node:assert/strict";
import { test } from "node:test";
import { fcrBlockFor, fcrSummary, mileageDollars, MILEAGE_YES_FLAT, peopleFromJob } from "./change-order-packet.ts";

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
  const rows = peopleFromJob([
    { id: "1", position: "Project Manager", shift: "Days", hours: { st: 40, ot: 0, dt: 0, pd: 5, hours: 40, workedDays: 5 } },
  ]);
  assert.equal(rows[0]?.block, "Staff Day");
  assert.equal(rows[0]?.daysPd, 5);
});
