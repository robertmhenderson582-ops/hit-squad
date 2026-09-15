import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HSE_READY_SHELF_FOLDER } from "./hse-package-shelf.ts";
import { DRIVE_FOLDER_MIME, DRIVE_SHORTCUT_MIME, memoryDrive } from "./drive-estimates.ts";
import { hseFolderId } from "./drive-data.ts";
import { ensureHseVaultPath, hseVaultPath, isProtectedHseCompanyDocFile } from "./hse-vault.ts";
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
    assert.deepEqual(
      hseVaultPath({
        companyLabel: "Phillips 66",
        siteLabel: "Wood River — Roxana, IL",
        jobLabel: "Madison CAT 2 (Pit Stop)",
        folderId: "jsa",
      }),
      ["Phillips 66", "Wood River - Roxana, IL", "Madison CAT 2 (Pit Stop)", "JSA"],
    );
  });

  it("follows a shortcut-to-folder when creating the HSE job path", async () => {
    const drive = memoryDrive();
    const root = hseFolderId();
    const real = await drive.createFolder(root, "Phillips 66");
    drive.tree.set("shortcut-p66", {
      file: {
        id: "shortcut-p66",
        name: "Phillips 66",
        mimeType: DRIVE_SHORTCUT_MIME,
        parents: [root],
        shortcutDetails: { targetId: real.id, targetMimeType: DRIVE_FOLDER_MIME },
      },
      bytes: new Uint8Array(),
    });
    const folderId = await ensureHseVaultPath(drive, {
      companyLabel: "Phillips 66",
      siteLabel: "Wood River — Roxana, IL",
      jobLabel: "Madison CAT 2 (Pit Stop)",
      folderId: "jsa",
    });
    const kids = await drive.listChildren(real.id);
    assert.equal(kids.some((row) => row.name === "Wood River - Roxana, IL"), true);
    assert.ok(folderId);
  });
});
