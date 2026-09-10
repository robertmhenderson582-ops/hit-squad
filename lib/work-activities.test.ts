import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  activityAssigneeChoices,
  activityDescriptionOf,
  activityHasWork,
  activityHours,
  activityPeopleOf,
  activityResourceLabel,
  activityResourcesOf,
  activitiesHaveWork,
  blankWorkActivity,
  formatActivityNo,
  isPhaseId,
  namedPeopleFromOrgChart,
  nextActivityNo,
  normalizeActivityNo,
  normalizeWorkActivities,
  parseActivityNo,
} from "./work-activities.ts";

describe("work activities", () => {
  it("starts a new activity without billing fields and a 001-style number", () => {
    const row = blankWorkActivity(3);
    assert.equal(row.activityNo, "003");
    assert.equal(row.name, "");
    assert.equal(row.description, "");
    assert.deepEqual(row.resources, []);
    assert.deepEqual(row.people, []);
    assert.equal(row.hours, 0);
    assert.equal("dollars" in row, false);
  });

  it("assigns the next unused number from existing rows, not the list length", () => {
    const first = blankWorkActivity([]);
    const second = blankWorkActivity([first]);
    assert.equal(first.activityNo, "001");
    assert.equal(second.activityNo, "002");
    const afterDelete = blankWorkActivity([first]);
    assert.equal(afterDelete.activityNo, "002");
    const skip = blankWorkActivity([{ ...first, activityNo: "005" }]);
    assert.equal(skip.activityNo, "006");
    assert.equal(nextActivityNo([{ activityNo: "01" }, { activityNo: "002" }]), "003");
  });

  it("keeps numeric codes stable at three digits and leaves custom labels alone", () => {
    assert.equal(formatActivityNo(1), "001");
    assert.equal(normalizeActivityNo("02"), "002");
    assert.equal(normalizeActivityNo("A-12"), "A-12");
    assert.equal(parseActivityNo("A-12"), 12);
    const [legacy] = normalizeWorkActivities([{ id: "old", activityNo: "01", name: "Tray pull", resource: "Boilermaker" }]);
    assert.equal(legacy.activityNo, "001");
    assert.equal(legacy.description, "Tray pull");
    assert.deepEqual(legacy.resources, ["Boilermaker"]);
    assert.equal(legacy.resource, "Boilermaker");
  });

  it("reads multi-resource plus named people from mixed legacy rows", () => {
    const [row] = normalizeWorkActivities([
      {
        id: "mix",
        activityNo: "7",
        description: "Bundle pull and set",
        resource: "Pipefitter",
        resources: ["Boilermaker", "Pipefitter"],
        people: ["Dana Cole", "Dana Cole", ""],
        hours: 12,
      },
    ]);
    assert.equal(row.activityNo, "007");
    assert.equal(activityDescriptionOf(row), "Bundle pull and set");
    assert.deepEqual(activityResourcesOf(row), ["Boilermaker", "Pipefitter"]);
    assert.deepEqual(activityPeopleOf(row), ["Dana Cole"]);
    assert.equal(activityResourceLabel(row), "Boilermaker, Pipefitter, Dana Cole");
    assert.equal(activityHasWork(row), true);
  });

  it("does not reuse a deleted number and does not take desk seats as people", () => {
    const kept = { ...blankWorkActivity(1), activityNo: "001", name: "Mobilization", description: "Mobilization" };
    const gone = { ...blankWorkActivity(2), activityNo: "002", name: "Scaffold" };
    const next = blankWorkActivity([kept]);
    assert.equal(next.activityNo, "002");
    assert.notEqual(next.id, gone.id);
    assert.deepEqual(namedPeopleFromOrgChart({
      "st-1": { days: "Alex Rivera", nights: "Pat Nguyen" },
      "st-2": { days: "" },
    }), ["Alex Rivera", "Pat Nguyen"]);
    assert.deepEqual(namedPeopleFromOrgChart(undefined), []);
    assert.deepEqual(activityAssigneeChoices({ ...kept, people: ["Pat Nguyen"] }, ["Alex Rivera"]), [
      "Alex Rivera",
      "Pat Nguyen",
    ]);
  });

  it("sums activity hours for the vs-crew strip and treats description as work", () => {
    assert.equal(
      activityHours([
        { ...blankWorkActivity(1), hours: 40 },
        { ...blankWorkActivity(2), hours: 12.5 },
      ]),
      52.5,
    );
    assert.equal(activitiesHaveWork([{ id: "empty" }]), false);
    assert.equal(activitiesHaveWork([{ id: "desc", description: "Long scope note" }]), true);
    assert.equal(activitiesHaveWork([{ id: "craft", resources: ["Laborer"] }]), true);
    assert.equal(activitiesHaveWork([{ id: "who", people: ["Riley Chen"] }]), true);
  });

  it("does not pull desk presence or seats into the activity list", () => {
    const source = readFileSync(fileURLToPath(new URL("./work-activities.ts", import.meta.url)), "utf8");
    const desk = readFileSync(fileURLToPath(new URL("../components/WorkActivitiesDesk.tsx", import.meta.url)), "utf8");
    assert.equal(/from ["'].*(desk-people|presence|inbox-circle|tester-seats)/.test(source), false);
    assert.equal(/useDeskPeople|from ["'].*desk-people/.test(desk), false);
  });

  it("only accepts the five locked phases", () => {
    assert.equal(isPhaseId("pre"), true);
    assert.equal(isPhaseId("mech"), true);
    assert.equal(isPhaseId("Shutdown"), false);
    assert.equal(isPhaseId("Post TAR"), false);
  });
});
