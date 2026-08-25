import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { activityHours, blankWorkActivity, isPhaseId } from "./work-activities.ts";

describe("work activities", () => {
  it("starts a new activity without billing fields", () => {
    const row = blankWorkActivity(3);
    assert.equal(row.activityNo, "03");
    assert.equal(row.name, "");
    assert.equal(row.hours, 0);
    assert.equal("dollars" in row, false);
  });

  it("sums activity hours for the vs-crew strip", () => {
    assert.equal(
      activityHours([
        { ...blankWorkActivity(1), hours: 40 },
        { ...blankWorkActivity(2), hours: 12.5 },
      ]),
      52.5,
    );
  });

  it("only accepts the five locked phases", () => {
    assert.equal(isPhaseId("pre"), true);
    assert.equal(isPhaseId("mech"), true);
    assert.equal(isPhaseId("Shutdown"), false);
    assert.equal(isPhaseId("Post TAR"), false);
  });
});
