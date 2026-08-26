import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultEstimateName, isDefaultEstimateName, isPhillips66Plant, jobEventLabel } from "./job-event.ts";

describe("P66 job-event chip", () => {
  it("says Turnaround on Phillips 66 / refinery plants", () => {
    assert.equal(jobEventLabel("Phillips 66", "Wood River — Roxana, IL"), "Turnaround");
    assert.equal(jobEventLabel("Phillips 66", "Bayway — Linden, NJ"), "Turnaround");
    assert.equal(jobEventLabel("", "Rodeo — Rodeo, CA"), "Turnaround");
    assert.equal(jobEventLabel("P66", "Ferndale — Ferndale, WA"), "Turnaround");
    assert.equal(isPhillips66Plant("Phillips 66", "Billings — Billings, MT"), true);
    assert.equal(jobEventLabel("Any client", "Some refinery unit"), "Turnaround");
  });

  it("keeps Outage for powerhouse / shop and never uses Outage as a type", () => {
    assert.equal(jobEventLabel("Georgia Power", "Yates — Newnan, GA"), "Outage");
    assert.equal(jobEventLabel("Shop", "Shop"), "Outage");
    assert.equal(isPhillips66Plant("Georgia Power", "Yates"), false);
  });

  it("defaults the estimate name from the job/event, never T&M", () => {
    assert.equal(defaultEstimateName("Phillips 66", "Wood River — Roxana, IL", "outage"), "New Turnaround estimate");
    assert.equal(defaultEstimateName("Georgia Power", "Yates — Newnan, GA", "other"), "New Outage estimate");
    assert.equal(defaultEstimateName("Shop", "Shop", "shop"), "Shop / rig job");
    assert.equal(isDefaultEstimateName("New T&M estimate"), true);
    assert.equal(isDefaultEstimateName("Cooling-tower basin repair"), false);
  });
});
