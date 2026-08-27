import assert from "node:assert/strict";
import { test } from "node:test";
import { NOVUS_EMAIL } from "./desk-role.ts";
import { canFollowSeatId, followLandPath, followSeatFromEmail } from "./follow.ts";

test("only visual testers are followable — never owner or Novus", () => {
  assert.equal(canFollowSeatId("nathan"), true);
  assert.equal(canFollowSeatId("mark"), true);
  assert.equal(canFollowSeatId("owner"), false);
  assert.equal(canFollowSeatId("operator-novus"), false);
  assert.equal(followSeatFromEmail("nathanboyte@gmail.com"), "nathan");
  assert.equal(followSeatFromEmail("  Marks544@yahoo.com  "), "mark");
  assert.equal(followSeatFromEmail(NOVUS_EMAIL), undefined);
  assert.equal(followSeatFromEmail("robertmhenderson582@gmail.com"), undefined);
  assert.equal(followSeatFromEmail(""), undefined);
});

test("Follow leaves owner tools and lands on that desk path", () => {
  assert.equal(followLandPath("/estimates/est-coker"), "/estimates/est-coker");
  assert.equal(followLandPath("/jobs/wood-river"), "/jobs/wood-river");
  assert.equal(followLandPath("/"), "/");
  assert.equal(followLandPath(""), "/");
  assert.equal(followLandPath("estimates"), "/");
  assert.equal(followLandPath("/settings/users"), "/");
  assert.equal(followLandPath("/settings/follow"), "/");
  assert.equal(followLandPath("/settings"), "/");
  assert.equal(followLandPath("/tickets"), "/");
  assert.equal(followLandPath("/inbox"), "/");
  assert.equal(followLandPath("/activity"), "/");
  assert.equal(followLandPath("/users"), "/");
  assert.equal(followLandPath("/follow"), "/");
});
