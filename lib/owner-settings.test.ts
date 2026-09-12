import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, beforeEach, describe, it } from "node:test";

import { memoryDrive } from "./drive-estimates.ts";
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

  it("does not vault presence", () => {
    const presence = readFileSync(fileURLToPath(new URL("./presence.ts", import.meta.url)), "utf8");
    assert.equal(/drive-data/.test(presence), false);
    assert.match(presence, /do not vault presence/i);
  });
});
