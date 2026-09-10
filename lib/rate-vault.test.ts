import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { canSeeRateVault, canSeeRateVaultDoor, pageAllowedForSeat } from "./desk-role.ts";
import { RATE_VAULT_DOOR, homeDockTilesForViewer } from "./desk-home.ts";
import {
  RATE_VAULT_API,
  RATE_VAULT_BUILDER_STEPS,
  RATE_VAULT_CBA_PLA_ID,
  RATE_VAULT_CBA_PLA_RULES,
  RATE_VAULT_CBA_PLA_SECTION,
  RATE_VAULT_CLIENT,
  RATE_VAULT_HREF,
  RATE_VAULT_LIBRARY_ID,
  RATE_VAULT_OWNER_NOTE,
  RATE_VAULT_PRIVILEGE,
  RATE_VAULT_SCOPE_NOTE,
  RATE_VAULT_SECTIONS,
  RATE_VAULT_SITES,
  RATE_VAULT_SOURCE_KINDS,
  RATE_VAULT_STATE_LAW_ID,
  RATE_VAULT_STATE_LAW_RULES,
  RATE_VAULT_STATE_LAW_SECTION,
  RATE_VAULT_STATE_LAW_SITES,
  RATE_VAULT_TITLE,
  emptyCbaPlaVault,
  emptyRateVaultWorkshop,
  emptyStateLawVault,
  isRateVaultSiteId,
  looksLikeForeignRateVaultSite,
  moveRateVaultSource,
  rateVaultAccess,
  reorderRateVaultItems,
  stubPublishRateVault,
} from "./rate-vault.ts";
import { buildRateVaultWorkshop, seedRateVaultLibrary } from "./rate-vault-library.ts";
import { OWNER_ONLY_PRIVILEGES, isPrivilegeId } from "./privileges.ts";
import { DESK_VERSION, OWNER_WHATS_NEW, TESTER_WHATS_NEW } from "./whats-new.ts";

