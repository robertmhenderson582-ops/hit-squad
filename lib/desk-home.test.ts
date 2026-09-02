import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { assignedCompaniesForId, companyDeskLogoSrc, companyLogoSrc, mergeCompanies } from "./companies.ts";
import { HOME_DOORS, HOME_KICKER, HOME_WORDMARK, companyDoorLogoSrc, homeDoorHrefs, homeDoorLabels } from "./desk-home.ts";

describe("home doors", () => {
  it("keeps HIT SQUAD / PROJECT CONTROLS and two doors, not splash shortcuts", () => {
    assert.equal(HOME_WORDMARK, "HIT SQUAD");
    assert.equal(HOME_KICKER, "PROJECT CONTROLS");
    assert.deepEqual(homeDoorLabels(), ["Company desk", "Standalone"]);
    assert.deepEqual(homeDoorHrefs(), ["/jobs", "/standalone"]);
    assert.equal(HOME_DOORS.length, 2);

    const home = readFileSync(fileURLToPath(new URL("../components/DeskHome.tsx", import.meta.url)), "utf8");
    const jobsApi = readFileSync(fileURLToPath(new URL("../app/api/desk/jobs/route.ts", import.meta.url)), "utf8");
    const hero = readFileSync(fileURLToPath(new URL("../components/DeskHero.tsx", import.meta.url)), "utf8");
    const wordmark = readFileSync(fileURLToPath(new URL("../components/Wordmark.tsx", import.meta.url)), "utf8");
    assert.match(hero, /HIT SQUAD/);
    assert.match(hero, /PROJECT CONTROLS/);
    assert.match(wordmark, /HIT SQUAD/);
    assert.match(wordmark, /PROJECT CONTROLS/);
    assert.equal(/Forgebook|Estimators/.test(hero), false);
    assert.equal(/Forgebook|Estimators/.test(home), false);
    assert.equal(/New .*estimate|Simple shop|shop job|Other client/i.test(hero), false);
    assert.equal(/OPEN JOBS|EstimateCard|SitesDesk/.test(home), false);
    assert.equal(/four tiles|Open outage board/.test(home), false);
    assert.match(home, /from "@\/lib\/desk-home"/);
    assert.match(home, /HOME_DOORS/);
    assert.match(home, /companyDoorLogoSrc/);
    assert.match(home, /companyDeskLogo/);
    assert.match(home, /viewAsInit/);
    assert.match(home, /deskFetch/);
    assert.match(home, /company-desk-logo-door/);
    assert.match(home, /aria-label=\{door\.label\}/);
    assert.equal(/Wage lookup|Rate builder|Rodeo|COMP catalogs/i.test(home), false);
    assert.match(jobsApi, /companyDeskLogoForEmail/);
    assert.match(jobsApi, /scopedDeskUser/);
    assert.match(jobsApi, /companyDeskLogo:/);
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
