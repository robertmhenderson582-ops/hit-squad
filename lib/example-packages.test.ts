import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EXAMPLE_TEMPLATE_IDS,
  emptyExampleCrew,
  exampleHasFilledTabs,
  examplePackage,
  exampleRail,
} from "./example-packages.ts";
import { folderIsLocked, seedSeatList, workingCopies, archiveCopy, deleteCopy } from "./seat-estimates.ts";

test("each example package opens with filled tabs and a rail total", () => {
  for (const id of EXAMPLE_TEMPLATE_IDS) {
    const pack = examplePackage(id);
    const tabs = exampleHasFilledTabs(pack);
    assert.equal(tabs.jobSetup, true, `${id} job setup`);
    assert.equal(tabs.activities, true, `${id} activities`);
    assert.equal(tabs.crew, true, `${id} crew`);
    assert.equal(tabs.staffing, true, `${id} staffing`);
    assert.equal(tabs.equipment, true, `${id} equipment`);
    assert.equal(tabs.otherCost, true, `${id} other cost`);
    assert.equal(tabs.changeOrders, true, `${id} change orders`);
    const rail = exampleRail(pack);
    assert.equal(rail.total > 0, true, `${id} rail`);
    assert.equal(Number.isFinite(rail.total), true, `${id} rail finite`);
  }
  assert.match(examplePackage("est-u3").title, /Unit 3/);
  assert.match(examplePackage("est-coker").title, /Coker/);
  assert.match(examplePackage("est-tower").title, /cooling-tower|basin/i);
  assert.equal(examplePackage("est-u3").fcr.log.length > 0, true);
  assert.equal(examplePackage("est-coker").fcr.log.length > 0, true);
  assert.equal(exampleRail(examplePackage("est-u3")).total > 1_000_000, true);
});

test("a new estimate starts with empty Crew", () => {
  const empty = emptyExampleCrew();
  assert.deepEqual(empty.staff, []);
  assert.deepEqual(empty.generalForeman, []);
  assert.deepEqual(empty.foreman, []);
  assert.deepEqual(empty.direct, []);
  assert.deepEqual(empty.support, []);
  assert.equal(folderIsLocked("Estimate", "new"), false);
});

test("archive hides a seat copy and delete removes it after the list update", () => {
  const seat = seedSeatList("tester-nathan", "Nathan Boyte");
  assert.equal(workingCopies(seat).length, 3);
  assert.deepEqual(
    workingCopies(seat).map((row) => row.code),
    ["EST-2609-U3", "EST-2610-CKR", "EST-2608-CT"],
  );
  const archived = archiveCopy(seat, seat[0].id);
  assert.equal(workingCopies(archived).length, 2);
  assert.equal(workingCopies(archived).some((row) => row.id === seat[0].id), false);
  const removed = deleteCopy(archived, seat[1].id);
  assert.equal(workingCopies(removed).length, 1);
  assert.equal(removed.find((row) => row.id === seat[1].id)?.deleted, true);
  assert.equal(folderIsLocked("Estimate", "example"), true);
  assert.equal(folderIsLocked("Submitted", "example"), true);
  assert.equal(folderIsLocked("Awarded", "example"), false);
});
