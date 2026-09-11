import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { HOME_DOCK_TILES } from "./desk-home.ts";
import { DESK_NAV } from "./desk-nav.ts";
import { canSeeInboxUi, canSeeSuggestionBoxUi, inboxSuggestionBoxChromeOn } from "./inbox-circle.ts";
import { OWNER_LOGIN_EMAIL } from "./owner-login.ts";
import { talkStepsForDesk } from "./talk-walk.ts";

function source(rel: string) {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

describe("Inbox and Suggestion Box chrome is owner-gated", () => {
  it("hides FABs, header badge, home tiles, and nav radios until the owner flip", () => {
    assert.equal(inboxSuggestionBoxChromeOn(undefined), false);
    assert.equal(canSeeInboxUi({ role: "owner", email: OWNER_LOGIN_EMAIL }, false), false);
    assert.equal(canSeeSuggestionBoxUi({ role: "owner", email: OWNER_LOGIN_EMAIL }, false), false);
    assert.equal(HOME_DOCK_TILES.some((tile) => /inbox|suggestion|tickets/i.test(`${tile.key} ${tile.label} ${tile.href}`)), false);
    assert.equal(DESK_NAV.some((item) => item.href === "/inbox" || item.href === "/tickets"), false);

    const fabs = source("../components/DeskFabs.tsx");
    const badge = source("../components/InboxBadge.tsx");
    const display = source("../components/DisplayDesk.tsx");
    const settingsApi = source("../app/api/desk/owner-settings/route.ts");
    const store = source("./owner-settings-store.ts");
    const inboxPage = source("../app/inbox/page.tsx");
    const ticketsPage = source("../app/tickets/page.tsx");
    const redirect = source("../components/HiddenInboxRedirect.tsx");
    const ticketsRoute = source("../app/api/desk/tickets/route.ts");
    const inboxRoute = source("../app/api/desk/inbox/route.ts");

    assert.match(fabs, /canSeeInboxUi/);
    assert.match(fabs, /canSeeSuggestionBoxUi/);
    assert.match(fabs, /showInboxSuggestionBox/);
    assert.match(badge, /canSeeInboxUi/);
    assert.match(display, /Show Inbox & Suggestion Box/);
    assert.match(display, /hasBuildDesk/);
    assert.match(display, /setShowInboxSuggestionBox/);
    assert.match(settingsApi, /showInboxSuggestionBox/);
    assert.match(store, /showInboxSuggestionBox: false/);
    assert.match(inboxPage, /HiddenInboxRedirect/);
    assert.match(ticketsPage, /HiddenInboxRedirect/);
    assert.match(redirect, /router\.replace\("\/"\)/);
    assert.match(ticketsRoute, /canUseSuggestionBox/);
    assert.match(inboxRoute, /canUseInbox/);
    assert.match(source("./ticket-store.ts"), /TICKETS_VAULT/);
  });

  it("keeps How we talk off Inbox while chrome is hidden", () => {
    const hidden = talkStepsForDesk(false);
    assert.equal(hidden.some((step) => /Inbox FAB|Ticket beacon/i.test(step.title)), false);
    assert.match(hidden[0].body, /hitsquad\.novus@gmail\.com/);
    const shown = talkStepsForDesk(true);
    assert.equal(shown.some((step) => step.title === "Inbox FAB"), true);
  });
});
