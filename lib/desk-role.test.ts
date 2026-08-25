import assert from "node:assert/strict";
import { test } from "node:test";
import { hasBuildDesk, NOVUS_EMAIL, NOVUS_ID } from "./desk-role.ts";
import { VISUAL_ROSTER } from "./owner-desk.ts";

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
