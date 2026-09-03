import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { companyScopeFor } from "./companies.ts";
import {
  HSE_PACKAGE_SLOTS,
  canSeeHesRoster,
  canSeeMadisonSafetyManuals,
  emptyHseDay1,
  hseJobSnapshot,
  hseNotify,
  hsePackageForSeat,
  hseScoreboardHours,
} from "./hse-day1.ts";
import { qualitySurfaceLeaks } from "./quality-day1.ts";
import { JOSEPH_EMAIL } from "./tester-seats.ts";

describe("HSE Day-1 seat leaks", () => {
  it("does not leak vault ids or Madison manuals to a non-Madison seat", () => {
    const joseph = { email: JOSEPH_EMAIL, role: "tester" };
    const scope = companyScopeFor(joseph);
    assert.equal(canSeeMadisonSafetyManuals(joseph, scope), false);
    assert.equal(canSeeHesRoster(joseph), false);
    const snapshot = hseJobSnapshot({ plant: "Wood River", phases: [], crafts: ["Boilermaker"], hours: 0 });
    const surface = hsePackageForSeat(emptyHseDay1(), snapshot, joseph, scope);
    assert.deepEqual(surface.manuals, []);
    assert.equal(surface.hesRoster, false);
    assert.equal(surface.hours, null);
    assert.equal(hseScoreboardHours(0), null);
    assert.equal(qualitySurfaceLeaks(surface), false);
    assert.equal(HSE_PACKAGE_SLOTS.some((slot) => /29\.1|sling/i.test(slot.label)), false);
    assert.equal(qualitySurfaceLeaks({ vault: "1zYl2dEvW21", file: "hse-briefs.json" }), true);
    assert.equal(hseNotify("Awarded"), true);
    assert.equal(hseNotify("Estimate"), false);
  });
});
