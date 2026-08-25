import assert from "node:assert/strict";
import { test } from "node:test";
import { canUseRateBuilder, canUseViewAs, hasBuildDesk, NOVUS_EMAIL, NOVUS_ID } from "./desk-role.ts";
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
