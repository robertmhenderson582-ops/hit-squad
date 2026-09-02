import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { canUseRateBuilder } from "./desk-role.ts";
import { NO_RATES_CHOICES, NO_RATES_NOTICE, newEstimateNeedsRatesNotice } from "./estimate-rates-gate.ts";
import type { StorageLike } from "./local-estimates.ts";
import { OWNER_LOGIN_EMAIL } from "./owner-login.ts";
import { newBuiltCraft } from "./rate-builder.ts";
import { companyHasEstablishedRates, importRateBuilderSheetToCompany, saveCraftToLevel } from "./rate-books.ts";
import { JOSEPH_EMAIL } from "./tester-seats.ts";

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

const owner = { id: "owner-robert-henderson", email: OWNER_LOGIN_EMAIL, name: "Robert Henderson", role: "owner" as const };
const joseph = { id: "tester-joseph", email: JOSEPH_EMAIL, name: "Joseph Henderson", role: "tester" as const };
const extra = { id: "custom-no-rates", email: "added.tester@example.com", name: "Added Tester", role: "tester" as const };

describe("New Estimate no-rates gate", () => {
  it("lets Joseph open Rate builder", () => {
    assert.equal(canUseRateBuilder(joseph), true);
    const rates = readFileSync(fileURLToPath(new URL("../components/RatesDesk.tsx", import.meta.url)), "utf8");
    const card = readFileSync(fileURLToPath(new URL("../components/RateBuilderCard.tsx", import.meta.url)), "utf8");
    assert.match(rates, /canUseRateBuilder\(lens\)/);
    assert.match(rates, /RateBuilderCard/);
    assert.match(card, /Rate builder/);
    assert.match(card, /LABOR_SHEET|BASE WAGE \(BW\)|BILLED ST/);
  });

  it("does not block the owner when Madison rates already exist", () => {
    assert.equal(companyHasEstablishedRates("madison"), true);
    assert.equal(newEstimateNeedsRatesNotice(owner), false);
    assert.equal(newEstimateNeedsRatesNotice({ email: "nathanboyte@gmail.com", role: "tester" }), false);
  });

  it("notifies a seat with no company rates and offers Rate builder or upload", () => {
    const store = memoryStore();
    assert.equal(companyHasEstablishedRates("hitsquad", store), false);
    assert.equal(newEstimateNeedsRatesNotice(joseph, store), true);
    assert.equal(newEstimateNeedsRatesNotice(extra, store), true);
    assert.match(NO_RATES_NOTICE, /no rates saved/i);
    assert.match(NO_RATES_CHOICES, /Upload billing rates/);
    assert.match(NO_RATES_CHOICES, /Rate builder/);

    const modal = readFileSync(fileURLToPath(new URL("../components/NewEstimateModal.tsx", import.meta.url)), "utf8");
    const form = readFileSync(fileURLToPath(new URL("../components/NewEstimateForm.tsx", import.meta.url)), "utf8");
    const notice = readFileSync(fileURLToPath(new URL("../components/NoRatesNotice.tsx", import.meta.url)), "utf8");
    assert.match(modal, /newEstimateNeedsRatesNotice/);
    assert.match(modal, /NoRatesNotice/);
    assert.match(form, /newEstimateNeedsRatesNotice/);
    assert.match(form, /NoRatesNotice/);
    assert.match(notice, /NO_RATES_NOTICE/);
    assert.match(notice, /Upload billing rates/);
    assert.match(notice, /Use Rate builder/);
    assert.match(notice, /importRateBuilderSheetToCompany/);
    assert.match(notice, /\/rates/);

    const imported = importRateBuilderSheetToCompany(
      {
        companyId: "hitsquad",
        text: "Craft / Position,Base Wage (BW)\nWelder,42",
      },
      store,
    );
    assert.equal(imported.crafts.length, 1);
    assert.equal(companyHasEstablishedRates("hitsquad", store), true);
    assert.equal(newEstimateNeedsRatesNotice(extra, store), false);

    const other = memoryStore();
    saveCraftToLevel(
      { companyId: "hitsquad", craft: newBuiltCraft({ craft: "Operator", baseSt: 38 }), level: "company" },
      other,
    );
    assert.equal(newEstimateNeedsRatesNotice(joseph, other), false);
  });
});
