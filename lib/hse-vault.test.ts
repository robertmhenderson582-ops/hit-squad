import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HSE_READY_SHELF_FOLDER } from "./hse-package-shelf.ts";
import { hseVaultPath, isProtectedHseCompanyDocFile } from "./hse-vault.ts";
import { hseDropLeaks } from "./hse-vault-shared.ts";

describe("HSE vault paths", () => {
  it("names company → site → job → folder, rail buckets at company, and Ready kits under Ready HSE packages", () => {
    assert.deepEqual(
      hseVaultPath({
        companyId: "madison",
        siteLabel: "Wood River",
        jobLabel: "Boiler 17",
        folderId: "jsa",
      }),
      ["Madison", "Wood River", "Boiler 17", "JSA"],
    );
    assert.deepEqual(
      hseVaultPath({
        companyId: "madison",
        folderId: "safety-manual",
        companyDocs: true,
      }),
      ["Madison", "Madison Safety Manual"],
    );
    assert.deepEqual(
      hseVaultPath({
        companyId: "madison",
        folderId: "packages",
        shelf: true,
        packageLabel: "Outage kit",
      }),
      ["Madison", HSE_READY_SHELF_FOLDER, "Outage kit"],
    );
    assert.equal(isProtectedHseCompanyDocFile("any-id"), false);
    assert.equal(hseDropLeaks({ name: "hse-briefs.json" }), true);
    assert.equal(hseDropLeaks({ name: "Madison JSA — Boiler 17 — 2026-09-12 — Wendell.txt" }), false);
  });
});
