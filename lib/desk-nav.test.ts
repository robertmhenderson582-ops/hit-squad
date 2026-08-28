import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DESK_NAV, deskNavHasSiblingWorkTabs, deskNavLabels } from "./desk-nav.ts";

describe("desk chrome nav", () => {
  it("keeps one Jobs list and drops sibling Sites / Estimates tabs", () => {
    assert.deepEqual(deskNavLabels().filter((label) => ["Jobs", "Sites", "Estimates"].includes(label)), ["Jobs"]);
    assert.equal(deskNavHasSiblingWorkTabs(), false);
    assert.equal(DESK_NAV.some((item) => item.href === "/jobs"), true);
    assert.equal(DESK_NAV.some((item) => item.href === "/sites"), false);
    assert.equal(DESK_NAV.some((item) => item.href === "/estimates"), false);
  });
});
