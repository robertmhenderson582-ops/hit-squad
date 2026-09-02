import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { newBuiltCraft } from "./rate-builder.ts";
import { YATES_SITE_ID, saveCraftToLevel } from "./rate-books.ts";
import { SHAHAN_BOOK_LABEL, SHAHAN_LABOR, lookupShahanLabor } from "./shahan-wood-river.ts";
import type { StorageLike } from "./local-estimates.ts";
import {
  WAGE_LOOKUP_EMPTY,
  estimateRateContext,
  formatWageRate,
  lookupWageRate,
  wageLookupBook,
  wageLookupPositions,
} from "./wage-lookup.ts";

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

describe("estimate wage lookup", () => {
  it("puts Wage lookup on the estimate and drops the Rates Rate books button", () => {
    const workspace = readFileSync(fileURLToPath(new URL("../components/EstimateWorkspace.tsx", import.meta.url)), "utf8");
    const detail = readFileSync(fileURLToPath(new URL("../components/EstimateDetail.tsx", import.meta.url)), "utf8");
    const form = readFileSync(fileURLToPath(new URL("../components/NewEstimateForm.tsx", import.meta.url)), "utf8");
    const desk = readFileSync(fileURLToPath(new URL("../components/WageLookupDesk.tsx", import.meta.url)), "utf8");
    const ratesDesk = readFileSync(fileURLToPath(new URL("../components/RatesDesk.tsx", import.meta.url)), "utf8");
    assert.match(workspace, /label: "Wage lookup"/);
    assert.match(workspace, /id: "wage-lookup"/);
    assert.match(workspace, /WageLookupDesk/);
    assert.doesNotMatch(workspace, /RatesDesk/);
    assert.match(detail, /EstimateWorkspace/);
    assert.match(form, /EstimateWorkspace/);
    assert.match(desk, /Wage lookup/);
    assert.match(desk, /<select/);
    assert.match(desk, /No book yet/);
    assert.doesNotMatch(desk, /setCrew|writeStoredRateBooks|saveCraftToLevel/);
    assert.doesNotMatch(ratesDesk, /Rate books/);
    assert.doesNotMatch(ratesDesk, /Look up wage rates/);
    assert.match(ratesDesk, /ThirdPartyRentalDesk/);
    assert.match(ratesDesk, /RateBuilderCard/);
    assert.match(ratesDesk, /No book yet/);
  });

  it("lists Shahan crafts for a Wood River estimate and shows that craft's book rate", () => {
    const ctx = estimateRateContext("Wood River — Roxana, IL", "Phillips 66");
    assert.equal(ctx.siteId, "site-madison");
    assert.equal(ctx.companyId, "madison");
    const book = wageLookupBook("Wood River — Roxana, IL", "Phillips 66");
    assert.ok(book);
    assert.equal(book.source, "shahan");
    assert.equal(book.label, SHAHAN_BOOK_LABEL);
    const titles = book.positions.map((row) => row.title);
    assert.equal(titles.some((title) => title.includes("Boilermaker Journeyman")), true);
    assert.equal(titles.some((title) => title.includes("Lead Site Boilermaker 01")), true);
    assert.equal(titles.some((title) => title.includes("PIPEFITTER JOURNEYMAN")), true);
    assert.equal(book.positions.length, SHAHAN_LABOR.length);

    const journeyman = book.positions.find((row) => row.title === "Boilermaker Journeyman");
    assert.ok(journeyman);
    const sheet = lookupShahanLabor("Boilermaker Journeyman");
    assert.equal(journeyman.st, sheet?.st);
    assert.equal(journeyman.ot, sheet?.ot);
    assert.equal(journeyman.dt, sheet?.dt);
    assert.equal(journeyman.st, 108.38);
    assert.equal(journeyman.ot, 152.78);
    assert.equal(journeyman.dt, 197.19);
    const picked = lookupWageRate("Wood River", "Phillips 66", journeyman.id);
    assert.equal(picked?.st, 108.38);
    assert.match(formatWageRate(journeyman), /\$108\.38/);
    assert.match(formatWageRate(journeyman), /\$152\.78/);
    assert.match(formatWageRate(journeyman), /\$197\.19/);
    assert.equal(
      wageLookupPositions("Wood River — Roxana, IL", "Phillips 66").some((row) => row.id === journeyman.id),
      true,
    );
  });

  it("shows No book yet for a site without a rate book", () => {
    assert.equal(wageLookupBook("Yates", "Georgia Power"), null);
    assert.equal(wageLookupBook("Rodeo", "Phillips 66"), null);
    assert.equal(wageLookupBook("Bayway", "Phillips 66"), null);
    assert.equal(estimateRateContext("Yates", "Georgia Power").siteId, YATES_SITE_ID);
    assert.deepEqual(wageLookupPositions("Yates", "Georgia Power"), []);
    const desk = readFileSync(fileURLToPath(new URL("../components/WageLookupDesk.tsx", import.meta.url)), "utf8");
    assert.match(desk, new RegExp(WAGE_LOOKUP_EMPTY));
  });

  it("reads a saved builder book on a non-Wood River site and does not invent dollars", () => {
    const store = memoryStore();
    saveCraftToLevel(
      {
        companyId: "madison",
        siteId: YATES_SITE_ID,
        label: "Yates working",
        craft: newBuiltCraft({ craft: "Operator", baseSt: 38 }),
        level: "site",
      },
      store,
    );
    const book = wageLookupBook("Yates", "Georgia Power", store);
    assert.ok(book);
    assert.equal(book.source, "builder");
    const operator = book.positions.find((row) => row.title === "Operator");
    assert.ok(operator);
    assert.equal(operator.st, 38);
    assert.equal(operator.ot, 57);
    assert.equal(operator.dt, 76);
    assert.equal(wageLookupBook("Yates", "Georgia Power"), null);
  });
});
