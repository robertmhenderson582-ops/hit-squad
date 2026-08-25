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
import { VISUAL_ROSTER } from "./owner-desk.ts";
import { JOSEPH_EMAIL } from "./tester-seats.ts";

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