function source(rel: string) {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

const FORBIDDEN_IMPORT =
  /from ["']@\/lib\/(estimate-pack|estimate-vault|jobs|quality-module|quality-day1|hse-module|hse-day1|tester-seats|users|inbox|rate-books|wage-lookup)/;

describe("Rate Vault scaffold", () => {
  it("is a dedicated privilege with owner-only default grants", () => {
    assert.equal(RATE_VAULT_PRIVILEGE, "rate-vault");
    assert.equal(isPrivilegeId("rate-vault"), true);
    assert.equal(OWNER_ONLY_PRIVILEGES.includes("rate-vault"), true);
    assert.equal(RATE_VAULT_HREF, "/rate-vault");
    assert.equal(RATE_VAULT_API, "/api/rate-vault");
    assert.equal(RATE_VAULT_DOOR.href, RATE_VAULT_HREF);
    assert.equal(RATE_VAULT_TITLE, "Rate Vault");
    assert.match(RATE_VAULT_OWNER_NOTE, /not for testers/i);

    const owner = { role: "owner" as const };
    const nathan = { role: "tester" as const, email: "nathanboyte@gmail.com" };
    const chance = { role: "tester" as const, email: "chancec318@yahoo.com" };
    const freddy = { role: "president" as const, email: "president.example@example.com" };
    const novus = { role: "operator" as const };
    assert.equal(canSeeRateVault(owner), true);
    assert.equal(canSeeRateVault(nathan), false);
    assert.equal(canSeeRateVault(chance), false);
    assert.equal(canSeeRateVault(freddy), false);
    assert.equal(canSeeRateVault(novus), false);
    assert.equal(canSeeRateVaultDoor(owner, nathan), false);
    assert.equal(pageAllowedForSeat(freddy, { privilege: "rate-vault" }), false);
    assert.equal(pageAllowedForSeat({ ...freddy, privileges: ["rate-vault"] }, { privilege: "rate-vault" }), true);
    assert.equal(homeDockTilesForViewer(nathan).some((tile) => tile.key === "rate-vault"), false);
    assert.equal(homeDockTilesForViewer(owner).some((tile) => tile.key === "rate-vault"), true);
  });

  it("gates session access and keeps a stub workshop boundary", () => {
    assert.deepEqual(rateVaultAccess(null), { ok: false, status: 401, error: "Not signed in." });
    assert.deepEqual(rateVaultAccess({ role: "tester" }), {
      ok: false,
      status: 403,
      error: "Rate Vault is owner-eyes-only.",
    });
    assert.deepEqual(rateVaultAccess({ role: "president" }), {
      ok: false,
      status: 403,
      error: "Rate Vault is owner-eyes-only.",
    });
    assert.deepEqual(rateVaultAccess({ role: "operator" }), {
      ok: false,
      status: 403,
      error: "Rate Vault is owner-eyes-only.",
    });
    assert.deepEqual(rateVaultAccess({ role: "owner" }), { ok: true, status: 200 });
    assert.deepEqual(rateVaultAccess({ role: "tester", privileges: ["rate-vault"] }), { ok: true, status: 200 });

    const workshop = emptyRateVaultWorkshop();
    assert.equal(workshop.id, "rate-vault");
    assert.deepEqual(
      RATE_VAULT_SECTIONS.map((section) => section.id),
      ["library", "halls", "contractor", "cba-pla", "state-law", "p66", "publish"],
    );
    assert.equal(RATE_VAULT_LIBRARY_ID, "library");
    assert.deepEqual(
      RATE_VAULT_BUILDER_STEPS.map((step) => step.id),
      ["sources", "recognize", "map-crafts", "burden", "publish"],
    );
    assert.deepEqual([...RATE_VAULT_SOURCE_KINDS], [
      "cba",
      "pla",
      "gppma",
      "local-craft-sheet",
      "b1-exhibit",
      "rate-builder",
      "comp",
      "union-terms",
      "other",
    ]);
    assert.equal(RATE_VAULT_CLIENT, "Phillips 66");
    assert.match(RATE_VAULT_SCOPE_NOTE, /Phillips 66 exclusive/i);
    assert.match(RATE_VAULT_SCOPE_NOTE, /James Hutton/);
    assert.match(RATE_VAULT_SCOPE_NOTE, /P66 procurement/i);
    assert.deepEqual(
      RATE_VAULT_SITES.map((site) => site.id),
      ["wood-river", "bayway", "rodeo", "ferndale", "billings", "east-coast"],
    );
    assert.equal(isRateVaultSiteId("monroe"), false);
    assert.equal(isRateVaultSiteId("yates"), false);
    assert.equal(looksLikeForeignRateVaultSite("Monroe Energy Trainer"), true);
    assert.equal(looksLikeForeignRateVaultSite("Plant Yates"), true);
    assert.equal(looksLikeForeignRateVaultSite("Wood River GPPMA"), false);
    const seeded = buildRateVaultWorkshop();
    assert.equal(seeded.library.entries.length, seedRateVaultLibrary().length);
    assert.equal(
      seeded.library.entries.every((row) => !row.siteId || isRateVaultSiteId(row.siteId)),
      true,
    );
    assert.equal(
      seeded.library.entries.every((row) => !looksLikeForeignRateVaultSite([row.title, row.note, row.siteId].join(" "))),
      true,
    );
    assert.equal(workshop.library.entries.length, 0);
    assert.equal(workshop.steps, RATE_VAULT_BUILDER_STEPS);
    assert.equal(workshop.review, null);
    assert.deepEqual(reorderRateVaultItems(["a", "b", "c"], 2, 0), ["c", "a", "b"]);
    const moved = moveRateVaultSource(seedRateVaultLibrary(), "1EpxaHxTdy6I0H4YV4scosap4PfkoWjiT", {
      siteId: "bayway",
      kind: "rate-builder",
    });
    const rodeo = moved.find((row) => row.driveId === "1EpxaHxTdy6I0H4YV4scosap4PfkoWjiT");
    assert.equal(rodeo?.siteId, "bayway");
    assert.equal(rodeo?.kind, "rate-builder");
    assert.equal(seedRateVaultLibrary().find((row) => row.driveId === "1EpxaHxTdy6I0H4YV4scosap4PfkoWjiT")?.siteId, "rodeo");
    assert.equal(RATE_VAULT_CBA_PLA_ID, "cba-pla");
    assert.equal(RATE_VAULT_CBA_PLA_SECTION.id, "cba-pla");
    assert.equal(RATE_VAULT_CBA_PLA_SECTION.label, "CBA / PLA");
    assert.equal(RATE_VAULT_CBA_PLA_SECTION.title, "CBA & PLA vault");
    assert.match(RATE_VAULT_CBA_PLA_SECTION.note, /Wood River/);
    assert.match(RATE_VAULT_CBA_PLA_SECTION.note, /Bayway/);
    assert.match(RATE_VAULT_CBA_PLA_SECTION.note, /OT/);
    assert.match(RATE_VAULT_CBA_PLA_SECTION.note, /fringes/i);
    assert.match(RATE_VAULT_CBA_PLA_SECTION.note, /eligibility/i);
    assert.match(RATE_VAULT_CBA_PLA_SECTION.note, /clock/i);
    assert.match(RATE_VAULT_CBA_PLA_SECTION.note, /published rate package/i);
    assert.deepEqual(
      RATE_VAULT_CBA_PLA_RULES.map((rule) => rule.id),
      ["ot", "fringes", "eligibility", "clock"],
    );
    assert.deepEqual(workshop.cbaPla, emptyCbaPlaVault());
    assert.equal(workshop.cbaPla.id, "cba-pla");
    assert.deepEqual(workshop.cbaPla.entries, []);
    assert.equal(workshop.cbaPla.rules.every((rule) => rule.captured === false), true);
    assert.equal(RATE_VAULT_STATE_LAW_ID, "state-law");
    assert.equal(RATE_VAULT_STATE_LAW_SECTION.label, "State law");
    assert.match(RATE_VAULT_STATE_LAW_SECTION.note, /site location \/ state/i);
    assert.match(RATE_VAULT_STATE_LAW_SECTION.note, /Illinois/);
    assert.match(RATE_VAULT_STATE_LAW_SECTION.note, /Wood River/);
    assert.match(RATE_VAULT_STATE_LAW_SECTION.note, /California/);
    assert.match(RATE_VAULT_STATE_LAW_SECTION.note, /Rodeo/);
    assert.match(RATE_VAULT_STATE_LAW_SECTION.note, /Ferndale/);
    assert.match(RATE_VAULT_STATE_LAW_SECTION.note, /New Jersey/);
    assert.match(RATE_VAULT_STATE_LAW_SECTION.note, /Bayway/);
    assert.match(RATE_VAULT_STATE_LAW_SECTION.note, /Montana/);
    assert.match(RATE_VAULT_STATE_LAW_SECTION.note, /Billings/);
    assert.match(RATE_VAULT_STATE_LAW_SECTION.note, /published rate package/i);
    assert.deepEqual(
      RATE_VAULT_STATE_LAW_RULES.map((rule) => rule.id),
      ["ot", "wage", "rest", "holiday"],
    );
    assert.deepEqual(
      RATE_VAULT_STATE_LAW_SITES.map((row) => `${row.site}:${row.state}`),
      ["Wood River:Illinois", "Rodeo:California", "Ferndale:California", "Bayway:New Jersey", "Billings:Montana"],
    );
    assert.deepEqual(workshop.stateLaw, emptyStateLawVault());
    assert.equal(workshop.stateLaw.id, "state-law");
    assert.deepEqual(workshop.stateLaw.entries, []);
    const p66 = RATE_VAULT_SECTIONS.find((section) => section.id === "p66");
    assert.match(p66?.note ?? "", /CBA \/ PLA and State law are their own vaults/i);
    assert.equal(workshop.publish.status, "stub");
    assert.equal(workshop.publish.published, false);
    assert.equal(workshop.publish.packageId, null);
    const published = stubPublishRateVault();
    assert.equal(published.published, false);
    assert.equal(published.packageId, null);
  });

  it("wires Home door, route, and API without leaking into Inbox or Rate Tables", () => {
    const dock = source("../components/HomeDock.tsx");
    const desk = source("../components/RateVaultDesk.tsx");
    const gate = source("../components/RateVaultGate.tsx");
    const page = source("../app/rate-vault/page.tsx");
    const layout = source("../app/rate-vault/layout.tsx");
    const api = source("../app/api/rate-vault/route.ts");
    const server = source("./rate-vault-server.ts");
    const vaultModule = source("./rate-vault.ts");
    const library = source("./rate-vault-library.ts");
    const recognize = source("./rate-vault-recognize.ts");
    const store = source("./rate-vault-store.ts");
    const privileges = source("./privileges.ts");

    assert.match(dock, /homeDockTilesForViewer/);
    assert.match(dock, /RATE_VAULT_DOOR/);
    assert.match(dock, /role="radio"/);
    assert.match(desk, /RATE_VAULT_OWNER_NOTE/);
    assert.match(desk, /RATE_VAULT_SCOPE_NOTE/);
    assert.match(desk, /RATE_VAULT_BUILDER_STEPS/);
    assert.doesNotMatch(desk, /Monroe|Yates/);
    assert.match(vaultModule, /Hall uploads/);
    assert.match(vaultModule, /Contractor books/);
    assert.match(vaultModule, /CBA \/ PLA/);
    assert.match(vaultModule, /cba-pla/);
    assert.match(vaultModule, /State law/);
    assert.match(vaultModule, /state-law/);
    assert.match(vaultModule, /P66 \/ site rules/);
    assert.match(vaultModule, /Publish rate package/);
    assert.match(vaultModule, /Source library/);
    assert.match(desk, /RATE_VAULT_CBA_PLA_SECTION/);
    assert.match(desk, /RATE_VAULT_STATE_LAW_SECTION/);
    assert.match(desk, /CBA \/ PLA upload stub/);
    assert.match(desk, /Vault is empty/);
    assert.match(desk, /No state-law captures yet/);
    assert.match(desk, /Browse the vault catalog/);
    assert.match(desk, /Review card/);
    assert.match(desk, /B-1 Builder steps/);
    assert.match(desk, /Rate Vault builder drop/);
    assert.match(desk, /Rate Vault source upload/);
    assert.match(desk, /Recognize rate sheet/);
    assert.match(desk, /Map crafts upload/);
    assert.match(desk, /CBA \/ PLA upload stub/);
    assert.match(desk, /State law upload/);
    assert.match(desk, /Publish preview upload/);
    assert.match(desk, /onDrop/);
    assert.match(desk, /RATE_VAULT_SOURCE_DRAG/);
    assert.match(desk, /RATE_VAULT_CRAFT_DRAG/);
    assert.match(desk, /organize-source/);
    assert.match(api, /organize-source/);
    assert.doesNotMatch(desk, /Cassidy|james@|invite James/i);
    assert.doesNotMatch(vaultModule, /Cassidy|estimate-pack|\/api\/desk\/rates/);
    const docs = source("../docs/rate-vault.md");
    assert.match(docs, /cba-pla/);
    assert.match(docs, /state-law/);
    assert.match(docs, /not nested under P66/);
    assert.match(docs, /Phillips 66 exclusive/i);
    assert.match(docs, /James Hutton/);
    assert.match(docs, /P66 procurement/i);
    assert.match(docs, /files stay on Drive/i);
    assert.match(docs, /review card/i);
    assert.match(docs, /never commit/i);
    assert.match(docs, /Drag and drop/);
    assert.match(docs, /Quality folders/);
    assert.doesNotMatch(library, /siteId:\s*"monroe"/);
    assert.doesNotMatch(library, /Monroe Energy/);
    assert.doesNotMatch(vaultModule, /id: "monroe"/);
    assert.match(desk, /\/api\/rate-vault/);
    assert.match(gate, /canSeeRateVaultDoor/);
    assert.match(gate, /router.replace\("\/"\)/);
    assert.match(page, /RateVaultGate/);
    assert.match(page, /RateVaultDesk/);
    assert.match(layout, /canSeeRateVault\(user\)/);
    assert.match(layout, /redirect\("\/"\)/);
    assert.match(layout, /redirect\("\/login"\)/);
    assert.match(api, /requireRateVault/);
    assert.match(api, /buildRateVaultWorkshop/);
    assert.match(api, /stubPublishRateVault/);
    assert.match(api, /recognizeRateVaultSource/);
    assert.match(server, /canSeeRateVault\(user\)/);
    assert.match(privileges, /"rate-vault"/);
    assert.match(library, /17YtnXtCcIXq68sROl3_VwkIo6PHYzTIR/);
    assert.match(recognize, /needsConfirm: true/);
    assert.match(store, /rate-vault\.json/);
    assert.match(library, /RATE_VAULT_LIBRARY_NAME/);
    assert.doesNotMatch(store, /Buffer\.from\(|writeFileSync\([^)]*\.(xlsx|pdf|xlsb)/);
    assert.doesNotMatch(vaultModule, FORBIDDEN_IMPORT);
    assert.doesNotMatch(server, FORBIDDEN_IMPORT);
    assert.doesNotMatch(api, FORBIDDEN_IMPORT);
    assert.doesNotMatch(desk, FORBIDDEN_IMPORT);
    assert.doesNotMatch(library, FORBIDDEN_IMPORT);
    assert.doesNotMatch(recognize, FORBIDDEN_IMPORT);
    assert.doesNotMatch(store, FORBIDDEN_IMPORT);
    assert.doesNotMatch(TESTER_WHATS_NEW, /Rate Vault|B-1 Builder/i);
    assert.doesNotMatch(OWNER_WHATS_NEW, /Rate Vault|B-1 Builder/i);
    assert.equal(DESK_VERSION, "1.51.1");
  });
});
