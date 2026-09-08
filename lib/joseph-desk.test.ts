import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  canLookupRates,
  canOpenRates,
  canUseFollow,
  canUseRateBuilder,
  canUseViewAs,
  hasBuildDesk,
  isOwner,
  isProjectManagerOrAbove,
  lensUser,
  pageAllowedForSeat,
} from "./desk-role.ts";
import { canReceiveDeskBot, canUseInbox, canUseSuggestionBox, INBOX_CIRCLE, isInboxCircleEmail } from "./inbox-circle.ts";
import { OWNER_LOGIN_EMAIL } from "./owner-login.ts";
import { JOSEPH_EMAIL, testerByEmail } from "./tester-seats.ts";
import { ticketsForViewer } from "./ticket-cache.ts";
import { VISUAL_ROSTER } from "./owner-desk.ts";
import { deskScopeUser } from "./desk-scope.ts";

const joseph = { id: "tester-joseph", email: JOSEPH_EMAIL, name: "Joseph Henderson", role: "tester" as const };
const owner = {
  id: "owner-robert-henderson",
  email: OWNER_LOGIN_EMAIL,
  name: "Robert Henderson",
  role: "owner" as const,
};

describe("Joseph full desk", () => {
  it("opens the same work modules and keeps Rate builder on Joseph only among testers", () => {
    assert.equal(testerByEmail(JOSEPH_EMAIL)?.rateBuilder, true);
    assert.equal(VISUAL_ROSTER.find((row) => row.id === "joseph")?.permission, "PM / estimator");
    assert.equal(/Look & feel/i.test(VISUAL_ROSTER.find((row) => row.id === "joseph")?.permission || ""), false);
    assert.equal(canLookupRates(joseph), true);
    assert.equal(canUseRateBuilder(joseph), true);
    assert.equal(canOpenRates(joseph), true);
    assert.equal(isProjectManagerOrAbove(joseph), true);
    assert.equal(canUseRateBuilder({ email: "nathanboyte@gmail.com", role: "tester" }), false);
  });

  it("cannot lock Robert out of the build or mutate owner / Novus seats", () => {
    assert.equal(isOwner(joseph), false);
    assert.equal(hasBuildDesk(joseph), false);
    assert.equal(canUseFollow(joseph), false);
    assert.equal(pageAllowedForSeat(joseph, { buildDesk: true }), false);
    assert.equal(pageAllowedForSeat(joseph, { ownerOnly: true }), false);
    assert.equal(pageAllowedForSeat(owner, { ownerOnly: true }), true);
    assert.equal(pageAllowedForSeat(owner, { buildDesk: true }), true);

    const users = readFileSync(fileURLToPath(new URL("./users.ts", import.meta.url)), "utf8");
    const seats = readFileSync(fileURLToPath(new URL("../app/api/desk/seats/route.ts", import.meta.url)), "utf8");
    const settings = readFileSync(fileURLToPath(new URL("../app/api/desk/owner-settings/route.ts", import.meta.url)), "utf8");
    const shell = readFileSync(fileURLToPath(new URL("../components/SettingsShell.tsx", import.meta.url)), "utf8");
    assert.match(users, /Owner stays the only owner/);
    assert.match(users, /Owner password is not issued from this form/);
    assert.match(users, /Novus is not added from this form/);
    assert.match(users, /if \(user\.role === "owner"\)/);
    assert.match(seats, /if \(!isOwner\(user\)\)/);
    assert.match(seats, /target\.role === "owner"/);
    assert.match(settings, /isTester\(user\)/);
    assert.match(settings, /Owner tools stay with the owner/);
    assert.match(shell, /buildDesk: true/);
    assert.match(shell, /ownerOnly: true/);
    const quality = readFileSync(fileURLToPath(new URL("../components/QualityDesk.tsx", import.meta.url)), "utf8");
    assert.doesNotMatch(quality, /look only/);
    assert.doesNotMatch(quality, /Joseph chrome/);
  });

  it("is on the Inbox circle and only sees his own tickets", () => {
    assert.equal(isInboxCircleEmail(JOSEPH_EMAIL), true);
    assert.equal(canUseInbox(joseph), true);
    assert.equal(canUseSuggestionBox(joseph), true);
    assert.equal(canReceiveDeskBot(joseph), true);
    assert.deepEqual(
      INBOX_CIRCLE.map((row) => row.email),
      [
        OWNER_LOGIN_EMAIL,
        "nathanboyte@gmail.com",
        "bccamp2@gmail.com",
        "shane@apcontrolsllc.com",
        "wlanderno@yahoo.com",
        "chancec318@yahoo.com",
        JOSEPH_EMAIL,
        "novus@hitsquad.local",
      ],
    );
    const rows = [
      { id: "tkt-j", kind: "Broke" as const, note: "joseph", capture: null, later: false, done: false, notifyFix: null, at: "", who: JOSEPH_EMAIL },
      { id: "tkt-n", kind: "Broke" as const, note: "nathan", capture: null, later: false, done: false, notifyFix: null, at: "", who: "nathanboyte@gmail.com" },
    ];
    assert.deepEqual(ticketsForViewer(rows, JOSEPH_EMAIL, false).map((row) => row.id), ["tkt-j"]);
  });

  it("keeps View as a real desk and cannot impersonate through the server header", () => {
    assert.equal(canUseViewAs(joseph), true);
    const viewed = lensUser(owner, "joseph");
    assert.equal(viewed?.email, JOSEPH_EMAIL);
    assert.equal(canUseRateBuilder(viewed), true);
    assert.equal(canLookupRates(viewed), true);
    assert.equal(hasBuildDesk(viewed), false);
    assert.equal(deskScopeUser(joseph, "nathan").email, JOSEPH_EMAIL);
    assert.equal(deskScopeUser(owner, "joseph").email, JOSEPH_EMAIL);
  });
});
