import assert from "node:assert/strict";
import { test } from "node:test";
import { NOVUS_EMAIL, NOVUS_ID } from "./desk-role.ts";
import {
  followIdFromEmail,
  lensIdForSeat,
  lensPeopleFromSeats,
  mergeDeskPeople,
  personFromLensId,
  seededDeskPeople,
} from "./desk-people.ts";
import { SHANE_EMAIL, TESTER_SEATS } from "./tester-seats.ts";

const EXTRA = {
  id: "custom-added-tester",
  email: "added.tester@example.com",
  name: "Added Tester",
  role: "tester",
};

test("lens people include seeded testers and vault extras, never Novus", () => {
  const people = lensPeopleFromSeats([
    { id: "owner-robert-henderson", email: "robertmhenderson582@gmail.com", name: "Robert Henderson", role: "owner" },
    { id: NOVUS_ID, email: NOVUS_EMAIL, name: "Novus", role: "operator" },
    ...TESTER_SEATS.map((seat) => ({ id: seat.id, email: seat.email, name: seat.name, role: "tester" })),
    EXTRA,
  ]);
  assert.equal(people.some((row) => row.email === NOVUS_EMAIL), false);
  assert.equal(people.some((row) => row.id === NOVUS_ID || row.id === "novus"), false);
  assert.equal(people.some((row) => row.email === "robertmhenderson582@gmail.com"), false);
  assert.equal(people.some((row) => row.id === "nathan" && row.email === "nathanboyte@gmail.com"), true);
  assert.equal(people.some((row) => row.id === "joseph"), true);
  assert.equal(people.some((row) => row.email === SHANE_EMAIL), true);
  assert.equal(people.some((row) => row.id === EXTRA.id && row.email === EXTRA.email), true);
  assert.equal(people.some((row) => /stephanie/i.test(row.name) || /stephanie/i.test(row.email)), false);
  assert.equal(people.some((row) => /peffley/i.test(row.name) || /peffley/i.test(row.email)), false);
});

test("visual ids stay stable so stored View as / Follow lenses keep working", () => {
  assert.equal(lensIdForSeat({ id: "tester-nathan", email: "nathanboyte@gmail.com" }), "nathan");
  assert.equal(lensIdForSeat({ id: "tester-johnhenry", email: "johnhenry484@gmail.com" }), "tester-johnhenry");
  assert.equal(lensIdForSeat({ id: EXTRA.id, email: EXTRA.email }), EXTRA.id);
  assert.equal(followIdFromEmail("nathanboyte@gmail.com"), "nathan");
  assert.equal(followIdFromEmail(EXTRA.email, [EXTRA]), EXTRA.id);
  assert.equal(followIdFromEmail(NOVUS_EMAIL, [EXTRA]), undefined);
  assert.equal(personFromLensId("nathan")?.email, "nathanboyte@gmail.com");
  assert.equal(personFromLensId(EXTRA.id, [EXTRA])?.name, EXTRA.name);
});

test("seeded first paint lists testers and merge adds vault extras", () => {
  const seeded = seededDeskPeople();
  assert.equal(seeded.some((row) => row.id === "nathan"), true);
  assert.equal(seeded.some((row) => row.email === SHANE_EMAIL), true);
  assert.equal(seeded.some((row) => row.email === EXTRA.email), false);
  const merged = mergeDeskPeople([EXTRA]);
  assert.equal(merged.some((row) => row.email === EXTRA.email && row.id === EXTRA.id), true);
  assert.equal(merged.some((row) => row.email === NOVUS_EMAIL), false);
  assert.equal(TESTER_SEATS.some((row) => /peffley/i.test(row.email) || /peffley/i.test(row.name)), false);
});
