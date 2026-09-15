import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HSE_READY_SHELF_FOLDER } from "./hse-package-shelf.ts";
import { DRIVE_FOLDER_MIME, DRIVE_SHORTCUT_MIME, DriveApiError, memoryDrive } from "./drive-estimates.ts";
import { hseFolderId } from "./drive-data.ts";
import {
  ensureHseVaultPath,
  HSE_VAULT_FOLDER_ERROR,
  HSE_VAULT_OAUTH_ERROR,
  HSE_VAULT_QUOTA_ERROR,
  HSE_VAULT_SHARE_ERROR,
  HSE_VAULT_WRITE_ERROR,
  hseVaultPath,
  hseVaultWriteUserError,
  isProtectedHseCompanyDocFile,
} from "./hse-vault.ts";
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

  it("keeps testers on the desk-only toast and distinguishes quota, oauth, and folder for Owner", () => {
    const quota = new DriveApiError(403, "Quota exceeded for quota metric 'Total Query Cost'");
    const oauth = new DriveApiError(400, "invalid_grant");
    const folder = new DriveApiError(400, "400 The specified parent is not a folder.");
    assert.equal(hseVaultWriteUserError(quota, false), HSE_VAULT_WRITE_ERROR);
    assert.equal(hseVaultWriteUserError(quota, true), HSE_VAULT_QUOTA_ERROR);
    assert.equal(hseVaultWriteUserError(oauth, true), HSE_VAULT_OAUTH_ERROR);
    assert.equal(hseVaultWriteUserError(folder, true), HSE_VAULT_FOLDER_ERROR);
    assert.equal(
      hseVaultWriteUserError(new DriveApiError(403, "The user does not have sufficient permissions for this file."), true),
      HSE_VAULT_SHARE_ERROR,
    );
    assert.equal(hseDropLeaks(HSE_VAULT_QUOTA_ERROR), false);
    assert.equal(hseDropLeaks(HSE_VAULT_OAUTH_ERROR), false);
    assert.equal(hseDropLeaks(HSE_VAULT_FOLDER_ERROR), false);
  });
});
