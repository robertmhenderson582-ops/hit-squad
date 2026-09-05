import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { assignedCompaniesForId, companyDeskLogoSrc, companyLogoSrc, mergeCompanies } from "./companies.ts";
import {
  BURIED_HOME_DOORS,
  COMPANY_DESK_DOOR,
  HOME_DOORS,
  HOME_KICKER,
  HOME_WORDMARK,
  STANDALONE_DOOR,
  companyDoorLogoSrc,
  homeDoorHrefs,
  homeDoorLabels,
} from "./desk-home.ts";

describe("home doors", () => {
  it("keeps HIT SQUAD / PROJECT CONTROLS and buries Standalone off home", () => {
    assert.equal(HOME_WORDMARK, "HIT SQUAD");
    assert.equal(HOME_KICKER, "PROJECT CONTROLS");
    assert.deepEqual(homeDoorLabels(), ["Company desk"]);
    assert.deepEqual(homeDoorHrefs(), ["/jobs"]);
    assert.equal(HOME_DOORS.length, 1);
    assert.equal(HOME_DOORS[0], COMPANY_DESK_DOOR);
    assert.equal(STANDALONE_DOOR.href, "/standalone");
    assert.deepEqual(BURIED_HOME_DOORS, [STANDALONE_DOOR]);
    assert.equal(
      HOME_DOORS.some((door) => door.key === "standalone" || door.href === "/standalone"),
      false,
    );

    const home = readFileSync(fileURLToPath(new URL("../components/DeskHome.tsx", import.meta.url)), "utf8");
    const jobsApi = readFileSync(fileURLToPath(new URL("../app/api/desk/jobs/route.ts", import.meta.url)), "utf8");
    const hero = readFileSync(fileURLToPath(new URL("../components/DeskHero.tsx", import.meta.url)), "utf8");
    const wordmark = readFileSync(fileURLToPath(new URL("../components/Wordmark.tsx", import.meta.url)), "utf8");
    const page = readFileSync(fileURLToPath(new URL("../app/page.tsx", import.meta.url)), "utf8");
    const chrome = readFileSync(fileURLToPath(new URL("../components/DeskChrome.tsx", import.meta.url)), "utf8");
    const css = readFileSync(fileURLToPath(new URL("../app/globals.css", import.meta.url)), "utf8");
    const cue = readFileSync(fileURLToPath(new URL("../components/HomeCue.tsx", import.meta.url)), "utf8");
    assert.match(hero, /HOME_WORDMARK/);
    assert.match(hero, /HOME_KICKER/);
    assert.match(hero, /COMPANY_DESK_DOOR/);
    assert.match(hero, /hero-company-logo/);
    assert.match(hero, /href=\{href\}/);
    assert.match(wordmark, /HIT SQUAD/);
    assert.match(wordmark, /PROJECT CONTROLS/);
    assert.match(wordmark, /variant="stacked"/);
    const mark = readFileSync(fileURLToPath(new URL("../components/BrandMark.tsx", import.meta.url)), "utf8");
    assert.match(hero, /variant="stacked"/);
    assert.match(chrome, /variant="stacked"/);
    assert.match(mark, /variant === "stacked" \|\| variant === "jets"/);
    assert.equal(/M20 2\.5 34 16\.5 20 30\.5 6 16\.5Z/.test(mark), false);
    assert.match(mark, /viewBox="0 0 76 58"/);
    assert.match(mark, /translate\(42 2\) rotate\(12 20 13\.5\)/);
    assert.match(mark, /translate\(2 28\) rotate\(18 20 13\.5\) scale\(0\.76\)/);
    assert.equal(/translate\(0 24\)/.test(mark), false);
    assert.equal(/translate\(16 0\)/.test(mark), false);
    assert.equal(/translate\(2 18\)/.test(mark), false);
    assert.equal(/Forgebook|Estimators/.test(hero), false);
    assert.equal(/Forgebook|Estimators/.test(home), false);
    assert.equal(/New .*estimate|Simple shop|shop job|Other client/i.test(hero), false);
    assert.equal(/OPEN JOBS|EstimateCard|SitesDesk/.test(home), false);
    assert.equal(/four tiles|Open outage board/.test(home), false);
    assert.equal(/Two doors, one home/.test(home), false);
    assert.equal(/plant-card|hud-tile|desk-grid|HOME_DOORS/.test(home), false);
    assert.equal(/\/standalone/.test(home), false);
    assert.match(home, /from "@\/lib\/desk-home"/);
    assert.match(home, /companyDoorLogoSrc/);
    assert.match(home, /companyDeskLogo/);
    assert.match(home, /viewAsInit/);
    assert.match(home, /deskFetch/);
    assert.match(home, /<DeskHero logo=\{companyDeskLogo\} \/>/);
    assert.equal(/Wage lookup|Rate builder|Rodeo|COMP catalogs/i.test(home), false);
    assert.match(jobsApi, /companyDeskLogoForEmail/);
    assert.match(jobsApi, /assignedCompaniesForEmail/);
    assert.match(jobsApi, /scopedDeskUser/);
    assert.match(jobsApi, /companyDeskLogo:/);
    assert.match(jobsApi, /companyName:/);
    assert.match(page, /variant="hero"/);
    assert.match(chrome, /variant = "paper"/);
    assert.match(chrome, /const hero = variant === "hero"/);
    assert.match(chrome, /desk-home-root/);
    assert.match(css, /\.desk-home-root \{/);
    assert.match(css, /url\("\/brand-hero\.jpg"\)/);
    assert.match(css, /\.hero-company-logo img \{/);
    assert.match(css, /object-fit: contain;/);
    assert.match(css, /\.header-home-cue \{[\s\S]*background: rgba\(255, 255, 255, 0\.2\);/);
    assert.match(cue, /width="16"/);
    assert.match(cue, /height="16"/);
  });

  it("shows the Company Desk logo only when exactly one assigned company has one on file", () => {
    assert.equal(companyLogoSrc("/madison.svg"), "/madison.svg");
    assert.equal(companyLogoSrc("javascript:alert(1)"), null);
    assert.equal(companyLogoSrc("//evil.example/x"), null);
    assert.equal(companyDeskLogoSrc([]), null);
    assert.equal(companyDeskLogoSrc([{ logo: "" }, { logo: null }]), null);
    assert.equal(companyDoorLogoSrc([{ logo: "/madison.png" }]), "/madison.png");
    assert.equal(
      companyDeskLogoSrc([{ logo: "/madison.png" }, { logo: "/cbi.png" }]),
      null,
    );
    assert.equal(
      companyDeskLogoSrc([{ logo: "/madison.png" }, { name: "CBI" } as { logo?: string }]),
      "/madison.png",
    );

    const nathan = assignedCompaniesForId("madison", [
      { id: "hitsquad", name: "Hit Squad" },
      { id: "madison", name: "Madison", logo: "/madison.png" },
      { id: "cbi", name: "CBI", logo: "/cbi.png" },
    ]);
    assert.deepEqual(nathan.map((row) => row.id), ["madison"]);
    assert.equal(companyDeskLogoSrc(nathan), "/madison.png");

    const ownerAssigned = assignedCompaniesForId("hitsquad", [
      { id: "hitsquad", name: "Hit Squad" },
      { id: "madison", name: "Madison", logo: "/madison.png" },
    ]);
    assert.deepEqual(ownerAssigned.map((row) => row.id), ["hitsquad"]);
    assert.equal(companyDeskLogoSrc(ownerAssigned), null);

    const standalone = assignedCompaniesForId("standalone", [{ id: "madison", name: "Madison", logo: "/madison.png" }]);
    assert.deepEqual(standalone, []);
    assert.equal(companyDeskLogoSrc(standalone), null);

    const merged = mergeCompanies([{ id: "madison", name: "Madison", logo: "/madison.png" }]);
    assert.equal(merged.find((row) => row.id === "madison")?.logo, "/madison.png");
    assert.equal(merged.find((row) => row.id === "hitsquad")?.logo, undefined);
  });
});
