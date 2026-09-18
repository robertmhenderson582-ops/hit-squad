import assert from "node:assert/strict";
import { describe, it } from "node:test";
import JSZip from "jszip";
import {
  addClaimLine,
  addCraftLine,
  addLogRow,
  addScrAttachments,
  applyScrClientLabels,
  blankLogRow,
  DEFAULT_SCOPE_ID_LABEL,
  emptyFcrPacket,
  fcrSummary,
  formatScrMoney,
  logRowScope,
  P66_SCOPE_ID_LABEL,
  parseFcrPacket,
  patchLogRow,
  seedScopeIdLabel,
  submitScrEstimate,
  toggleScrWhy,
} from "./change-order-packet.ts";
import { defaultPhaseSchedule } from "./phase-schedule.ts";
import {
  scrActiveSchedule,
  scrCompositeHourlyRate,
  scrCompositeRates,
  scrCraftOptions,
  scrPhaseOptions,
  scrPlantBilledTitles,
  scrRateVaultTitles,
  scrWeekSplit,
} from "./scr-rates.ts";
import { LISTED_POSITIONS } from "./craft-labor.ts";
import type { StorageLike } from "./local-estimates.ts";
import { newBuiltCraft } from "./rate-builder.ts";
import { BILLINGS_SITE_ID, WOOD_RIVER_SITE_ID, saveCraftToLevel } from "./rate-books.ts";
import { SHAHAN_LABOR, uniqueSortedTitles } from "./shahan-wood-river.ts";
import { wageLookupPositions } from "./wage-lookup.ts";
import { scrWorkbookTotal, buildScrWorkbook } from "./scr-xlsx.ts";
import { scrToZip, scrZipBackupPath, scrZipFilename, SCR_ZIP_BACKUPS_FOLDER } from "./scr-zip.ts";

const WOOD = "Wood River — Roxana, IL";
const P66 = "Phillips 66";
const SITES = [
  ["Phillips 66", "Wood River — Roxana, IL"],
  ["Phillips 66", "Bayway"],
  ["Phillips 66", "Rodeo"],
  ["Phillips 66", "Ferndale"],
  ["Monroe Energy", "Trainer"],
  ["Georgia Power", "Plant Yates"],
] as const;

