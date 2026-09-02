import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { blankThirdParty, thirdPartyCost, thirdPartyMarkedUp } from "./equipment-sheet.ts";
import {
  WOOD_RIVER_THIRD_PARTY_RENTAL,
  applyThirdPartyCatalogItem,
  applyThirdPartyCatalogPeriod,
  defaultThirdPartyPeriod,
  lookupThirdPartyRental,
  thirdPartyRentalDescriptions,
  thirdPartyRentalPeriodRate,
  type ThirdPartyRentalRow,
} from "./third-party-rental.ts";

const CATALOG_PATH = fileURLToPath(new URL("./third-party-rental.ts", import.meta.url));
const DESK_PATH = fileURLToPath(new URL("../components/EquipmentDesk.tsx", import.meta.url));

function row(description: string) {
  const found = lookupThirdPartyRental(description);
  assert.ok(found, `missing ${description}`);
  return found;
}

describe("Wood River third-party rental catalog", () => {
  it("has 69 sheet items with verbatim titles and table dollars — not job-used overrides", () => {
    assert.equal(WOOD_RIVER_THIRD_PARTY_RENTAL.length, 69);
    assert.deepEqual(thirdPartyRentalDescriptions(), WOOD_RIVER_THIRD_PARTY_RENTAL.map((item) => item.description));
    const pulse = row("6 pack Stick/Tig / Mig pulse");
    assert.equal(pulse.monthly, 1225);
    assert.equal(pulse.freight, 50);
    assert.equal(pulse.daily, 61.25);
    assert.equal(pulse.weekly, 306.24);
    assert.notEqual(pulse.monthly, 1830);
    const skip = row("Skip Pan");
    assert.equal(skip.monthly, 847);
    assert.equal(skip.freight, 100);
    const boxes = row("Breathing Boxes, Hoses, Yokes and Masks");
    assert.equal(boxes.monthly, 18350);
    assert.equal(boxes.freight, 1200);
    const clam = row("10\" clam shell");
    assert.equal(clam.daily, null);
    assert.equal(clam.weekly, null);
    assert.equal(clam.monthly, 2540);
    assert.equal(clam.freight, 200);
    assert.equal(thirdPartyRentalPeriodRate(clam, "daily"), 0);
    assert.equal(thirdPartyRentalPeriodRate(clam, "weekly"), 0);
    assert.equal(thirdPartyRentalPeriodRate(clam, "monthly"), 2540);
    assert.equal(row("Sissor Lift").description, "Sissor Lift");
    assert.equal(row("15 passanger van").description, "15 passanger van");
    assert.equal(row("Air Reciever 240 gallon").description, "Air Reciever 240 gallon");
    assert.equal(row("25 ton shackels").description, "25 ton shackels");
    assert.equal(row("Air blower 20\" Pnematic").description, "Air blower 20\" Pnematic");
    assert.equal(row("1.5 ton air hoist  , 50ft load").description, "1.5 ton air hoist  , 50ft load");
    const spider = row("Spider box / 220 Vote cords");
    assert.equal(spider.description, "Spider box / 220 Vote cords");
    assert.equal(spider.monthly, 75);
    assert.equal(spider.freight, 150);
    assert.equal(spider.daily, 0);
    assert.equal(spider.weekly, 0);
    assert.notEqual(spider.daily, 15);
    const source = readFileSync(CATALOG_PATH, "utf8");
    assert.equal(/1830/.test(source), false);
    assert.equal(/cost\s*plus/i.test(source), false);
  });

  it("selecting a listed item fills period rate and freight; 0 / null stay 0", () => {
    const pulse = applyThirdPartyCatalogItem(blankThirdParty(), "6 pack Stick/Tig / Mig pulse");
    assert.equal(pulse.item, "6 pack Stick/Tig / Mig pulse");
    assert.equal(pulse.period, "monthly");
    assert.equal(pulse.rate, 1225);
    assert.equal(pulse.freight, 50);
    const daily = applyThirdPartyCatalogPeriod(pulse, "daily");
    assert.equal(daily.period, "daily");
    assert.equal(daily.rate, 61.25);
    assert.equal(daily.freight, 50);
    const clam = applyThirdPartyCatalogItem(blankThirdParty(), "10\" clam shell");
    assert.equal(clam.period, "monthly");
    assert.equal(clam.rate, 2540);
    assert.equal(applyThirdPartyCatalogPeriod(clam, "daily").rate, 0);
    assert.equal(applyThirdPartyCatalogPeriod(clam, "weekly").rate, 0);
    const guns = applyThirdPartyCatalogItem(blankThirdParty(), "LN 25 Mig guns");
    assert.equal(guns.period, "monthly");
    assert.equal(guns.rate, 225);
    assert.equal(applyThirdPartyCatalogPeriod(guns, "daily").rate, 0);
    const spider = applyThirdPartyCatalogItem(blankThirdParty(), "Spider box / 220 Vote cords");
    assert.equal(spider.item, "Spider box / 220 Vote cords");
    assert.equal(spider.period, "monthly");
    assert.equal(spider.rate, 75);
    assert.equal(spider.freight, 150);
    assert.equal(applyThirdPartyCatalogPeriod(spider, "daily").rate, 0);
    assert.equal(applyThirdPartyCatalogPeriod(spider, "weekly").rate, 0);
  });

  it("defaults new-line period to monthly when that rate exists, else weekly, else daily", () => {
    assert.equal(blankThirdParty().period, "monthly");
    assert.equal(defaultThirdPartyPeriod(row("Skip Pan")), "monthly");
    const weeklyOnly: ThirdPartyRentalRow = {
      description: "weekly only",
      daily: 0,
      weekly: 56,
      monthly: null,
      freight: 25,
    };
    assert.equal(defaultThirdPartyPeriod(weeklyOnly), "weekly");
    const dailyOnly: ThirdPartyRentalRow = {
      description: "daily only",
      daily: 10,
      weekly: 0,
      monthly: 0,
      freight: 0,
    };
    assert.equal(defaultThirdPartyPeriod(dailyOnly), "daily");
  });

  it("custom items stay typed — do not invent a rate", () => {
    const typed = { ...blankThirdParty(), item: "Made-up crane", rate: 400, freight: 75, period: "weekly" as const };
    const next = applyThirdPartyCatalogItem(typed, "Made-up crane");
    assert.equal(lookupThirdPartyRental("Made-up crane"), null);
    assert.equal(next.item, "Made-up crane");
    assert.equal(next.rate, 400);
    assert.equal(next.freight, 75);
    assert.equal(next.period, "weekly");
    const period = applyThirdPartyCatalogPeriod(next, "daily");
    assert.equal(period.rate, 400);
    assert.equal(period.period, "daily");
    assert.equal(thirdPartyCost({ ...typed, qty: 1 }), 475);
    assert.equal(thirdPartyMarkedUp({ ...typed, qty: 1 }), 503.5);
  });

  it("EquipmentDesk picks the Wood River table and keeps 6% markup; no workbooks in git", () => {
    const desk = readFileSync(DESK_PATH, "utf8");
    assert.match(desk, /CatalogPick/);
    assert.match(desk, /thirdPartyRentalDescriptions/);
    assert.match(desk, /\/api\/desk\/rates\/third-party/);
    assert.match(desk, /applyThirdPartyCatalogItem/);
    assert.match(desk, /applyThirdPartyCatalogPeriod/);
    assert.match(desk, /catalog/);
    assert.match(desk, /Third-party rental uses the Wood River third-party table/);
    assert.match(desk, /Large tools stay Shahan COMP/);
    assert.match(desk, /thirdPartyMarkedUp/);
    assert.match(desk, /useConfirmRemove/);
    assert.match(desk, /removeEquipmentLine/);
    assert.match(desk, /trash-btn/);
    assert.match(desk, /\+ Add large tool/);
    assert.match(desk, /\+ Add rental/);
    assert.equal(/No COMP rental book/.test(desk), false);
    assert.equal(/Third-party rental is typed/.test(desk), false);
    const listed = execSync('git ls-files "*.xlsx" "*.xlsm" "*.xls" "*.pdf"', { encoding: "utf8" }).trim();
    assert.equal(listed, "");
  });
});
