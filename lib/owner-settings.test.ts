import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, beforeEach, describe, it } from "node:test";

import { SETTINGS_VAULT_KIND, SETTINGS_VAULT_NAME, writeVaultJson } from "./drive-data.ts";
import { memoryDrive, type DriveAdapter } from "./drive-estimates.ts";
import {
  forgetOwnerSettingsCacheForTests,
  getOwnerSettings,
  resetOwnerSettingsForTests,
  setOwnerSettings,
  useOwnerSettingsVaultForTests,
} from "./owner-settings-store.ts";

const dir = mkdtempSync(join(tmpdir(), "hs-settings-"));
process.env.OWNER_SETTINGS_PATH = join(dir, "settings.json");

beforeEach(() => {
  resetOwnerSettingsForTests();
});

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("owner settings vault persist", () => {
  it("keeps aliases and Follow after the local cache is wiped", async () => {
    const drive = memoryDrive();
    useOwnerSettingsVaultForTests(drive);
    await setOwnerSettings({ aliasesOn: true, followSeat: "nathan", viewAs: "nathan" });
    forgetOwnerSettingsCacheForTests();
    useOwnerSettingsVaultForTests(drive);
    const again = await getOwnerSettings();
    assert.equal(again.aliasesOn, true);
    assert.equal(again.followSeat, "nathan");
    assert.equal(again.viewAs, "nathan");
  });

  it("persists Regular-client site overrides", async () => {
    const drive = memoryDrive();
    useOwnerSettingsVaultForTests(drive);
    await setOwnerSettings({ regularClient: { "site-ferndale": true } });
    forgetOwnerSettingsCacheForTests();
    useOwnerSettingsVaultForTests(drive);
    const again = await getOwnerSettings();
    assert.equal(again.regularClient?.["site-ferndale"], true);
  });

  it("defaults the high-usage clock off and persists Owner % / flag", async () => {
    const drive = memoryDrive();
    useOwnerSettingsVaultForTests(drive);
    const first = await getOwnerSettings();
    assert.equal(first.showHighUsageNote, false);
    assert.equal(first.usagePercent, null);
    assert.equal(first.highUsageThreshold, 70);
    await setOwnerSettings({ showHighUsageNote: true, usagePercent: 82, highUsageThreshold: 70 });
    forgetOwnerSettingsCacheForTests();
    useOwnerSettingsVaultForTests(drive);
    const again = await getOwnerSettings();
    assert.equal(again.showHighUsageNote, true);
    assert.equal(again.usagePercent, 82);
    assert.equal(again.highUsageThreshold, 70);
    await setOwnerSettings({ showHighUsageNote: false, usagePercent: null });
    forgetOwnerSettingsCacheForTests();
    useOwnerSettingsVaultForTests(drive);
    const cleared = await getOwnerSettings();
    assert.equal(cleared.showHighUsageNote, false);
    assert.equal(cleared.usagePercent, null);
  });

  it("re-reads Drive on GET so a warm isolate sees another instance's usage clock", async () => {
    const drive = memoryDrive();
    useOwnerSettingsVaultForTests(drive);
    await getOwnerSettings();
    await writeVaultJson(drive, SETTINGS_VAULT_NAME, SETTINGS_VAULT_KIND, {
      showHighUsageNote: true,
      usagePercent: 90,
      highUsageThreshold: 70,
    });
    const again = await getOwnerSettings();
    assert.equal(again.showHighUsageNote, true);
    assert.equal(again.usagePercent, 90);
  });

  it("does not let a stale isolate overwrite the usage clock with a View-as write", async () => {
    const drive = memoryDrive();
    useOwnerSettingsVaultForTests(drive);
    await getOwnerSettings();
    await writeVaultJson(drive, SETTINGS_VAULT_NAME, SETTINGS_VAULT_KIND, {
      aliasesOn: true,
      showHighUsageNote: true,
      usagePercent: 82,
      highUsageThreshold: 70,
    });
    await setOwnerSettings({ viewAs: "nathan" });
    forgetOwnerSettingsCacheForTests();
    useOwnerSettingsVaultForTests(drive);
    const again = await getOwnerSettings();
    assert.equal(again.showHighUsageNote, true);
    assert.equal(again.usagePercent, 82);
    assert.equal(again.viewAs, "nathan");
    assert.equal(again.aliasesOn, true);
  });

  it("rolls back a usage-clock flip when Drive write fails", async () => {
    const inner = memoryDrive();
    const drive: DriveAdapter = {
      configured: true,
      listJson: (folderId) => inner.listJson(folderId),
      listAccessibleJson: (name) => inner.listAccessibleJson!(name),
      readJson: (fileId) => inner.readJson(fileId),
      async createJson() {
        throw new Error("vault write not confirmed");
      },
      async updateJson() {
        throw new Error("vault write not confirmed");
      },
      deleteJson: (fileId) => inner.deleteJson(fileId),
    };
    useOwnerSettingsVaultForTests(drive);
    await assert.rejects(() => setOwnerSettings({ showHighUsageNote: true, usagePercent: 82 }));
    assert.equal((await getOwnerSettings()).showHighUsageNote, false);
    assert.equal((await getOwnerSettings()).usagePercent, null);
    forgetOwnerSettingsCacheForTests();
    useOwnerSettingsVaultForTests(drive);
    const cold = await getOwnerSettings();
    assert.equal(cold.showHighUsageNote, false);
    assert.equal(cold.usagePercent, null);
  });

  it("keeps a confirmed usage clock when a later Drive write fails", async () => {
    const inner = memoryDrive();
    useOwnerSettingsVaultForTests(inner);
    await setOwnerSettings({ showHighUsageNote: true, usagePercent: 82 });
    const failing: DriveAdapter = {
      configured: true,
      listJson: (folderId) => inner.listJson(folderId),
      listAccessibleJson: (name) => inner.listAccessibleJson!(name),
      readJson: (fileId) => inner.readJson(fileId),
      createJson: (folderId, name, content, properties) => inner.createJson(folderId, name, content, properties),
      async updateJson() {
        throw new Error("vault write not confirmed");
      },
      deleteJson: (fileId) => inner.deleteJson(fileId),
    };
    forgetOwnerSettingsCacheForTests();
    useOwnerSettingsVaultForTests(failing);
    await getOwnerSettings();
    await assert.rejects(() => setOwnerSettings({ showHighUsageNote: false, usagePercent: null }));
    const stillHigh = await getOwnerSettings();
    assert.equal(stillHigh.showHighUsageNote, true);
    assert.equal(stillHigh.usagePercent, 82);
  });

  it("defaults Inbox and Suggestion Box chrome off and persists the owner flip", async () => {
    const drive = memoryDrive();
    useOwnerSettingsVaultForTests(drive);
    const first = await getOwnerSettings();
    assert.equal(first.showInboxSuggestionBox, false);
    await setOwnerSettings({ showInboxSuggestionBox: true });
    forgetOwnerSettingsCacheForTests();
    useOwnerSettingsVaultForTests(drive);
    const again = await getOwnerSettings();
    assert.equal(again.showInboxSuggestionBox, true);
    await setOwnerSettings({ showInboxSuggestionBox: false });
    forgetOwnerSettingsCacheForTests();
    useOwnerSettingsVaultForTests(drive);
    assert.equal((await getOwnerSettings()).showInboxSuggestionBox, false);
  });

  it("persists Owner-added job roles and per-seat titles without wiping the usage clock", async () => {
    const drive = memoryDrive();
    useOwnerSettingsVaultForTests(drive);
    await setOwnerSettings({ showHighUsageNote: true, usagePercent: 82 });
    await setOwnerSettings({ jobRoles: ["Night Clerk"], seatJobTitles: { "chancec318@yahoo.com": "Quality Site Manager" } });
    forgetOwnerSettingsCacheForTests();
    useOwnerSettingsVaultForTests(drive);
    const again = await getOwnerSettings();
    assert.deepEqual(again.jobRoles, ["Night Clerk"]);
    assert.equal(again.seatJobTitles?.["chancec318@yahoo.com"], "Quality Site Manager");
    assert.equal(again.showHighUsageNote, true);
    assert.equal(again.usagePercent, 82);
  });

  it("does not vault presence", () => {
    const presence = readFileSync(fileURLToPath(new URL("./presence.ts", import.meta.url)), "utf8");
    assert.equal(/drive-data/.test(presence), false);
    assert.match(presence, /do not vault presence/i);
  });
});
