import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { catalogSites } from "./desk-data.ts";
import { clampEstimateStatus, statusOptionsForRegular } from "./estimate-status.ts";
import {
  REGULAR_CLIENT_FIELD,
  REGULAR_CLIENT_SEED_IDS,
  applyRegularClient,
  clampStatusForSite,
  regularClientFromParts,
  seedRegularClient,
  siteIsRegular,
} from "./site-regular.ts";
import { setRegularClientOverrides } from "./site-regular-overrides.ts";

describe("site Regular-client flag", () => {
  it("seeds Wood River / Bayway / Rodeo Regular and leaves Ferndale on bid", () => {
    assert.deepEqual([...REGULAR_CLIENT_SEED_IDS], ["site-madison", "site-bayway", "site-rodeo"]);
    assert.equal(REGULAR_CLIENT_FIELD, "regularClient");
    assert.equal(seedRegularClient("site-madison"), true);
    assert.equal(seedRegularClient("site-bayway"), true);
    assert.equal(seedRegularClient("site-rodeo"), true);
    assert.equal(seedRegularClient("site-ferndale"), false);
    assert.equal(seedRegularClient("site-billings"), false);
    assert.equal(seedRegularClient("site-yates"), false);
    assert.equal(seedRegularClient("site-monroe"), false);
    assert.equal(seedRegularClient("site-new"), false);

    const sites = catalogSites();
    assert.equal(sites.find((row) => row.id === "site-madison")?.regularClient, true);
    assert.equal(sites.find((row) => row.id === "site-bayway")?.regularClient, true);
    assert.equal(sites.find((row) => row.id === "site-rodeo")?.regularClient, true);
    assert.equal(sites.find((row) => row.id === "site-ferndale")?.regularClient, false);
    assert.equal(sites.find((row) => row.id === "site-billings")?.regularClient, false);
    assert.equal(sites.find((row) => row.id === "site-yates")?.regularClient, false);
    assert.equal(sites.find((row) => row.id === "site-monroe")?.regularClient, false);

    assert.equal(regularClientFromParts("Wood River — Roxana, IL", "Phillips 66", sites), true);
    assert.equal(regularClientFromParts("Bayway", "Phillips 66", sites), true);
    assert.equal(regularClientFromParts("Rodeo", "Phillips 66", sites), true);
    assert.equal(regularClientFromParts("Ferndale", "Phillips 66", sites), false);
    assert.equal(regularClientFromParts("Plant Yates", "Georgia Power", sites), false);
    assert.equal(regularClientFromParts("Monroe Energy", "Monroe Energy", sites), false);
    assert.equal(regularClientFromParts("Unknown plant", "", sites), false);

    assert.equal(statusOptionsForRegular(regularClientFromParts("Wood River", "", sites)).includes("Awarded"), false);
    assert.equal(statusOptionsForRegular(regularClientFromParts("Ferndale", "", sites)).includes("Awarded"), true);
    assert.equal(statusOptionsForRegular(regularClientFromParts("Plant Yates", "", sites)).includes("Submitted"), true);
    assert.equal(clampStatusForSite("Awarded", "Wood River — Roxana, IL", "Phillips 66", sites), "Locked");
    assert.equal(clampStatusForSite("Awarded", "Ferndale", "Phillips 66", sites), "Awarded");

    setRegularClientOverrides({ "site-ferndale": true });
    const flipped = catalogSites();
    assert.equal(flipped.find((row) => row.id === "site-ferndale")?.regularClient, true);
    assert.equal(regularClientFromParts("Ferndale", "Phillips 66", flipped), true);
    assert.equal(clampStatusForSite("Awarded", "Ferndale", "Phillips 66", flipped), "Locked");
    assert.equal(clampEstimateStatus("Awarded", siteIsRegular(flipped.find((row) => row.id === "site-ferndale"))), "Locked");
    setRegularClientOverrides({});
    assert.equal(applyRegularClient(sites, { "site-ferndale": true }).find((row) => row.id === "site-ferndale")?.regularClient, true);

    const desk = readFileSync(fileURLToPath(new URL("../components/SitesRegularDesk.tsx", import.meta.url)), "utf8");
    const page = readFileSync(fileURLToPath(new URL("../app/settings/sites/page.tsx", import.meta.url)), "utf8");
    const api = readFileSync(fileURLToPath(new URL("../app/api/desk/sites/regular/route.ts", import.meta.url)), "utf8");
    assert.match(desk, /Regular client/);
    assert.match(desk, /Competitive bid/);
    assert.match(page, /SettingsGate buildDesk/);
    assert.match(api, /setSiteRegularClient/);
    assert.match(api, /isOwner\(user\)/);
    assert.match(api, /hasBuildDesk\(user\)/);
  });
});
