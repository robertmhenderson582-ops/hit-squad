import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AROMATICS_FREEZE_PROJECT_START } from "./aromatics-freeze.ts";
import { BOILER17_PACK_ID } from "./boiler-17.ts";
import { HIS_AROMATICS_PACK_ID, HIS_CAT2_PACK_ID } from "./his-wood-river.ts";
import { defaultPhaseSchedule } from "./phase-schedule.ts";
import {
  AROMATICS_FREEZE_GRAND_TOTAL,
  BOILER17_DEMO_PROJECT_START,
  checkPackBaseline,
  decidePackWrite,
  fingerprintFromPack,
  incomingBreaksFingerprint,
  isCat2Identity,
  isMaterialPackId,
  materialPackBaselines,
  packHasDemoSeedClock,
  packLooksSmashed,
  packPayloadBytes,
  packRichness,
  packStateLooksSmashed,
  rememberPackFingerprint,
  readPackFingerprint,
  shouldHydrateOpenPack,
  shouldSkipIntegrityFlush,
  type IntegrityPack,
} from "./pack-integrity.ts";
import { MONROE_541V_PACK_ID, RODEO_U110_PACK_ID, RODEO_U250_PACK_ID } from "./rodeo-monroe-wake.ts";
import { MONROE_541V_GOLDEN, U110_CONTRACTOR_GOLDEN, U250_CONTRACTOR_GOLDEN } from "./wake-golden.ts";
import fixtures from "./wake-golden/fixtures.json" with { type: "json" };

function aromaticsLive(over: Partial<IntegrityPack> = {}): IntegrityPack {
  return {
    packId: HIS_AROMATICS_PACK_ID,
    title: "2027 Aromatics Turnaround",
    updatedAt: 400,
    schedule: {
      projectStart: AROMATICS_FREEZE_PROJECT_START,
      phases: defaultPhaseSchedule().phases.map((row) =>
        row.id === "pre" ? { ...row, start: "2027-01-11", stop: "2027-02-28" } : { ...row, start: "2027-03-01", stop: "2027-05-21" },
      ),
    },
    crew: { staff: [{ id: "st-1", ranges: [{ phaseId: "pre", start: "2027-01-11", end: "2027-02-28" }] }] },
    otherCost: { misc: [{ id: "mc-1", item: "Alloy rod", qty: 65, each: 1000 }] },
    ...over,
  };
}

function cat2Live(over: Partial<IntegrityPack> = {}): IntegrityPack {
  return {
    packId: HIS_CAT2_PACK_ID,
    title: "Madison CAT 2 (Pit Stop)",
    updatedAt: 400,
    schedule: { projectStart: "2026-09-01", phases: [{ id: "pre", on: true, start: "2026-09-01", stop: "2026-09-03" }] },
    crew: { direct: [{ id: "bm-1", ranges: [{ phaseId: "pre", start: "2026-09-01", end: "2026-09-03" }] }] },
    ...over,
  };
}

function boilerFilled(over: Partial<IntegrityPack> = {}): IntegrityPack {
  return {
    packId: BOILER17_PACK_ID,
    title: "Boiler 17 2026",
    updatedAt: 400,
    schedule: {
      projectStart: "2026-08-10",
      phases: defaultPhaseSchedule().phases.map((row) =>
        row.id === "pre" ? { ...row, start: "2026-08-10", stop: "2026-09-06" } : { ...row, start: "2026-09-07", stop: "2026-12-06" },
      ),
    },
    crew: { staff: [{ id: "st-1", ranges: [{ phaseId: "pre", start: "2026-08-10", end: "2026-12-06" }] }] },
    ...over,
  };
}

function thickBytes(pack: IntegrityPack, size: number): IntegrityPack {
  return {
    ...pack,
    activities: Array.from({ length: Math.max(1, Math.floor(size / 40)) }, (_, index) => ({
      id: `act-${index}`,
      name: `Line ${index} work package`,
      hours: 8,
    })),
  };
}

