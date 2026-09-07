import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  COMPANY_DESK_DOOR,
  HOME_DOCK_TILES,
  homeDockHasCombinedQualityHse,
  homeDockHrefs,
  homeDockLabels,
  homeDockOmitsDeadDoors,
  homeDockTiles,
} from "./desk-home.ts";
import { DESK_NAV, deskNavHasHeaderModules, deskNavLabels } from "./desk-nav.ts";

function source(rel: string) {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

describe("Sample C home dock", () => {
  it("keeps Quality and HSE as separate live tiles and opens Jobs as the directory", () => {
    assert.deepEqual(homeDockLabels(), [
      "Jobs",
      "Rates",
      "Cost / PPR",
      "Change orders",
      "Quality",
      "HSE",
      "Purchasing",
    ]);
    assert.deepEqual(homeDockHrefs(), [
      "/jobs",
      "/rates",
      "/cost",
      "/change-orders",
      "/quality",
      "/hse",
      "/purchasing",
    ]);
    assert.equal(HOME_DOCK_TILES.find((tile) => tile.key === "jobs")?.href, COMPANY_DESK_DOOR.href);
    assert.equal(HOME_DOCK_TILES.find((tile) => tile.key === "jobs")?.note, "Client → Site → Jobs");
    assert.equal(homeDockHasCombinedQualityHse(), false);
    assert.equal(homeDockOmitsDeadDoors(), true);
    assert.deepEqual(
      homeDockTiles(false).map((tile) => tile.key),
      ["jobs", "cost", "change-orders", "quality", "hse", "purchasing"],
    );
    assert.equal(homeDockLabels().includes("Quality / HSE"), false);
    assert.equal(homeDockLabels().filter((label) => label === "Quality").length, 1);
    assert.equal(homeDockLabels().filter((label) => label === "HSE").length, 1);
  });

  it("strips module links from the header and paints a lower-third glass dock", () => {
    assert.deepEqual(deskNavLabels(), ["Settings"]);
    assert.equal(deskNavHasHeaderModules(), false);
    assert.equal(DESK_NAV.some((item) => item.modules), false);

    const chrome = source("../components/DeskChrome.tsx");
    const hero = source("../components/DeskHero.tsx");
    const dock = source("../components/HomeDock.tsx");
    const home = source("../components/DeskHome.tsx");
    const css = source("../app/globals.css");
    const purchasingPage = source("../app/purchasing/page.tsx");
    const purchasingDesk = source("../components/PurchasingModuleDesk.tsx");

    assert.match(hero, /HomeDock/);
    assert.match(dock, /homeDockTiles/);
    assert.match(dock, /canOpenRates/);
    assert.match(dock, /aria-label="Desk modules"/);
    assert.doesNotMatch(hero, /COMPANY_DESK_DOOR/);
    assert.doesNotMatch(home, /plant-card|hud-tile|desk-grid|Quality \/ HSE/);
    assert.doesNotMatch(dock, /Quality \/ HSE/);
    assert.doesNotMatch(chrome, /future-mods-menu|All modules/);
    assert.doesNotMatch(chrome, /href: "\/change-orders"|href: "\/rates"|href: "\/cost"/);
    assert.match(css, /\.home-dock \{/);
    assert.match(css, /position: absolute;/);
    assert.match(css, /backdrop-filter: blur\(12px\)/);
    assert.match(css, /rgba\(62, 198, 212/);
    assert.match(css, /rgba\(227, 139, 42/);
    assert.doesNotMatch(css, /\.home-dock-row \{[\s\S]{0,80}grid-template-columns: repeat\(3/);
    assert.match(purchasingPage, /PurchasingModuleDesk/);
    assert.match(purchasingDesk, /PurchasingDesk/);
    assert.match(purchasingDesk, /liveCostJobs/);
  });
});
