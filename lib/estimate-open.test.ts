import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { estimateForJob, estimateHref, estimateStorageKey, estimatesForPlant, newEstimateKey, newEstimatePackId } from "./estimate-open.ts";
import type { EstimateRecord, JobRecord, SiteRecord } from "./types.ts";

const ESTIMATES = [
  {
    id: "est-u3",
    title: "Unit 3 turnaround — mechanical package",
    unit: "Unit 3",
    siteId: "site-madison",
  },
  {
    id: "est-coker",
    title: "Coker drum valve package — T&M",
    unit: "Coker",
    siteId: "site-madison",
  },
  {
    id: "est-tower",
    title: "Cooling-tower basin repair",
    unit: "CT-2",
    siteId: "site-madison",
  },
] as EstimateRecord[];

const SITES = [
  { id: "site-madison", name: "Wood River", city: "Roxana, IL" },
  { id: "site-rodeo", name: "Rodeo", city: "Rodeo, CA" },
] as SiteRecord[];

describe("estimate card open", () => {
  it("builds the estimate href", () => {
    assert.equal(estimateHref("est-u3"), "/estimates/est-u3");
  });

  it("matches a job card to its estimate", () => {
    const job = {
      title: "Cooling-tower basin repair estimate",
      kind: "estimate",
    } as JobRecord;
    assert.equal(estimateForJob(job, ESTIMATES)?.id, "est-tower");
    assert.equal(
      estimateForJob({ title: "Unit 3 turnaround — mechanical T&M", kind: "outage" } as JobRecord, ESTIMATES)?.id,
      "est-u3",
    );
  });

  it("lists Wood River plant estimates including Roxana pads", () => {
    const rows = estimatesForPlant(ESTIMATES, SITES, "Wood River", "Roxana, IL");
    assert.deepEqual(
      rows.map((row) => row.id).sort(),
      ["est-coker", "est-tower", "est-u3"],
    );
    assert.equal(estimatesForPlant(ESTIMATES, SITES, "Rodeo", "Rodeo, CA").length, 0);
  });

  it("gives each new estimate its own empty pack key", () => {
    const first = newEstimatePackId();
    const second = newEstimatePackId();
    assert.equal(first === second, false);
    assert.match(newEstimateKey(first), /^new:new-/);
    assert.equal(newEstimateKey("est-coker"), "new:est-coker");
    assert.equal(estimateStorageKey("new-cat2pit"), "new:new-cat2pit");
    assert.equal(estimateStorageKey("est-u3"), "est-u3");
    assert.equal(estimateHref("new-cat2pit"), "/estimates/new-cat2pit");
  });
});