describe("pack integrity write guards", () => {
  it("locks official baselines and does not invent Monroe $ or Boiler labor $", () => {
    const locked = materialPackBaselines();
    assert.equal(locked.length, 6);
    assert.equal(shouldHydrateOpenPack(HIS_AROMATICS_PACK_ID), true);
    assert.equal(shouldHydrateOpenPack(HIS_CAT2_PACK_ID), true);
    assert.equal(shouldHydrateOpenPack(RODEO_U110_PACK_ID), true);
    assert.equal(shouldHydrateOpenPack(RODEO_U250_PACK_ID), true);
    assert.equal(shouldHydrateOpenPack(MONROE_541V_PACK_ID), true);
    assert.equal(shouldHydrateOpenPack(BOILER17_PACK_ID), true);
    assert.equal(isMaterialPackId("new-cat2pit"), false);
    assert.equal(isCat2Identity({ packId: HIS_CAT2_PACK_ID }), true);

    const aromatics = locked.find((row) => row.packId === HIS_AROMATICS_PACK_ID);
    assert.equal(aromatics?.grandTotal, AROMATICS_FREEZE_GRAND_TOTAL);
    assert.equal(aromatics?.grandTotal, 25_324_671.97);
    assert.equal(aromatics?.projectStart, "2027-01-11");

    const monroe = locked.find((row) => row.packId === MONROE_541V_PACK_ID);
    assert.equal(monroe?.dollarsStatus, "formula-unavailable");
    assert.equal(monroe?.grandTotal, undefined);
    assert.equal(monroe?.totalHours, fixtures.monroe541v.monroeHours.totalLabor);

    const boiler = locked.find((row) => row.packId === BOILER17_PACK_ID);
    assert.equal(boiler?.dollarsStatus, "formula-unavailable");
    assert.equal(boiler?.grandTotal, undefined);
    assert.match(boiler?.note || "", /#REF|Do not invent/i);

    assert.equal(fixtures.u110Contractor.buckets.grandTotal, U110_CONTRACTOR_GOLDEN.buckets?.grandTotal);
    assert.equal(fixtures.u250Contractor.buckets.grandTotal, U250_CONTRACTOR_GOLDEN.buckets?.grandTotal);
  });

  it("empty / identity-only / thin cannot overwrite a thicker live pack", () => {
    const thick = thickBytes(boilerFilled(), 80_000);
    assert.ok(packPayloadBytes(thick) >= 20_000);
    const empty = {
      packId: BOILER17_PACK_ID,
      title: "Boiler 17 2026",
      updatedAt: 99_000,
      schedule: defaultPhaseSchedule(),
      crew: { staff: [], generalForeman: [], foreman: [], direct: [], support: [] },
    };
    const emptyDecision = decidePackWrite(empty, thick);
    assert.equal(emptyDecision.action, "keep-last-good");
    assert.match(emptyDecision.reason, /Empty crew|Thinner|Demo seed|Identity-only/i);

    const identity = { packId: HIS_CAT2_PACK_ID, title: "Madison CAT 2 (Pit Stop)", createdAt: 1, updatedAt: 1 };
    const cat = cat2Live();
    const idDecision = decidePackWrite(identity, cat);
    assert.equal(idDecision.action, "keep-last-good");
    assert.match(idDecision.reason, /Identity-only/i);

    const thin = thickBytes(boilerFilled({ crew: { staff: [] }, schedule: defaultPhaseSchedule() }), 100);
    const thinDecision = decidePackWrite(thin, thick);
    assert.equal(thinDecision.action, "keep-last-good");

    assert.equal(decidePackWrite(thick, empty).action, "accept");
    assert.equal(shouldSkipIntegrityFlush(empty), true);
    assert.equal(shouldSkipIntegrityFlush(identity), true);
  });

  it("demo seed clock cannot wipe a freeze or official live schedule", () => {
    const freeze = aromaticsLive();
    const demo = aromaticsLive({
      updatedAt: 99_000,
      schedule: defaultPhaseSchedule(),
      crew: { staff: [{ id: "st-1", ranges: [{ phaseId: "pre", start: "2026-08-21", end: "2026-08-21" }] }] },
    });
    assert.equal(packHasDemoSeedClock(demo), true);
    assert.equal(packLooksSmashed(demo), true);
    assert.equal(packStateLooksSmashed(HIS_AROMATICS_PACK_ID, demo.schedule, demo.crew, demo.title), true);
    const clock = decidePackWrite(demo, freeze);
    assert.equal(clock.action, "keep-last-good");
    assert.match(clock.reason, /clock|freeze/i);

    const boilerDemo = boilerFilled({
      schedule: { projectStart: BOILER17_DEMO_PROJECT_START, phases: defaultPhaseSchedule().phases },
      crew: { staff: [{ id: "st-1", ranges: [{ start: "2026-08-21", end: "2026-08-21" }] }] },
    });
    assert.equal(packHasDemoSeedClock(boilerDemo), true);
    assert.equal(decidePackWrite(boilerDemo, boilerFilled()).action, "keep-last-good");

    const cat2Seed = cat2Live({ schedule: defaultPhaseSchedule() });
    assert.equal(isCat2Identity(cat2Seed), true);
    assert.equal(packHasDemoSeedClock(cat2Live()), false);
    assert.equal(packLooksSmashed(cat2Live()), false);
    assert.equal(decidePackWrite(cat2Seed, cat2Live()).action, "keep-last-good");
  });

  it("baseline mismatch is a fault and formula-unavailable packs skip invented dollars", () => {
    const smashed = aromaticsLive({ schedule: defaultPhaseSchedule() });
    const smashCheck = checkPackBaseline(smashed, { grandTotal: 5_371_798.92 });
    assert.equal(smashCheck.ok, false);
    assert.match(smashCheck.fault || "", /integrity fault|clock|smash/i);

    const aromaOk = checkPackBaseline(aromaticsLive(), { grandTotal: AROMATICS_FREEZE_GRAND_TOTAL });
    assert.equal(aromaOk.ok, true);

    const aromaDrift = checkPackBaseline(aromaticsLive(), { grandTotal: 5_371_798.92 });
    assert.equal(aromaDrift.ok, false);
    assert.match(aromaDrift.fault || "", /25,?324,?671\.97/);

    const u110 = {
      packId: RODEO_U110_PACK_ID,
      title: "Rodeo U110 2026 TA",
      updatedAt: 10,
      crew: { direct: [{ id: "d-1" }] },
      schedule: { projectStart: "2026-07-22", phases: [{ id: "pre", start: "2026-07-22", stop: "2026-08-01" }] },
    };
    assert.equal(
      checkPackBaseline(u110, {
        grandTotal: fixtures.u110Contractor.buckets.grandTotal,
        totalHours: fixtures.u110Contractor.buckets.totalHours,
      }).ok,
      true,
    );
    assert.equal(checkPackBaseline(u110, { grandTotal: 1 }).ok, false);

    const u250 = {
      packId: RODEO_U250_PACK_ID,
      title: "Rodeo U250 Fall 2026",
      updatedAt: 10,
      crew: { direct: [{ id: "d-1" }] },
      schedule: { projectStart: "2026-07-22", phases: [{ id: "pre", start: "2026-07-22", stop: "2026-08-01" }] },
    };
    assert.equal(
      checkPackBaseline(u250, { grandTotal: U250_CONTRACTOR_GOLDEN.buckets?.grandTotal }).ok,
      true,
    );

    const monroe = {
      packId: MONROE_541V_PACK_ID,
      title: "Monroe 541V",
      updatedAt: 10,
      crew: { staff: [{ id: "st-1" }] },
      schedule: { projectStart: "2026-06-16", phases: [{ id: "pre", start: "2026-06-16", stop: "2026-07-01" }] },
    };
    const monroeDollars = checkPackBaseline(monroe, { grandTotal: 9_999_999, totalHours: MONROE_541V_GOLDEN.monroeHours?.totalLabor });
    assert.equal(monroeDollars.ok, true);
    assert.equal(monroeDollars.skipped, "dollars-unavailable");
    const monroeHours = checkPackBaseline(monroe, { totalHours: 12 });
    assert.equal(monroeHours.ok, false);

    const cat = checkPackBaseline(cat2Live());
    assert.equal(cat.ok, true);
    assert.equal(cat.skipped, "structure-only");

    const boiler = checkPackBaseline(boilerFilled());
    assert.equal(boiler.ok, true);
    assert.equal(boiler.skipped, "dollars-unavailable");
  });

  it("remembers a fingerprint and refuses a later empty Drive hydrate smash", () => {
    const store = new Map<string, string>();
    const memory = {
      getItem(key: string) {
        return store.has(key) ? store.get(key)! : null;
      },
      setItem(key: string, value: string) {
        store.set(key, value);
      },
    };
    const live = thickBytes(aromaticsLive(), 40_000);
    rememberPackFingerprint(memory, live);
    const fp = readPackFingerprint(memory, HIS_AROMATICS_PACK_ID);
    assert.ok(fp);
    assert.equal(fingerprintFromPack(live).crewRows, 1);
    const empty = {
      packId: HIS_AROMATICS_PACK_ID,
      title: "2027 Aromatics Turnaround",
      schedule: defaultPhaseSchedule(),
      crew: { staff: [] },
    };
    assert.match(incomingBreaksFingerprint(empty, fp) || "", /Empty crew|Demo seed|Thinner|Identity-only/i);
    rememberPackFingerprint(memory, empty);
    assert.equal(readPackFingerprint(memory, HIS_AROMATICS_PACK_ID)?.crewRows, fp.crewRows);
  });
});
