import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

function source(rel: string) {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

describe("Sample A home header chrome", () => {
  it("splits Home into corner glass cards and leaves the Sample C dock alone", () => {
    const chrome = source("../components/DeskChrome.tsx");
    const hero = source("../components/DeskHero.tsx");
    const dock = source("../components/HomeDock.tsx");
    const home = source("../components/DeskHome.tsx");
    const page = source("../app/page.tsx");
    const css = source("../app/globals.css");
    const banner = source("../components/FieldTrialBanner.tsx");

    assert.match(page, /variant="hero"/);
    assert.match(chrome, /home-corner-chrome/);
    assert.match(chrome, /home-title-card/);
    assert.match(chrome, /home-owner-card/);
    assert.match(chrome, /home-title-word/);
    assert.match(chrome, /home-title-kicker/);
    assert.match(chrome, /home-title-mark/);
    assert.match(chrome, /<BrandMark /);
    assert.doesNotMatch(chrome, /variant="stacked"|variant="jets"/);
    assert.match(chrome, /home-corner-home/);
    assert.match(chrome, /home-corner-settings/);
    assert.match(chrome, /home-owner-signout/);
    assert.match(chrome, /FieldTrialBanner/);
    assert.match(banner, /Field trial — not a release/);

    assert.match(css, /\.home-corner-chrome \{/);
    assert.match(css, /\.home-title-card,/);
    assert.match(css, /\.home-title-brand \{[\s\S]{0,80}display: flex;/);
    assert.match(css, /\.home-title-mark \{[\s\S]{0,80}width: 2rem;/);
    assert.match(css, /\.home-owner-card \{/);
    assert.match(css, /\.home-title-card,[\s\S]{0,280}backdrop-filter: blur\(14px\)/);
    assert.match(css, /\.home-title-card,[\s\S]{0,360}border: 1px solid rgba\(62, 198, 212/);
    assert.match(css, /\.home-corner-chrome \{[\s\S]{0,180}justify-content: space-between;/);
    assert.match(css, /\.home-corner-chrome \{[\s\S]{0,220}pointer-events: none;/);
    assert.doesNotMatch(css, /\.desk-home-root \.paper-header/);
    assert.doesNotMatch(css, /\.home-corner-chrome \{[^}]*background:/);
    assert.match(css, /@media \(max-width: 640px\) \{[\s\S]{0,180}\.home-corner-chrome \{[\s\S]{0,80}flex-direction: column;/);

    const heroHeader = chrome.slice(chrome.indexOf("{hero ? ("), chrome.indexOf(") : ("));
    assert.match(heroHeader, /home-title-card/);
    assert.match(heroHeader, /home-owner-card/);
    assert.match(heroHeader, /HIT SQUAD/);
    assert.match(heroHeader, /PROJECT CONTROLS/);
    assert.match(heroHeader, /<BrandMark /);
    assert.match(heroHeader, /home-title-mark/);
    assert.match(heroHeader, /HomeCue/);
    assert.match(heroHeader, /href === "\/settings"/);
    assert.match(heroHeader, /item\.label\.toUpperCase/);
    assert.match(heroHeader, /SIGN OUT/);
    assert.doesNotMatch(heroHeader, /paper-header/);
    assert.doesNotMatch(heroHeader, /hud-bezel/);
    assert.doesNotMatch(heroHeader, /steel-plate/);
    assert.doesNotMatch(heroHeader, /ThemeFlip/);

    assert.match(hero, /HomeDock/);
    assert.match(hero, /HOME_WORDMARK/);
    assert.match(hero, /HOME_KICKER/);
    assert.match(dock, /homeDockTiles/);
    assert.match(dock, /aria-label="Desk modules"/);
    assert.doesNotMatch(hero, /home-title-card|home-owner-card/);
    assert.doesNotMatch(home, /home-title-card|paper-header/);
  });
});
