import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultEstimateName,
  isDefaultEstimateName,
  isPhillips66Plant,
  isPowerhouse,
  isShopJob,
  jobEventLabel,
  startJobEventLabel,
} from "./job-event.ts";

describe("P66 job-event chip", () => {
  it("says Turnaround on Phillips 66 / refinery plants", () => {
    assert.equal(jobEventLabel("Phillips 66", "Wood River — Roxana, IL"), "Turnaround");
    assert.equal(jobEventLabel("Phillips 66", "Bayway — Linden, NJ"), "Turnaround");
    assert.equal(jobEventLabel("", "Rodeo — Rodeo, CA"), "Turnaround");
    assert.equal(jobEventLabel("P66", "Ferndale — Ferndale, WA"), "Turnaround");
    assert.equal(isPhillips66Plant("Phillips 66", "Billings — Billings, MT"), true);
    assert.equal(jobEventLabel("Any client", "Some refinery unit"), "Turnaround");
  });

  it("keeps Outage for a powerhouse only — never on P66 or Shop / rig", () => {
    assert.equal(jobEventLabel("Georgia Power", "Yates — Newnan, GA"), "Outage");
    assert.equal(isPowerhouse("Georgia Power", "Yates — Newnan, GA"), true);
    assert.equal(isPhillips66Plant("Georgia Power", "Yates"), false);
    assert.equal(jobEventLabel("Shop", "Shop"), "Turnaround");
    assert.equal(isShopJob("Shop", "Shop"), true);
    assert.equal(isPowerhouse("Shop", "Shop"), false);
    assert.equal(startJobEventLabel("Shop", "Shop", "shop"), "Turnaround");
    assert.equal(startJobEventLabel("Phillips 66", "Wood River — Roxana, IL", "shop"), "Turnaround");
    assert.equal(startJobEventLabel("Georgia Power", "Yates — Newnan, GA", "other"), "Outage");
    assert.equal(jobEventLabel("Georgia Power", "Wood River — Roxana, IL"), "Outage");
    assert.equal(startJobEventLabel("Georgia Power", "Wood River — Roxana, IL", "other"), "Outage");
    assert.notEqual(startJobEventLabel("Shop", "Shop", "shop"), "Outage");
  });

  it("defaults the estimate name from the job/event, never T&M", () => {
    assert.equal(defaultEstimateName("Phillips 66", "Wood River — Roxana, IL", "outage"), "New Turnaround estimate");
    assert.equal(defaultEstimateName("Georgia Power", "Yates — Newnan, GA", "other"), "New Outage estimate");
    assert.equal(defaultEstimateName("Shop", "Shop", "shop"), "Shop / rig job");
    assert.equal(isDefaultEstimateName("New T&M estimate"), true);
    assert.equal(isDefaultEstimateName("Cooling-tower basin repair"), false);
  });
});
