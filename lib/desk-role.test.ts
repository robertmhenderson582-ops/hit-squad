import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canUseRateBuilder,
  canUseViewAs,
  hasBuildDesk,
  lensUser,
  NOVUS_EMAIL,
  NOVUS_ID,
  pageAllowedForSeat,
} from "./desk-role.ts";
import { preferredViewAs, VISUAL_ROSTER } from "./owner-desk.ts";
import { JOSEPH_EMAIL, testerByEmail } from "./tester-seats.ts";

test("Novus is never a visual tester peer", () => {
  assert.equal(
    VISUAL_ROSTER.some((row) => row.email.toLowerCase() === NOVUS_EMAIL),
    false,
  );
  assert.equal(
    VISUAL_ROSTER.some((row) => String(row.id) === NOVUS_ID),
    false,
  );
});

test("operator has build desk; testers do not", () => {
  assert.equal(hasBuildDesk({ role: "owner" }), true);
  assert.equal(hasBuildDesk({ role: "operator" }), true);
  assert.equal(hasBuildDesk({ role: "tester" }), false);
  assert.equal(hasBuildDesk(null), false);
});

test("Joseph has View as and no Rate builder", () => {
  const joseph = { role: "tester", email: JOSEPH_EMAIL };
  assert.equal(canUseViewAs(joseph), true);
  assert.equal(canUseRateBuilder(joseph), false);
  assert.equal(canUseViewAs({ role: "tester", email: "nathanboyte@gmail.com" }), false);
  assert.equal(canUseRateBuilder({ role: "tester", email: "nathanboyte@gmail.com" }), true);
});

test("View as lens matches the selected seat, not the signed-in owner", () => {
  const owner = { id: "owner-robert-henderson", email: "robertmhenderson582@gmail.com", name: "Robert Henderson", role: "owner" as const };
  const mark = lensUser(owner, "mark");
  assert.equal(mark?.email, "marks544@yahoo.com");
  assert.equal(mark?.role, "tester");
  assert.equal(canUseViewAs(mark), false);
  assert.equal(canUseRateBuilder(mark), true);
  assert.equal(pageAllowedForSeat(mark, { buildDesk: true }), false);
  assert.equal(pageAllowedForSeat(owner, { buildDesk: true }), true);

  const joseph = lensUser(owner, "joseph");
  assert.equal(joseph?.email, JOSEPH_EMAIL);
  assert.equal(canUseViewAs(joseph), true);
  assert.equal(canUseRateBuilder(joseph), false);
  assert.equal(pageAllowedForSeat(joseph, { viewAs: true }), true);
  assert.equal(pageAllowedForSeat(mark, { viewAs: true }), false);

  const realMark = { id: "tester-mark", email: "marks544@yahoo.com", name: "Mark Schneider", role: "tester" as const };
  assert.equal(lensUser(realMark, "joseph")?.email, realMark.email);
  assert.equal(pageAllowedForSeat(realMark, { buildDesk: true }), false);
  assert.equal(pageAllowedForSeat(realMark, { viewAs: true }), false);
});

test("every View-as seat matches that tester, including Settings flags", () => {
  const owner = {
    id: "owner-robert-henderson",
    email: "robertmhenderson582@gmail.com",
    name: "Robert Henderson",
    role: "owner" as const,
  };
  assert.deepEqual(
    VISUAL_ROSTER.map((row) => row.id),
    ["wendell", "benny", "chance", "nathan", "john", "joseph", "mark", "cody", "bill", "james"],
  );
  for (const row of VISUAL_ROSTER) {
    const def = testerByEmail(row.email);
    assert.ok(def, row.id);
    const lens = lensUser(owner, row.id);
    assert.equal(lens?.email, row.email, row.id);
    assert.equal(lens?.name, def.name, row.id);
    assert.equal(lens?.role, "tester", row.id);
    assert.equal(canUseRateBuilder(lens), def.rateBuilder, row.id);
    assert.equal(canUseViewAs(lens), def.viewAs, row.id);
    assert.equal(pageAllowedForSeat(lens, { buildDesk: true }), false, row.id);
    assert.equal(pageAllowedForSeat(lens, { ownerOnly: true }), false, row.id);
    assert.equal(pageAllowedForSeat(lens, { viewAs: true }), def.viewAs, row.id);
    assert.equal(pageAllowedForSeat(owner, { buildDesk: true }) && pageAllowedForSeat(lens, { buildDesk: true }), false, row.id);

    const realLogin = { id: def.id, email: def.email, name: def.name, role: "tester" as const };
    assert.equal(lensUser(realLogin, "mark")?.email, realLogin.email, row.id);
    assert.equal(pageAllowedForSeat(realLogin, { buildDesk: true }), false, row.id);
    assert.equal(pageAllowedForSeat(realLogin, { ownerOnly: true }), false, row.id);
    assert.equal(pageAllowedForSeat(realLogin, { viewAs: true }), def.viewAs, row.id);
  }
  assert.equal(preferredViewAs("nathan", "owner"), "nathan");
  assert.equal(preferredViewAs("owner", "mark"), "owner");
  assert.equal(preferredViewAs(undefined, "cody"), "cody");
  assert.equal(preferredViewAs(undefined, undefined), "owner");
});