describe("SCR estimate workbook lock", () => {
  it("hours × schedule-aware composite matches plant-book ST/OT weights", () => {
    const book = scrCompositeRates("Boilermaker Journeyman", WOOD, P66);
    assert.equal(book.st, 108.38);
    assert.equal(book.ot, 152.78);
    const sixTens = {
      daysPerWeek: 6,
      hoursPerDay: 10,
      otAfter8: true,
      phaseId: "mech",
    };
    const split = scrWeekSplit(sixTens, WOOD, P66, "Boilermaker Journeyman");
    assert.equal(split.st, 40);
    assert.equal(split.ot, 20);
    const rate = scrCompositeHourlyRate("Boilermaker Journeyman", WOOD, P66, sixTens);
    assert.equal(rate, Math.round(((40 * 108.38 + 20 * 152.78) / 60) * 100) / 100);
    const line = { hours: 120, rate };
    const labor = Math.round(120 * rate * 100) / 100;
    assert.equal(Math.round(line.hours * line.rate * 100) / 100, labor);
  });

  it("phase default schedule and optional shift recompute different composite $/hr", () => {
    const phases = scrPhaseOptions(defaultPhaseSchedule());
    const mech = phases.find((row) => row.id === "mech");
    assert.ok(mech);
    const fromPhase = scrActiveSchedule({ phaseId: "mech" }, phases);
    assert.equal(fromPhase.daysPerWeek, 6);
    assert.equal(fromPhase.hoursPerDay, 10);
    const phaseRate = scrCompositeHourlyRate("Boilermaker Journeyman", WOOD, P66, fromPhase);
    const fromShift = scrActiveSchedule({ phaseId: "mech", scheduleImpact: true, shiftId: "5x8" }, phases);
    assert.equal(fromShift.daysPerWeek, 5);
    assert.equal(fromShift.hoursPerDay, 8);
    const shiftRate = scrCompositeHourlyRate("Boilermaker Journeyman", WOOD, P66, fromShift);
    assert.equal(shiftRate, 108.38);
    assert.notEqual(phaseRate, shiftRate);
  });

  it("Scope ID label is the same field — default, P66 seed, and rename", () => {
    assert.equal(seedScopeIdLabel(), DEFAULT_SCOPE_ID_LABEL);
    assert.equal(seedScopeIdLabel("Georgia Power", "Plant Yates"), DEFAULT_SCOPE_ID_LABEL);
    assert.equal(seedScopeIdLabel("Phillips 66", WOOD), P66_SCOPE_ID_LABEL);
    assert.equal(seedScopeIdLabel("P66", "Bayway"), P66_SCOPE_ID_LABEL);
    assert.equal(seedScopeIdLabel("Phillips 66", WOOD, "Unit #"), "Unit #");
    const wood = applyScrClientLabels(emptyFcrPacket(), "Phillips 66", WOOD);
    const yates = applyScrClientLabels(emptyFcrPacket(), "Georgia Power", "Plant Yates");
    assert.equal(wood.scopeIdLabel, P66_SCOPE_ID_LABEL);
    assert.equal(yates.scopeIdLabel, DEFAULT_SCOPE_ID_LABEL);
    assert.equal(applyScrClientLabels(wood, "Phillips 66", WOOD).scopeIdLabel, P66_SCOPE_ID_LABEL);
    const renamed = applyScrClientLabels({ ...yates, scopeIdLabel: "Job tag" }, "Georgia Power", "Plant Yates");
    assert.equal(renamed.scopeIdLabel, "Job tag");
  });

  it("Why SCR is multi-select and Other keeps a note", () => {
    const row = {
      ...blankLogRow(),
      whyReasons: toggleScrWhy([], "Field discovery"),
    };
    const withOther = {
      ...row,
      whyReasons: toggleScrWhy(row.whyReasons, "Other"),
      whyOther: "IFC late addendum",
    };
    assert.deepEqual(withOther.whyReasons, ["Field discovery", "Other"]);
    const off = toggleScrWhy(withOther.whyReasons, "Field discovery");
    assert.deepEqual(off, ["Other"]);
    const saved = parseFcrPacket({
      log: [{ id: "why-1", whyReasons: ["Field discovery", "Other", "not-a-reason"], whyOther: "note" }],
    });
    assert.deepEqual(saved.log[0]?.whyReasons, ["Field discovery", "Other"]);
    assert.equal(saved.log[0]?.whyOther, "note");
  });

  it("Addition vs Credit signs labor, claims, and the desk total", () => {
    let packet = addLogRow(emptyFcrPacket(), { id: "scr-credit", scr: "SCR-4", scrType: "Addition" });
    packet = addCraftLine(packet, "scr-credit", { hours: 120, rate: 142.5, craft: "Pipefitter" });
    packet = addClaimLine(packet, "scr-credit", { type: "Material", description: "Alloy", amount: 375 });
    const add = logRowScope(packet.log[0]!);
    assert.equal(add.labor, 17100);
    assert.equal(add.claims, 375);
    assert.equal(add.cost, 17475);
    assert.equal(add.sign, 1);
    const creditPacket = patchLogRow(packet, "scr-credit", { scrType: "Credit" });
    const credit = logRowScope(creditPacket.log[0]!);
    assert.equal(credit.labor, -17100);
    assert.equal(credit.claims, -375);
    assert.equal(credit.cost, -17475);
    assert.equal(formatScrMoney(credit.cost), "($17,475.00)");
    assert.equal(fcrSummary(creditPacket).scrCost, -17475);
    const sheets = buildScrWorkbook({ client: P66, site: WOOD, title: "Boiler 17", packet: creditPacket });
    assert.equal(scrWorkbookTotal(sheets), -17475);
  });

  it("status and Client SCR ID persist through Submit and stay on the log", () => {
    let packet = addLogRow(emptyFcrPacket(), {
      id: "scr-status",
      submittedAt: "",
      scope: "Leaking elbow",
      clientScrId: "",
    });
    packet = submitScrEstimate(packet, "scr-status", new Date("2026-09-17T15:36:00Z"));
    assert.equal(packet.log[0]?.status, "Submitted");
    assert.equal(packet.log[0]?.scr, "SCR-1");
    packet = patchLogRow(packet, "scr-status", { status: "Approved", clientScrId: "SCR-WR-11877" });
    const again = submitScrEstimate(packet, "scr-status", new Date("2026-09-18T12:00:00Z"));
    assert.equal(again.log[0]?.status, "Approved");
    assert.equal(again.log[0]?.clientScrId, "SCR-WR-11877");
    assert.equal(again.log[0]?.scr, "SCR-1");
    const legacy = parseFcrPacket({
      log: [{ id: "old", status: "Open", clientScrId: "legacy-9", craftLines: [{ stHours: 8, otHours: 2, stRate: 90 }] }],
    });
    assert.equal(legacy.log[0]?.status, "Submitted");
    assert.equal(legacy.log[0]?.clientScrId, "legacy-9");
    assert.equal(legacy.log[0]?.craftLines[0]?.hours, 10);
    assert.equal(legacy.log[0]?.scrType, "Addition");
  });

  it("ZIP package is site/job/SCR/Scope ID and copies the polished xlsx plus backups", async () => {
    let packet = addLogRow(emptyFcrPacket(), {
      id: "scr-zip",
      scr: "SCR-004",
      scopeId: "184772",
      scope: "Leaking elbow",
      clientScrId: "SCR-WR-11877",
      status: "Approved",
    });
    packet = addCraftLine(packet, "scr-zip", { hours: 40, rate: 100, craft: "Pipefitter" });
    packet = addScrAttachments(packet, "scr-zip", [
      { id: "att-1", name: "IPS-Boiler17-excerpt.pdf", type: "application/pdf", size: 80 },
    ]);
    const input = {
      client: P66,
      site: WOOD,
      title: "Boiler 17",
      packet,
      selectedId: "scr-zip",
      attachments: [{ name: "IPS-Boiler17-excerpt.pdf", scr: "SCR-004", bytes: new TextEncoder().encode("%PDF-1.4 backup") }],
    };
    assert.match(scrZipFilename(input), /wood-river/);
    assert.match(scrZipFilename(input), /boiler-17/);
    assert.match(scrZipFilename(input), /scr-004/);
    assert.match(scrZipFilename(input), /184772/);
    assert.match(scrZipFilename(input), /\.zip$/);
    const bytes = await scrToZip(input);
    const zip = await JSZip.loadAsync(bytes);
    const names = Object.keys(zip.files).filter((name) => !zip.files[name]?.dir);
    assert.ok(names.some((name) => name.endsWith(".xlsx")));
    assert.ok(names.includes(scrZipBackupPath({ name: "IPS-Boiler17-excerpt.pdf", scr: "SCR-004" })));
    assert.ok(names.some((name) => name.startsWith(`${SCR_ZIP_BACKUPS_FOLDER}/`)));
    const pdf = await zip.file(scrZipBackupPath({ name: "IPS-Boiler17-excerpt.pdf", scr: "SCR-004" }))?.async("string");
    assert.equal(pdf?.startsWith("%PDF"), true);
    const sheets = buildScrWorkbook(input);
    assert.equal(scrWorkbookTotal(sheets), fcrSummary(packet).scrCost);
  });

  it("the same SCR shape is the platform default — labels only change by client", () => {
    const keys = Object.keys(blankLogRow()).filter((key) => key !== "id").sort();
    for (const [client, site] of SITES) {
      const packet = applyScrClientLabels(
        parseFcrPacket({
          log: [
            {
              id: `${site}-1`,
              scr: "SCR-1",
              scope: "Field add",
              craftLines: [{ hours: 8, rate: 100 }],
            },
          ],
        }),
        client,
        site,
      );
      assert.deepEqual(Object.keys(packet.log[0]!).filter((key) => key !== "id").sort(), keys);
      assert.equal(packet.log[0]?.scrType, "Addition");
      assert.equal("clientScrId" in packet.log[0]!, true);
      assert.equal("scopeId" in packet.log[0]!, true);
      assert.equal("phaseId" in packet.log[0]!, true);
      assert.equal(packet.log[0]?.craftLines[0]?.hours, 8);
      assert.equal("stHours" in packet.log[0]!.craftLines[0]!, false);
      if (/phillips 66|\bp66\b/i.test(client)) {
        assert.equal(packet.scopeIdLabel, P66_SCOPE_ID_LABEL);
      } else {
        assert.equal(packet.scopeIdLabel, DEFAULT_SCOPE_ID_LABEL);
      }
    }
  });
});

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

