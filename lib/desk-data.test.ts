import assert from "node:assert/strict";
import { test } from "node:test";
import { boardForUser } from "./desk-data.ts";
import { seedSeatList } from "./seat-estimates.ts";

const DEMO_CODES = ["EST-2609-U3", "EST-2610-CKR", "EST-2608-CT"];
const PLANTS = ["Yates", "Rodeo", "Bayway", "Ferndale", "Wood River", "Billings"];

test("owner and tester boards do not carry the dummy estimate blotter", () => {
  for (const userId of ["owner-robert-henderson", "tester-joseph-look"]) {
    const board = boardForUser(userId);
    assert.deepEqual(board.estimates, []);
    assert.deepEqual(board.crews, []);
    assert.deepEqual(board.activities, []);
    assert.deepEqual(board.changeOrders, []);
    assert.deepEqual(board.cost, []);
    assert.deepEqual(board.hse, []);
    assert.deepEqual(board.quality, []);
    assert.equal(
      board.estimates.some((row) => DEMO_CODES.includes(row.code)),
      false,
    );
  }
});

test("plant tiles stay as a directory with no invented open-job counts", () => {
  const board = boardForUser("owner-robert-henderson");
  const names = board.sites.filter((site) => !site.id.includes("coker")).map((site) => site.name);
  assert.deepEqual(names, PLANTS);
  assert.equal(board.sites.find((site) => site.name === "Wood River")?.openJobs, 0);
  assert.equal(board.sites.find((site) => site.id === "site-coker-pad")?.openJobs, 0);
  assert.equal(
    board.sites.every((site) => site.openJobs === 0),
    true,
  );
});

test("tester and view-as seat copies are not authored as Robert Henderson", () => {
  const joseph = seedSeatList("tester-joseph", "Joseph Henderson");
  assert.deepEqual(
    joseph.map((row) => row.code),
    DEMO_CODES,
  );
  assert.equal(
    joseph.every((row) => row.estimator === "Joseph Henderson"),
    true,
  );
  assert.equal(
    joseph.some((row) => row.estimator === "Robert Henderson"),
    false,
  );
});
