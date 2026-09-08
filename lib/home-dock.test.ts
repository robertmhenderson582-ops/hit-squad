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

  it("strips module links from the header and paints a clustered glass dock under the title", () => {
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
    assert.match(hero, /hero-mark[\s\S]*HomeDock/);
    assert.doesNotMatch(hero, /py-8|sm:py-10/);
    assert.match(dock, /homeDockTiles/);
    assert.match(dock, /canOpenRates/);
    assert.match(dock, /aria-label="Desk modules"/);
    assert.doesNotMatch(hero, /COMPANY_DESK_DOOR/);
    assert.doesNotMatch(home, /plant-card|hud-tile|desk-grid|Quality \/ HSE/);
    assert.doesNotMatch(dock, /Quality \/ HSE/);
    assert.doesNotMatch(chrome, /future-mods-menu|All modules/);
    assert.doesNotMatch(chrome, /href: "\/change-orders"|href: "\/rates"|href: "\/cost"/);
    assert.match(chrome, /home-corner-chrome/);
    assert.match(chrome, /home-title-card/);
    assert.match(chrome, /home-owner-card/);
    assert.match(css, /\.home-dock \{/);
    assert.match(css, /\.home-dock \{\n  position: relative;/);
    assert.match(css, /\.home-dock \{\n  position: relative;[\s\S]{0,120}width: min\(44\.5rem/);
    assert.match(css, /\.desk-home-root \.desk-hero \{[\s\S]{0,220}justify-content: flex-start;/);
    assert.match(css, /\.desk-home-root \.desk-hero \{[\s\S]{0,240}gap: 0\.85rem;/);
    assert.doesNotMatch(css, /\.home-dock \{[\s\S]{0,160}bottom: 0\.65rem;/);
    assert.doesNotMatch(css, /\.home-dock \{[\s\S]{0,120}left: 0\.25rem;/);
    assert.match(css, /backdrop-filter: blur\(12px\)/);
    assert.match(css, /rgba\(62, 198, 212/);
    assert.match(css, /rgba\(227, 139, 42/);
    assert.match(css, /\.home-dock-tile \{[\s\S]{0,220}min-width: 10\.55rem;/);
    assert.match(css, /\.home-dock-tile \{[\s\S]{0,280}min-height: 6\.25rem;/);
    assert.match(css, /\.home-dock-tile \{[\s\S]{0,300}height: 6\.25rem;/);
    assert.match(css, /\.home-dock-tile \{[\s\S]{0,280}flex: 0 0 10\.55rem;/);
    assert.match(css, /\.home-dock-tile \{[\s\S]{0,360}align-items: center;/);
    assert.match(css, /\.home-dock-tile \{[\s\S]{0,380}justify-content: center;/);
    assert.match(css, /\.home-dock-tile \{[\s\S]{0,420}text-align: center;/);
    assert.match(css, /\.home-dock-label \{[\s\S]{0,240}font-size: 1\.28rem;/);
    assert.match(css, /\.home-dock-label \{[\s\S]{0,280}text-align: center;/);
    assert.match(css, /\.home-dock-label \{[\s\S]{0,320}white-space: nowrap;/);
    assert.match(css, /\.home-dock-note \{[\s\S]{0,220}text-align: center;/);
    assert.match(css, /\.home-dock-note \{[\s\S]{0,280}white-space: nowrap;/);
    assert.doesNotMatch(css, /\.home-dock-tile \{[\s\S]{0,360}align-items: flex-start;/);
    assert.doesNotMatch(css, /\.home-dock-tile \{[\s\S]{0,420}text-align: left;/);
    assert.doesNotMatch(css, /\.home-dock-row \{[\s\S]{0,80}grid-template-columns: repeat\(3/);
    assert.match(purchasingPage, /PurchasingModuleDesk/);
    assert.match(purchasingDesk, /PurchasingDesk/);
    assert.match(purchasingDesk, /liveCostJobs/);
  });
});
