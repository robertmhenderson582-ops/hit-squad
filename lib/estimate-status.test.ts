import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isProjectManager, isProjectManagerOrAbove, canLookupRates, canUseRateBuilder } from "./desk-role.ts";
import {
  ESTIMATE_STATUSES,
  canHardDeleteEstimate,
  isAwardedEstimate,
  needsStatusConfirm,
  parseEstimateStatus,
  readEstimateStatus,
  statusConfirmCopy,
  writeEstimateStatus,
} from "./estimate-status.ts";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
  } as Storage;
}

describe("estimate status", () => {
  it("keeps Estimate / Submitted / Awarded and confirms both directions", () => {
    assert.deepEqual(ESTIMATE_STATUSES, ["Estimate", "Submitted", "Awarded"]);
    assert.equal(parseEstimateStatus("Execute"), "Estimate");
    assert.equal(needsStatusConfirm("Estimate", "Submitted"), true);
    assert.equal(needsStatusConfirm("Submitted", "Estimate"), true);
    assert.equal(needsStatusConfirm("Submitted", "Awarded"), true);
    assert.equal(needsStatusConfirm("Awarded", "Submitted"), true);
    assert.equal(needsStatusConfirm("Estimate", "Estimate"), false);
    assert.match(statusConfirmCopy("Estimate", "Submitted"), /Estimate to Submitted/);
    const store = memoryStorage();
    writeEstimateStatus("new-demo", "Submitted", store);
    assert.equal(readEstimateStatus("new-demo", store), "Submitted");

    const setup = readFileSync(fileURLToPath(new URL("../components/JobSetupCard.tsx", import.meta.url)), "utf8");
    assert.match(setup, /STATUS/);
    assert.match(setup, /Project Manager or above/);
    assert.match(setup, /ESTIMATE NAME/);
    assert.match(setup, /onName/);
    assert.match(setup, /setPackTitle/);
    assert.match(setup, /AFE \/ TA NAME/);
    assert.match(setup, /CLIENT[\s\S]{0,120}readOnly/);
    assert.equal(/ESTIMATE NAME[\s\S]{0,80}readOnly/.test(setup), false);
    const workspace = readFileSync(fileURLToPath(new URL("../components/EstimateWorkspace.tsx", import.meta.url)), "utf8");
    assert.doesNotMatch(workspace, /\(\["Estimate", "Submitted", "Awarded"\]/);
    assert.equal(isProjectManager({ email: "nathanboyte@gmail.com", role: "tester" }), true);
    assert.equal(isProjectManagerOrAbove({ email: "robertmhenderson582@gmail.com", role: "owner" }), true);
    assert.equal(isProjectManagerOrAbove({ email: "josephmhenderson2002@gmail.com", role: "tester" }), true);
    assert.equal(canLookupRates({ email: "nathanboyte@gmail.com", role: "tester" }), true);
    assert.equal(canUseRateBuilder({ email: "nathanboyte@gmail.com", role: "tester" }), false);
  });

  it("Awarded jobs cannot be hard-deleted; Estimate and Submitted still can", () => {
    const store = memoryStorage();
    const awarded = { id: "job-new-awarded", packId: "new-awarded", title: "Awarded bank" };
    const open = { id: "job-EST-MTJ5D6", packId: "EST-MTJ5D6", title: "Wood River / T&M 2027-01 to 06" };
    writeEstimateStatus("new-awarded", "Awarded", store);
    writeEstimateStatus("EST-MTJ5D6", "Estimate", store);
    assert.equal(isAwardedEstimate(awarded, store), true);
    assert.equal(canHardDeleteEstimate(awarded, store), false);
    assert.equal(isAwardedEstimate(open, store), false);
    assert.equal(canHardDeleteEstimate(open, store), true);
    writeEstimateStatus("EST-MTJ5D6", "Submitted", store);
    assert.equal(canHardDeleteEstimate(open, store), true);
    const menu = readFileSync(fileURLToPath(new URL("../components/JobMenuActions.tsx", import.meta.url)), "utf8");
    assert.match(menu, /allowDelete/);
    assert.match(menu, /canHardDeleteEstimate/);
    assert.match(menu, /allowDelete \? \(/);
  });
});