describe("SCR craft dropdown sources", () => {
  it("prefers Rate Vault crafts, then crew extras, then full plant billed catalog — not wage-only", () => {
    const wageTitles = wageLookupPositions(WOOD, P66).map((row) => row.title);
    assert.ok(wageTitles.includes("LEAD SITE BOILERMAKER 01"));
    assert.equal(wageTitles.includes("Lead Site Boilermaker 01"), false);

    const billed = scrPlantBilledTitles(WOOD, P66);
    assert.ok(billed.includes("Lead Site Boilermaker 01"));
    assert.ok(billed.includes("Boilermaker Journeyman"));
    assert.equal(billed.includes("LEAD SITE BOILERMAKER 01"), false);
    assert.ok(billed.length >= uniqueSortedTitles(SHAHAN_LABOR.map((row) => row.craftName)).length);

    const plantOnly = scrCraftOptions(WOOD, P66);
    assert.ok(plantOnly.includes("Lead Site Boilermaker 01"));
    assert.ok(plantOnly.includes("Boilermaker Journeyman"));
    assert.equal(plantOnly.includes("LEAD SITE BOILERMAKER 01"), false);
    assert.deepEqual(plantOnly, uniqueSortedTitles(billed));
    assert.equal(scrRateVaultTitles(WOOD, P66, memoryStore()).length, 0);

    const store = memoryStore();
    saveCraftToLevel(
      {
        companyId: "madison",
        siteId: WOOD_RIVER_SITE_ID,
        label: "Wood River vault",
        craft: newBuiltCraft({ craft: "Vault Welder X" }),
        level: "site",
      },
      store,
    );
    const withVault = scrCraftOptions(WOOD, P66, ["Crew Only Title", "  "], store);
    assert.ok(withVault.includes("Vault Welder X"));
    assert.ok(withVault.includes("Crew Only Title"));
    assert.ok(withVault.includes("Lead Site Boilermaker 01"));
    assert.deepEqual(withVault, uniqueSortedTitles(["Vault Welder X", "Crew Only Title", ...billed]));
    assert.deepEqual(scrRateVaultTitles(WOOD, P66, store), ["Vault Welder X"]);
  });

  it("falls back to LISTED_POSITIONS only when vault and plant billed catalog are empty", () => {
    assert.deepEqual(scrCraftOptions("", ""), uniqueSortedTitles(LISTED_POSITIONS));
    assert.deepEqual(scrCraftOptions("Billings", P66), uniqueSortedTitles(LISTED_POSITIONS));
    assert.deepEqual(
      scrCraftOptions("Billings", P66, ["Freeform Helper"]),
      uniqueSortedTitles([...LISTED_POSITIONS, "Freeform Helper"]),
    );

    const store = memoryStore();
    saveCraftToLevel(
      {
        companyId: "madison",
        siteId: BILLINGS_SITE_ID,
        label: "Billings vault",
        craft: newBuiltCraft({ craft: "Billings Operator" }),
        level: "site",
      },
      store,
    );
    const vaultOnly = scrCraftOptions("Billings", P66, ["Night Helper"], store);
    assert.deepEqual(vaultOnly, uniqueSortedTitles(["Billings Operator", "Night Helper"]));
    assert.equal(LISTED_POSITIONS.every((title) => vaultOnly.includes(title)), false);
  });
});
