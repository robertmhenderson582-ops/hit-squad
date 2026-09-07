import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { B2_WEST_PLANT } from "./b2-east-coast.ts";
import {
  abidingDocuments,
  abidingDocumentsForScope,
  abidingDocumentsForSiteName,
  canSeeAbidingDocuments,
  WEST_COAST_ABIDING_AMENDMENT,
  westCoastClockBind,
  westCoastClockNote,
} from "./abiding-documents.ts";
import { siteClockFromText } from "./hours-clock.ts";
import { OWNER_LOGIN_EMAIL } from "./owner-login.ts";
import { JAMES_EMAIL, JOHN_BEECH_EMAIL } from "./tester-seats.ts";

describe("Abiding documents + West Coast clock bind", () => {
  it("lists Contracts / Agreements per site and hides them from CBI", () => {
    const all = abidingDocuments();
    assert.equal(all.some((row) => row.siteId === "site-rodeo" && row.kind === "pla"), true);
    assert.equal(all.some((row) => row.siteId === "site-rodeo" && row.kind === "cba"), true);
    assert.equal(all.some((row) => row.siteId === "site-monroe"), true);
    assert.equal(canSeeAbidingDocuments({ isOwner: true, email: OWNER_LOGIN_EMAIL, companyId: "hitsquad" }), true);
    assert.equal(
      canSeeAbidingDocuments({ isOwner: false, email: JOHN_BEECH_EMAIL, companyId: "madison" }),
      true,
    );
    assert.equal(canSeeAbidingDocuments({ isOwner: false, email: JAMES_EMAIL, companyId: "cbi" }), false);
    assert.equal(abidingDocumentsForScope({ isOwner: false, email: JAMES_EMAIL, companyId: "cbi" }).length, 0);
    assert.equal(abidingDocumentsForSiteName("Rodeo").every((row) => row.siteId === "site-rodeo"), true);
    assert.equal(abidingDocumentsForSiteName("Wood River").length, 0);
  });

  it("binds Rodeo CA-daily clock to PCA0001100 + Western States + Amend 9 without changing hour math", () => {
    assert.equal(siteClockFromText("Rodeo"), "ca-daily");
    const bind = westCoastClockBind("Rodeo — Rodeo, CA", "Phillips 66");
    assert.ok(bind);
    assert.equal(bind.pca, B2_WEST_PLANT);
    assert.equal(bind.amendment, WEST_COAST_ABIDING_AMENDMENT);
    assert.equal(bind.stub, false);
    assert.equal(westCoastClockBind("Wood River — Roxana, IL", "Phillips 66"), null);
    assert.match(westCoastClockNote("Rodeo"), /PCA0001100/);
    assert.match(westCoastClockNote("Rodeo"), /Western States/);
  });

  it("scaffolds the vault Contracts room and the plant Abiding tab", () => {
    const vault = readFileSync(fileURLToPath(new URL("../components/VaultDesk.tsx", import.meta.url)), "utf8");
    const plant = readFileSync(fileURLToPath(new URL("../components/JobPlantPage.tsx", import.meta.url)), "utf8");
    const jobs = readFileSync(fileURLToPath(new URL("./jobs.ts", import.meta.url)), "utf8");
    assert.match(vault, /Contracts \/ Agreements/);
    assert.match(vault, /AbidingDocumentsDesk/);
    assert.match(plant, /tab === "Abiding"/);
    assert.match(plant, /monroe-energy/);
    assert.match(jobs, /"Abiding"/);
  });
});
