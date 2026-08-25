import assert from "node:assert/strict";
import { test } from "node:test";
import { b2ItemById } from "./b2-east-coast.ts";
import {
  blankThirdParty,
  emptyEquipmentSheet,
  equipmentTotals,
  largeToolAmount,
  thirdPartyCost,
  thirdPartyMarkedUp,
  type LargeToolLine,
} from "./equipment-sheet.ts";

test("third-party rental is typed cost + 6%, not a COMP picker", () => {
  const line = { ...blankThirdParty(), item: "Crane", period: "weekly" as const, rate: 1000, freight: 200, qty: 2 };
  assert.equal(thirdPartyCost(line), 2200);
  assert.equal(thirdPartyMarkedUp(line), 2332);
  assert.equal("itemId" in line, false);
  assert.equal(b2ItemById("crane"), undefined);
});

test("large tools use the East Coast listed dry rate", () => {
  const mover = b2ItemById("air-mover");
  assert.ok(mover);
  const line: LargeToolLine = {
    id: "lt-1",
    itemId: "air-mover",
    period: "daily",
    qty: 2,
    start: "",
    end: "",
    enteredCost: 0,
  };
  assert.equal(largeToolAmount(line), 64);
  const sheet = emptyEquipmentSheet();
  sheet.largeTools = [line];
  sheet.thirdParty = [{ ...blankThirdParty(), rate: 100, freight: 0, qty: 1 }];
  const totals = equipmentTotals(sheet);
  assert.equal(totals.largeTools, 64);
  assert.equal(totals.thirdParty, 106);
  assert.equal(totals.total, 170);
});

test("unlisted large tools cannot be billed", () => {
  assert.equal(
    largeToolAmount({
      id: "x",
      itemId: "made-up-crane",
      period: "daily",
      qty: 1,
      start: "",
      end: "",
      enteredCost: 999,
    }),
    0,
  );
});
