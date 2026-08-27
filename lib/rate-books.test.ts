import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { companyScopeFor } from "./companies.ts";
import { catalogSites } from "./desk-data.ts";
import { OWNER_LOGIN_EMAIL } from "./owner-login.ts";
import { newBuiltCraft } from "./rate-builder.ts";
import {
  WOOD_RIVER_SITE_ID,
  YATES_SITE_ID,
  allRateBooks,
  archiveRateBook,
  canArchiveRateBook,
  clearJobOverride,
  hasSiteBook,
  rateBookVisibleTo,
  rateSitesForCompany,
  resolvedCrafts,
  saveCraftToLevel,
  siteBookFor,
  siteCompanyId,
  visibleRateBooks,
  woodRiverBook,
} from "./rate-books.ts";
import { SHAHAN_BOOK_ID, SHAHAN_BOOK_LABEL } from "./shahan-wood-river.ts";
import { JAMES_EMAIL, JOHN_HENRY_EMAIL, JOSEPH_EMAIL } from "./tester-seats.ts";
import type { StorageLike } from "./local-estimates.ts";

function memoryStore(seed: Record<string, string> = {}): StorageLike {
  const data = { ...seed };
  return {
    getItem(key) {
      return key in data ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = value;
    },
    removeItem(key) {
      delete data[key];
    },
  };
}

const owner = companyScopeFor({ email: OWNER_LOGIN_EMAIL, role: "owner" });
const nathan = companyScopeFor({ email: "nathanboyte@gmail.com", role: "tester" });
const james = companyScopeFor({ email: JAMES_EMAIL, role: "tester" });
const joseph = companyScopeFor({ email: JOSEPH_EMAIL, role: "tester" });
const johnHenry = companyScopeFor({ email: JOHN_HENRY_EMAIL, role: "tester" });

describe("rate book nest", () => {
  it("scopes the Wood River book under Madison and hides it from other companies", () => {
    const book = woodRiverBook();
    assert.equal(book.companyId, "madison");
    assert.equal(book.siteId, WOOD_RIVER_SITE_ID);
    assert.equal(book.id, SHAHAN_BOOK_ID);
    assert.equal(book.label, SHAHAN_BOOK_LABEL);
    assert.equal(siteCompanyId(catalogSites().find((row) => row.id === WOOD_RIVER_SITE_ID)!), "madison");
    assert.equal(hasSiteBook("madison", WOOD_RIVER_SITE_ID), true);
    assert.equal(hasSiteBook("madison", YATES_SITE_ID), false);
    assert.equal(rateSitesForCompany("madison").some((row) => row.id === WOOD_RIVER_SITE_ID), true);
    assert.equal(rateSitesForCompany("madison").some((row) => row.id === YATES_SITE_ID), true);
    assert.equal(rateSitesForCompany("cbi").length, 0);
    assert.equal(rateSitesForCompany("hitsquad").length, 0);
    assert.equal(rateSitesForCompany("lucky13").length, 0);

    const books = allRateBooks();
    assert.equal(visibleRateBooks(owner, books).some((row) => row.id === SHAHAN_BOOK_ID), true);
    assert.equal(visibleRateBooks(nathan, books).some((row) => row.id === SHAHAN_BOOK_ID), true);
    assert.equal(rateBookVisibleTo(james, book), false);
    assert.equal(rateBookVisibleTo(joseph, book), false);
    assert.equal(rateBookVisibleTo(johnHenry, book), false);
    assert.equal(visibleRateBooks(james, books).some((row) => row.id === SHAHAN_BOOK_ID), false);
    assert.equal(visibleRateBooks(joseph, books).some((row) => row.id === SHAHAN_BOOK_ID), false);
    assert.equal(visibleRateBooks(johnHenry, books).some((row) => row.id === SHAHAN_BOOK_ID), false);
    assert.equal(canArchiveRateBook(book), false);
    const ratesDesk = readFileSync(fileURLToPath(new URL("../components/RatesDesk.tsx", import.meta.url)), "utf8");
    assert.match(ratesDesk, /Rate books/);
    assert.match(ratesDesk, /No book yet/);
    assert.match(ratesDesk, /RateBuilderCard/);
    assert.equal(/40-col|exhibit B-1|Cassidy|COMP workbook/i.test(ratesDesk), false);
    const card = readFileSync(fileURLToPath(new URL("../components/RateBuilderCard.tsx", import.meta.url)), "utf8");
    assert.match(card, /Rate builder/);
    assert.match(card, /COMPOSITE ST/);
    assert.match(card, /Save to this site/);
    assert.match(card, /Save to this job only/);
    assert.match(card, /Save as company default/);
  });

  it("saves a job override without mutating the site book", () => {
    const store = memoryStore();
    const siteCraft = newBuiltCraft({ craft: "Welder", baseSt: 42, fringes: [] });
    const siteBook = saveCraftToLevel(
      {
        companyId: "madison",
        siteId: WOOD_RIVER_SITE_ID,
        label: "Wood River working",
        craft: siteCraft,
        level: "site",
      },
      store,
    );
    const jobCraft = newBuiltCraft({ craft: "Welder", baseSt: 55, fringes: [] });
    saveCraftToLevel(
      {
        companyId: "madison",
        siteId: WOOD_RIVER_SITE_ID,
        jobId: "job-8841",
        jobTitle: "Unit 3 turnaround",
        craft: jobCraft,
        level: "job",
      },
      store,
    );
    const afterSite = siteBookFor("madison", WOOD_RIVER_SITE_ID, store);
    assert.equal(afterSite?.id, siteBook.id);
    assert.equal(afterSite?.crafts.find((row) => row.craft === "Welder")?.baseSt, 42);
    assert.equal(resolvedCrafts("madison", WOOD_RIVER_SITE_ID, "job-8841", store).find((row) => row.craft === "Welder")?.baseSt, 55);
    assert.equal(resolvedCrafts("madison", WOOD_RIVER_SITE_ID, undefined, store).find((row) => row.craft === "Welder")?.baseSt, 42);

    const cleared = clearJobOverride("madison", WOOD_RIVER_SITE_ID, "job-8841", "Welder", store);
    assert.equal(cleared?.archived, true);
    assert.equal(resolvedCrafts("madison", WOOD_RIVER_SITE_ID, "job-8841", store).find((row) => row.craft === "Welder")?.baseSt, 42);
    assert.equal(siteBookFor("madison", WOOD_RIVER_SITE_ID, store)?.crafts.find((row) => row.craft === "Welder")?.baseSt, 42);
  });

  it("archives a builder book instead of deleting the only copy", () => {
    const store = memoryStore();
    const saved = saveCraftToLevel(
      {
        companyId: "madison",
        siteId: YATES_SITE_ID,
        label: "Yates working",
        craft: newBuiltCraft({ craft: "Operator", baseSt: 38 }),
        level: "site",
      },
      store,
    );
    assert.equal(hasSiteBook("madison", YATES_SITE_ID, store), true);
    const archived = archiveRateBook(saved.id, store);
    assert.equal(archived?.archived, true);
    assert.equal(hasSiteBook("madison", YATES_SITE_ID, store), false);
    assert.equal(allRateBooks(store).some((row) => row.id === saved.id && row.archived), true);
    assert.equal(archiveRateBook(SHAHAN_BOOK_ID, store)?.source, "shahan");
    assert.equal(hasSiteBook("madison", WOOD_RIVER_SITE_ID, store), true);
  });
});
