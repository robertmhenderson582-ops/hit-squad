import assert from "node:assert/strict";
import { test } from "node:test";
import { applyFollow, liveRowCaptureHtml, liveRowChrome } from "./follow.ts";
import { lensUser } from "./desk-role.ts";
import { JOSEPH_EMAIL } from "./tester-seats.ts";

const owner = {
  id: "owner-robert-henderson",
  email: "robertmhenderson582@gmail.com",
  name: "Robert Henderson",
  role: "owner" as const,
};

test("Follow applies the view-as lens and Watching toggles off", () => {
  const start = applyFollow("owner", "joseph");
  assert.equal(start.followSeat, "joseph");
  assert.equal(start.viewAs, "joseph");
  assert.equal(start.watching, true);
  assert.equal(start.path, "/");
  assert.equal(lensUser(owner, start.viewAs)?.email, JOSEPH_EMAIL);
  assert.equal(lensUser(owner, start.viewAs)?.name, "Joseph Henderson");

  const stop = applyFollow("joseph", "joseph");
  assert.equal(stop.followSeat, "owner");
  assert.equal(stop.viewAs, "owner");
  assert.equal(stop.watching, false);
  assert.equal(stop.path, "/settings/follow");
  assert.equal(lensUser(owner, stop.viewAs)?.email, owner.email);

  const fromEstimates = applyFollow("owner", "joseph", "/estimates");
  assert.equal(fromEstimates.path, "/estimates");
  assert.equal(applyFollow("owner", "joseph", "/settings/users").path, "/");
});

test("a Live row capture includes Live text and a solid green class", () => {
  const live = liveRowChrome(true);
  assert.equal(live.tag, "Live");
  assert.match(live.rowClass, /follow-live/);
  assert.match(live.dotClass, /follow-dot-live/);
  assert.equal(live.greenClass, "follow-dot-live");
  const html = liveRowCaptureHtml({ name: "Joseph Henderson", live: true });
  assert.match(html, /Joseph Henderson/);
  assert.match(html, />Live</);
  assert.match(html, /follow-live/);
  assert.match(html, /follow-dot-live/);
  assert.equal(liveRowChrome(false).tag, "");
  assert.match(liveRowCaptureHtml({ name: "Joseph Henderson", live: false }), /follow-idle/);
});
