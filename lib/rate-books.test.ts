import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { companyScopeFor } from "./companies.ts";
import { catalogSites } from "./desk-data.ts";
import { OWNER_LOGIN_EMAIL } from "./owner-login.ts";
import { newBuiltCraft } from "./rate-builder.ts";
import { jobsOnDesk } from "./jobs.ts";
import {
  BILLINGS_SITE_ID,
  EMPTY_MADISON_PLANTS,
  MADISON_RATE_PLANTS,
  MONROE_SITE_ID,
  RATE_COMPANY_OPEN_KEY,
  WOOD_RIVER_SITE_ID,
  YATES_SITE_ID,
  allRateBooks,
  archiveRateBook,
  canArchiveRateBook,
  clearJobOverride,
  hasSiteBook,
  isRateCompanyOpen,
  rateBookVisibleTo,
  rateCompanyOpenKey,
  companyHasEstablishedRates,
  preferredRateSiteId,
  rateSitesForCompany,
  resolvedCrafts,
  saveCraftToLevel,
  siteBookFor,
  siteCompanyId,
  visibleRateBooks,
  visibleRateSites,
  woodRiverBook,
  writeRateCompanyOpen,
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
    assert.equal(hasSiteBook("madison", YATES_SITE_ID), true);
    assert.equal(companyHasEstablishedRates("madison"), true);
    assert.equal(companyHasEstablishedRates("hitsquad"), false);
    assert.equal(companyHasEstablishedRates("cbi"), false);
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
    assert.doesNotMatch(ratesDesk, /Rate books/);
    assert.doesNotMatch(ratesDesk, /Look up wage rates/);
    assert.match(ratesDesk, /No book yet/);
    assert.match(ratesDesk, /aria-expanded=\{sitesOpen\}/);
    assert.match(ratesDesk, /writeRateCompanyOpen/);
    assert.match(ratesDesk, /visibleRateSites/);
    assert.match(ratesDesk, /openCompanyLookup/);
    assert.match(ratesDesk, /preferredRateSiteId/);
    assert.match(ratesDesk, /ThirdPartyRentalDesk/);
    assert.doesNotMatch(ratesDesk, /selectedSite && !loaded/);
    assert.match(ratesDesk, /RateBuilderCard/);
    assert.equal(/40-col|exhibit B-1|Cassidy|COMP workbook/i.test(ratesDesk), false);
    const card = readFileSync(fileURLToPath(new URL("../components/RateBuilderCard.tsx", import.meta.url)), "utf8");
    assert.match(card, /Rate builder/);
    assert.match(card, /BILLED ST/);
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
        siteId: BILLINGS_SITE_ID,
        label: "Billings working",
        craft: newBuiltCraft({ craft: "Operator", baseSt: 38 }),
        level: "site",
      },
      store,
    );
    assert.equal(hasSiteBook("madison", BILLINGS_SITE_ID, store), true);
    const archived = archiveRateBook(saved.id, store);
    assert.equal(archived?.archived, true);
    assert.equal(hasSiteBook("madison", BILLINGS_SITE_ID, store), false);
    assert.equal(hasSiteBook("madison", YATES_SITE_ID, store), true);
    assert.equal(allRateBooks(store).some((row) => row.id === saved.id && row.archived), true);
    assert.equal(archiveRateBook(SHAHAN_BOOK_ID, store)?.source, "shahan");
    assert.equal(hasSiteBook("madison", WOOD_RIVER_SITE_ID, store), true);
  });

  it("lists every Madison plant on Rates, including empty books and Monroe Energy", () => {
    const cat2 = {
      packId: "new-mtaajdwa-f7539",
      key: "new:new-mtaajdwa-f7539",
      title: "Madison CAT 2 (Pit Stop)",
      client: "Phillips 66",
      site: "Wood River — Roxana, IL",
      siteId: "site-madison",
      createdAt: 1,
      updatedAt: 2,
    };
    const ownerSites = visibleRateSites(owner, "madison");
    assert.deepEqual(
      ownerSites.map((row) => row.name),
      [...MADISON_RATE_PLANTS],
    );
    assert.equal(ownerSites.some((row) => row.id === YATES_SITE_ID), true);
    assert.equal(ownerSites.some((row) => row.id === WOOD_RIVER_SITE_ID), true);
    assert.equal(ownerSites.some((row) => row.id === MONROE_SITE_ID), true);
    assert.equal(ownerSites.some((row) => /coker pad/i.test(row.name)), false);
    assert.equal(
      EMPTY_MADISON_PLANTS.every((name) => ownerSites.some((row) => row.name === name)),
      true,
    );

    const nathanJobs = jobsOnDesk([], [cat2], true, nathan);
    assert.equal(nathanJobs.some((job) => job.title.includes("CAT 2")), true);
    const nathanSites = visibleRateSites(nathan, "madison");
    assert.deepEqual(
      nathanSites.map((row) => row.name),
      [...MADISON_RATE_PLANTS],
    );
    assert.equal(nathanSites.some((row) => row.name === "Monroe Energy"), true);
    assert.equal(nathanSites.some((row) => /coker pad/i.test(row.name)), false);
    assert.equal(preferredRateSiteId("madison", nathanSites), YATES_SITE_ID);
    assert.equal(preferredRateSiteId("madison", [{ id: YATES_SITE_ID }, { id: WOOD_RIVER_SITE_ID }]), YATES_SITE_ID);
    assert.equal(preferredRateSiteId("madison", []), WOOD_RIVER_SITE_ID);

    const jamesSites = visibleRateSites(james, "cbi");
    assert.equal(jamesSites.length, 0);
    assert.equal(visibleRateSites(james, "madison").length, 0);
  });

  it("collapses a company card and remembers it per seat without losing the selected site id", () => {
    const store = memoryStore();
    assert.equal(isRateCompanyOpen("madison", store), true);
    assert.equal(isRateCompanyOpen("madison", store, "nathan"), true);
    writeRateCompanyOpen("madison", false, store, "nathan");
    assert.equal(isRateCompanyOpen("madison", store, "nathan"), false);
    assert.equal(isRateCompanyOpen("madison", store), true);
    assert.equal(rateCompanyOpenKey("nathan"), `${RATE_COMPANY_OPEN_KEY}:nathan`);
    writeRateCompanyOpen("madison", true, store, "nathan");
    assert.equal(isRateCompanyOpen("madison", store, "nathan"), true);
    const ratesDesk = readFileSync(fileURLToPath(new URL("../components/RatesDesk.tsx", import.meta.url)), "utf8");
    assert.match(ratesDesk, /aria-expanded=\{sitesOpen\}/);
    assert.match(ratesDesk, /setSiteId\(site\.id\)/);
    assert.match(ratesDesk, /WOOD_RIVER_SITE_ID/);
    assert.equal(/rate-builder nest|CBA fringe/i.test(ratesDesk), false);
  });
});
