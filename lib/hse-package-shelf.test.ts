import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HSE_READY_SHELF_FOLDER,
  HSE_READY_SHELF_PREFIX,
  hsePackageShelfAcl,
  hseReadyShelfJobId,
  isHseReadyShelfJobId,
  parseHsePackageName,
} from "./hse-package-shelf.ts";

const owner = { email: "robertmhenderson582@gmail.com", name: "Robert", role: "owner" as const };
const wendell = { email: "wlanderno@yahoo.com", name: "Wendell", role: "tester" as const };
const nathan = { email: "nathanboyte@gmail.com", name: "Nathan Boyte", role: "tester" as const };
const chance = { email: "chancec318@yahoo.com", name: "Chance", role: "tester" as const };

describe("HSE Ready package shelf", () => {
  it("lets HSE seats build kits; PM can attach; viewers cannot", () => {
    assert.equal(HSE_READY_SHELF_FOLDER, "Ready HSE packages");
    assert.equal(isHseReadyShelfJobId(hseReadyShelfJobId("outage-kit")), true);
    assert.equal(hseReadyShelfJobId("outage-kit").startsWith(`${HSE_READY_SHELF_PREFIX}:`), true);
    assert.equal("error" in parseHsePackageName(""), true);
    assert.equal("label" in parseHsePackageName("Outage kit"), true);
    assert.equal(hsePackageShelfAcl(owner).canBuild, true);
    assert.equal(hsePackageShelfAcl(wendell).canBuild, true);
    assert.equal(hsePackageShelfAcl(wendell).canAttach, true);
    assert.equal(hsePackageShelfAcl(nathan).canBuild, false);
    assert.equal(hsePackageShelfAcl(nathan).canAttach, true);
    assert.equal(hsePackageShelfAcl(chance).canBuild, false);
    assert.equal(hsePackageShelfAcl(chance).canAttach, false);
  });
});
