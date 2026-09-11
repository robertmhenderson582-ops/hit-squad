import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  COMPANY_DESK_DOOR,
  HOME_DOCK_TILES,
  JOB_SCOPED_TILES,
  RATE_VAULT_DOOR,
  homeDockTilesForViewer,
  SCOREBOARD_DOOR,
  homeDockHasCombinedQualityHse,
  homeDockHrefs,
  homeDockLabels,
  homeDockOmitsDeadDoors,
  homeDockOmitsJobScopedPeers,
  homeDockTiles,
  jobScopedHrefs,
  jobScopedLabels,
  jobScopedTiles,
} from "./desk-home.ts";
import { DESK_NAV, deskNavHasHeaderModules, deskNavLabels } from "./desk-nav.ts";

function source(rel: string) {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

describe("Home four doors", () => {
  it("keeps Jobs · Quality · HSE · Accounting on Home and buries job tools", () => {
    assert.deepEqual(homeDockLabels(), ["Jobs", "Quality", "HSE", "Accounting"]);
    assert.deepEqual(homeDockHrefs(), ["/jobs", "/quality", "/hse", "/accounting"]);
    assert.equal(HOME_DOCK_TILES.find((tile) => tile.key === "jobs")?.href, COMPANY_DESK_DOOR.href);
    assert.equal(HOME_DOCK_TILES.find((tile) => tile.key === "jobs")?.note, "Company → Division → Client → Site → Job");
    assert.match(HOME_DOCK_TILES.find((tile) => tile.key === "jobs")?.note ?? "", /Division/);
    assert.equal(HOME_DOCK_TILES.some((tile) => tile.key === "divisions" || tile.label === "Divisions"), false);
    assert.equal(homeDockHasCombinedQualityHse(), false);
    assert.equal(homeDockOmitsDeadDoors(), true);
    assert.equal(homeDockOmitsJobScopedPeers(), true);
    assert.deepEqual(
      homeDockTiles(false).map((tile) => tile.key),
      ["jobs", "quality", "hse", "accounting"],
    );
    assert.equal(homeDockLabels().includes("Quality / HSE"), false);
    assert.equal(homeDockLabels().filter((label) => label === "Quality").length, 1);
    assert.equal(homeDockLabels().filter((label) => label === "HSE").length, 1);
    assert.equal(homeDockLabels().includes("Rates"), false);
    assert.equal(homeDockLabels().includes("Cost / PPR"), false);
    assert.equal(homeDockLabels().includes("Change orders"), false);
    assert.equal(homeDockLabels().includes("Purchasing"), false);
    assert.equal(homeDockLabels().includes("Scoreboard"), false);
    assert.equal(homeDockLabels().includes("Rate Vault"), false);
    assert.equal(
      HOME_DOCK_TILES.some((tile) => tile.key === RATE_VAULT_DOOR.key || tile.href === RATE_VAULT_DOOR.href),
      false,
    );
    assert.equal(SCOREBOARD_DOOR.href, "/scoreboard");
    assert.match(SCOREBOARD_DOOR.note, /parked/i);
  });

  it("keeps Rates · Cost / PPR · Change orders · Purchasing under Jobs", () => {
    assert.deepEqual(jobScopedLabels(), ["Rates", "Cost / PPR", "Change orders", "Purchasing"]);
    assert.deepEqual(jobScopedHrefs(), ["/rates", "/cost", "/change-orders", "/purchasing"]);
    assert.deepEqual(
      jobScopedTiles(false).map((tile) => tile.key),
      ["cost", "change-orders", "purchasing"],
    );
    assert.equal(
      JOB_SCOPED_TILES.every((tile) => !HOME_DOCK_TILES.some((home) => home.href === tile.href)),
      true,
    );

    const jobs = source("../components/JobsDesk.tsx");
    const tools = source("../components/JobScopedTools.tsx");
    const wage = source("../components/WageLookupDesk.tsx");
    const tabs = source("./estimate-tabs.ts");
    assert.match(jobs, /JobScopedTools/);
    assert.match(tools, /jobScopedTiles/);
    assert.match(tools, /canOpenRates/);
    assert.match(tools, /aria-label="Job tools"/);
    assert.match(wage, /href="\/rates"/);
    assert.match(wage, /Rate books/);
    assert.match(tabs, /id: "wage-lookup"/);
    assert.match(tabs, /id: "change-orders"/);
    assert.match(tabs, /id: "cost-report"/);
    assert.match(tabs, /id: "purchasing"/);
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
    const accountingPage = source("../app/accounting/page.tsx");

    assert.match(hero, /HomeDock/);
    assert.match(hero, /hero-mark[\s\S]*HomeDock/);
    assert.doesNotMatch(hero, /py-8|sm:py-10/);
    assert.match(dock, /homeDockTiles/);
    assert.match(dock, /homeDockTilesForViewer/);
    assert.match(dock, /RATE_VAULT_DOOR/);
    assert.match(dock, /aria-label="Desk modules"/);
    assert.doesNotMatch(dock, /canOpenRates/);
    assert.match(css, /\.home-dock-owner-row \{/);
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
    assert.match(css, /\.home-dock \{\n  position: relative;[\s\S]{0,120}width: min\(49\.5rem/);
    assert.match(css, /\.desk-home-root \.desk-hero \{[\s\S]{0,220}justify-content: flex-start;/);
    assert.match(css, /\.desk-home-root \.desk-hero \{[\s\S]{0,240}gap: 0\.85rem;/);
    assert.doesNotMatch(css, /\.home-dock \{[\s\S]{0,160}bottom: 0\.65rem;/);
    assert.doesNotMatch(css, /\.home-dock \{[\s\S]{0,120}left: 0\.25rem;/);
    assert.match(css, /backdrop-filter: blur\(12px\)/);
    assert.match(css, /rgba\(62, 198, 212/);
    assert.match(css, /rgba\(227, 139, 42/);
    assert.match(css, /\.home-dock-tile \{[\s\S]{0,220}min-width: 11\.6rem;/);
    assert.match(css, /\.home-dock-tile \{[\s\S]{0,280}min-height: 6\.25rem;/);
    assert.match(css, /\.home-dock-tile \{[\s\S]{0,300}height: 6\.25rem;/);
    assert.match(css, /\.home-dock-tile \{[\s\S]{0,280}flex: 0 0 11\.6rem;/);
    assert.match(css, /\.home-dock-tile \{[\s\S]{0,360}align-items: center;/);
    assert.match(css, /\.home-dock-tile \{[\s\S]{0,380}justify-content: center;/);
    assert.match(css, /\.home-dock-tile \{[\s\S]{0,420}text-align: center;/);
    assert.match(css, /\.home-dock-tile \{[\s\S]{0,480}overflow: hidden;/);
    assert.match(css, /\.home-dock-label \{[\s\S]{0,360}font-size: 1\.28rem;/);
    assert.match(css, /\.home-dock-label \{[\s\S]{0,400}text-align: center;/);
    assert.match(css, /\.home-dock-label \{[\s\S]{0,520}white-space: nowrap;/);
    assert.match(css, /\.home-dock-label \{[\s\S]{0,280}overflow: hidden;/);
    assert.match(css, /\.home-dock-note \{[\s\S]{0,360}text-align: center;/);
    assert.match(css, /\.home-dock-note \{[\s\S]{0,420}white-space: normal;/);
    assert.doesNotMatch(css, /\.home-dock-tile \{[\s\S]{0,360}align-items: flex-start;/);
    assert.doesNotMatch(css, /\.home-dock-tile \{[\s\S]{0,420}text-align: left;/);
    assert.doesNotMatch(css, /\.home-dock-row \{[\s\S]{0,80}grid-template-columns: repeat\(3/);
    assert.match(purchasingPage, /PurchasingModuleDesk/);
    assert.match(purchasingDesk, /PurchasingDesk/);
    assert.match(purchasingDesk, /liveCostJobs/);
    assert.match(accountingPage, /ClosedModuleDesk/);
    assert.match(accountingPage, /Accounting/);
  });

  it("appends Rate Vault only when session and lens hold the grant", () => {
    const owner = { role: "owner" as const };
    const nathan = { role: "tester" as const };
    const president = { role: "president" as const };
    const granted = { role: "president" as const, privileges: ["rate-vault"] };
    assert.deepEqual(
      homeDockTilesForViewer(nathan).map((tile) => tile.key),
      ["jobs", "quality", "hse", "accounting"],
    );
    assert.deepEqual(
      homeDockTilesForViewer(president).map((tile) => tile.key),
      ["jobs", "quality", "hse", "accounting"],
    );
    assert.deepEqual(
      homeDockTilesForViewer(owner, nathan).map((tile) => tile.key),
      ["jobs", "quality", "hse", "accounting"],
    );
    assert.deepEqual(
      homeDockTilesForViewer(owner, owner).map((tile) => tile.key),
      ["jobs", "quality", "hse", "accounting", "rate-vault"],
    );
    assert.deepEqual(
      homeDockTilesForViewer(granted).map((tile) => tile.key),
      ["jobs", "quality", "hse", "accounting", "rate-vault"],
    );
    const james = { role: "tester" as const, email: "jhut26@gmail.com" };
    assert.deepEqual(
      homeDockTilesForViewer(james).map((tile) => tile.key),
      ["rate-vault"],
    );
    assert.deepEqual(
      homeDockTilesForViewer(owner, james).map((tile) => tile.key),
      ["rate-vault"],
    );
  });
});
