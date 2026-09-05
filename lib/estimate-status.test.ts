import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isProjectManager, isProjectManagerOrAbove, canLookupRates, canUseRateBuilder } from "./desk-role.ts";
import {
  BUDGET_ESTIMATE_STATUSES,
  DEFAULT_ESTIMATE_STATUS,
  ESTIMATE_STATUSES,
  clampEstimateStatus,
  estimateStatusLaneFromRegular,
  isEstimateLocked,
  needsStatusConfirm,
  parseEstimateStatus,
  readEstimateStatus,
  resolveEstimateStatus,
  statusConfirmCopy,
  statusNeedsManager,
  statusOptionsForRegular,
  statusOptionsForSite,
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
  it("takes the site Regular-client flag, migrates Estimate, and confirms only gate jumps", () => {
    assert.deepEqual(ESTIMATE_STATUSES, [
      "Draft",
      "In progress",
      "Budgetary",
      "Review",
      "Locked",
      "Submitted",
      "Awarded",
    ]);
    assert.equal(DEFAULT_ESTIMATE_STATUS, "Draft");
    assert.equal(parseEstimateStatus("Estimate"), "Draft");
    assert.equal(parseEstimateStatus("Execute"), "Draft");
    assert.equal(parseEstimateStatus("Budgetary"), "Budgetary");
    assert.equal(parseEstimateStatus("In progress"), "In progress");
    assert.deepEqual(statusOptionsForRegular(true), [...BUDGET_ESTIMATE_STATUSES]);
    assert.deepEqual(statusOptionsForRegular(false), [...ESTIMATE_STATUSES]);
    assert.deepEqual(statusOptionsForSite(true), [...BUDGET_ESTIMATE_STATUSES]);
    assert.equal(statusOptionsForRegular(true).includes("Submitted"), false);
    assert.equal(statusOptionsForRegular(true).includes("Awarded"), false);
    assert.equal(statusOptionsForRegular(false).includes("Submitted"), true);
    assert.equal(statusOptionsForRegular(false).includes("Awarded"), true);
    assert.equal(estimateStatusLaneFromRegular(true), "budget");
    assert.equal(estimateStatusLaneFromRegular(false), "bid");
    assert.equal(clampEstimateStatus("Awarded", true), "Locked");
    assert.equal(clampEstimateStatus("Submitted", true), "Locked");
    assert.equal(clampEstimateStatus("Review", true), "Review");
    assert.equal(clampEstimateStatus("Awarded", false), "Awarded");
    assert.equal(clampEstimateStatus("Submitted", false), "Submitted");
    assert.equal(needsStatusConfirm("Draft", "In progress"), false);
    assert.equal(needsStatusConfirm("In progress", "Budgetary"), false);
    assert.equal(needsStatusConfirm("Budgetary", "Review"), false);
    assert.equal(needsStatusConfirm("Draft", "Locked"), true);
    assert.equal(needsStatusConfirm("Locked", "Review"), true);
    assert.equal(needsStatusConfirm("Review", "Submitted"), true);
    assert.equal(needsStatusConfirm("Submitted", "Awarded"), true);
    assert.equal(needsStatusConfirm("Awarded", "Draft"), true);
    assert.equal(needsStatusConfirm("Draft", "Draft"), false);
    assert.equal(statusNeedsManager("Draft", "In progress"), false);
    assert.equal(statusNeedsManager("Draft", "Locked"), true);
    assert.equal(statusNeedsManager("Awarded", "Review"), true);
    assert.equal(isEstimateLocked("Locked"), true);
    assert.equal(isEstimateLocked("Draft"), false);
    assert.match(statusConfirmCopy("Draft", "Submitted"), /Draft to Submitted/);
    const store = memoryStorage();
    writeEstimateStatus("new-demo", "Submitted", store);
    assert.equal(readEstimateStatus("new-demo", store), "Submitted");
    store.setItem("hs_estimate_status_v1:new-legacy", "Estimate");
    assert.equal(readEstimateStatus("new-legacy", store), "Draft");
    assert.equal(resolveEstimateStatus("Awarded", "new-demo", store, true), "Locked");
    assert.equal(resolveEstimateStatus("Awarded", "new-demo", store, false), "Awarded");
    assert.equal(resolveEstimateStatus(undefined, "new-demo", store, false), "Submitted");

    const setup = readFileSync(fileURLToPath(new URL("../components/JobSetupCard.tsx", import.meta.url)), "utf8");
    assert.match(setup, /STATUS/);
    assert.match(setup, /statusOptionsForRegular/);
    assert.match(setup, /regularClientFromParts/);
    assert.match(setup, /Project Manager or above/);
    assert.match(setup, /New sheet stays Draft/);
    assert.match(setup, /ESTIMATE NAME/);
    assert.match(setup, /onName/);
    assert.match(setup, /setPackTitle/);
    assert.match(setup, /AFE \/ TA NAME/);
    assert.match(setup, /CLIENT[\s\S]{0,120}readOnly/);
    assert.match(setup, /does not block edits/);
    assert.match(setup, /estimateStatusLaneFromRegular/);
    assert.match(setup, /Budget lane/);
    assert.equal(/ESTIMATE NAME[\s\S]{0,80}readOnly/.test(setup), false);
    const workspace = readFileSync(fileURLToPath(new URL("../components/EstimateWorkspace.tsx", import.meta.url)), "utf8");
    assert.doesNotMatch(workspace, /\(\["Estimate", "Submitted", "Awarded"\]/);
    assert.match(workspace, /status: pack\.status \|\| status/);
    const pack = readFileSync(fileURLToPath(new URL("./estimate-pack.ts", import.meta.url)), "utf8");
    assert.match(pack, /status\?: EstimateStatus/);
    const importer = readFileSync(fileURLToPath(new URL("./estimate-xlsx-import.ts", import.meta.url)), "utf8");
    assert.match(importer, /does not overwrite pack status/);
    const settings = readFileSync(fileURLToPath(new URL("../components/SettingsShell.tsx", import.meta.url)), "utf8");
    assert.match(settings, /href: "\/settings\/sites".*buildDesk: true/);
    assert.equal(isProjectManager({ email: "nathanboyte@gmail.com", role: "tester" }), true);
    assert.equal(isProjectManagerOrAbove({ email: "robertmhenderson582@gmail.com", role: "owner" }), true);
    assert.equal(isProjectManagerOrAbove({ email: "josephmhenderson2002@gmail.com", role: "tester" }), true);
    assert.equal(canLookupRates({ email: "nathanboyte@gmail.com", role: "tester" }), true);
    assert.equal(canUseRateBuilder({ email: "nathanboyte@gmail.com", role: "tester" }), false);
  });
});
