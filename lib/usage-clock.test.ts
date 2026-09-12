import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_HIGH_USAGE_THRESHOLD,
  HIGH_USAGE_NOTE_BODY,
  HIGH_USAGE_NOTE_TITLE,
  highUsageNotePercentLine,
  isHighUsageClock,
  parseUsagePercent,
  parseUsageThreshold,
} from "./usage-clock.ts";

function source(rel: string) {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

describe("usage clock parse", () => {
  it("treats unset and junk as no percent, default threshold 70", () => {
    assert.equal(parseUsagePercent(undefined), null);
    assert.equal(parseUsagePercent(null), null);
    assert.equal(parseUsagePercent(""), null);
    assert.equal(parseUsagePercent("nope"), null);
    assert.equal(parseUsagePercent({}), null);
    assert.equal(parseUsagePercent(82.4), 82);
    assert.equal(parseUsagePercent("7"), 7);
    assert.equal(parseUsagePercent(-4), 0);
    assert.equal(parseUsagePercent(140), 100);
    assert.equal(parseUsageThreshold(undefined), DEFAULT_HIGH_USAGE_THRESHOLD);
    assert.equal(parseUsageThreshold(null), DEFAULT_HIGH_USAGE_THRESHOLD);
    assert.equal(parseUsageThreshold(80), 80);
    assert.equal(DEFAULT_HIGH_USAGE_THRESHOLD, 70);
  });
});

describe("high-usage flag", () => {
  it("hides when unset and does not crash", () => {
    assert.equal(isHighUsageClock(undefined), false);
    assert.equal(isHighUsageClock(null), false);
    assert.equal(isHighUsageClock({}), false);
    assert.equal(isHighUsageClock({ showHighUsageNote: false }), false);
    assert.equal(isHighUsageClock({ usagePercent: null, highUsageThreshold: 70 }), false);
    assert.equal(isHighUsageClock({ usagePercent: 40, highUsageThreshold: 70 }), false);
  });

  it("shows for the toggle or a percent at/above the threshold", () => {
    assert.equal(isHighUsageClock({ showHighUsageNote: true }), true);
    assert.equal(isHighUsageClock({ showHighUsageNote: true, usagePercent: 10 }), true);
    assert.equal(isHighUsageClock({ usagePercent: 70 }), true);
    assert.equal(isHighUsageClock({ usagePercent: 85, highUsageThreshold: 70 }), true);
    assert.equal(isHighUsageClock({ usagePercent: 69, highUsageThreshold: 70 }), false);
    assert.equal(isHighUsageClock({ usagePercent: 60, highUsageThreshold: 60 }), true);
    assert.equal(isHighUsageClock({ showHighUsageNote: false, usagePercent: 90 }), true);
    assert.equal(isHighUsageClock({ showHighUsageNote: false, usagePercent: null }), false);
  });

  it("keeps the Home copy short and does not invent live spend", () => {
    assert.equal(HIGH_USAGE_NOTE_TITLE, "Usage clock");
    assert.match(HIGH_USAGE_NOTE_BODY, /emergency/);
    assert.match(HIGH_USAGE_NOTE_BODY, /not a failure of the desk/i);
    assert.doesNotMatch(HIGH_USAGE_NOTE_BODY, /inbox|suggestion box|tester|gmail/i);
    assert.equal(highUsageNotePercentLine(undefined), null);
    assert.equal(highUsageNotePercentLine(82), "Owner marks the clock at 82%.");
  });
});

describe("Home + Settings wiring", () => {
  it("feeds Owner settings in and paints the note for every Home seat", () => {
    const hero = source("../components/DeskHero.tsx");
    const note = source("../components/HighUsageNote.tsx");
    const display = source("../components/DisplayDesk.tsx");
    const store = source("./owner-settings-store.ts");
    const api = source("../app/api/desk/owner-settings/route.ts");
    const ctx = source("../components/OwnerDeskContext.tsx");
    const css = source("../app/globals.css");
    const inbox = source("./inbox-circle.ts");
    const fabs = source("../components/DeskFabs.tsx");

    assert.match(hero, /HighUsageNote/);
    assert.match(note, /isHighUsageClock/);
    assert.match(note, /HIGH_USAGE_NOTE_BODY/);
    assert.match(note, /data-usage-clock="high"/);
    assert.doesNotMatch(note, /role="owner"|isOwner/);
    assert.match(display, /Show high-usage note/);
    assert.match(display, /Clear high-usage flag/);
    assert.match(display, /setUsageClock/);
    assert.match(display, /hasBuildDesk/);
    assert.match(display, /does not meter live Cursor spend/);
    assert.match(store, /showHighUsageNote: false/);
    assert.match(store, /usagePercent: null/);
    assert.match(store, /highUsageThreshold/);
    assert.match(api, /showHighUsageNote/);
    assert.match(api, /usagePercent/);
    assert.match(ctx, /setUsageClock/);
    assert.match(ctx, /applyUsageClockState/);
    assert.match(css, /\.usage-clock-note \{/);
    assert.doesNotMatch(hero, /cursor\.com|spend api|usage\/meter/i);
    assert.doesNotMatch(display, /cursor\.com\/|openai|anthropic/i);
    assert.doesNotMatch(api, /cursor\.com|usage\/meter/);
    assert.match(inbox, /showInboxSuggestionBox === true/);
    assert.match(fabs, /showInboxSuggestionBox/);
    assert.doesNotMatch(note, /Inbox|Suggestion Box|hitsquad\.novus/);
  });
});
