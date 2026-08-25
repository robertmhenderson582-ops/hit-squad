import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPhillips66Plant, jobEventLabel } from "./job-event.ts";

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
});
