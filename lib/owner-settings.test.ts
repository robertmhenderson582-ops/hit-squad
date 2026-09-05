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

  it("does not vault presence", () => {
    const presence = readFileSync(fileURLToPath(new URL("./presence.ts", import.meta.url)), "utf8");
    assert.equal(/drive-data/.test(presence), false);
    assert.match(presence, /do not vault presence/i);
  });
});
