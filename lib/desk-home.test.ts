import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { HOME_DOORS, HOME_KICKER, HOME_WORDMARK, homeDoorHrefs, homeDoorLabels } from "./desk-home.ts";

describe("home doors", () => {
  it("keeps HIT SQUAD / PROJECT CONTROLS and two doors, not splash shortcuts", () => {
    assert.equal(HOME_WORDMARK, "HIT SQUAD");
    assert.equal(HOME_KICKER, "PROJECT CONTROLS");
    assert.deepEqual(homeDoorLabels(), ["Company desk", "Standalone"]);
    assert.deepEqual(homeDoorHrefs(), ["/jobs", "/standalone"]);
    assert.equal(HOME_DOORS.length, 2);

    const home = readFileSync(fileURLToPath(new URL("../components/DeskHome.tsx", import.meta.url)), "utf8");
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
  });
});
