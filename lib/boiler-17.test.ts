import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  BOILER17_COST_NOTE,
  BOILER17_JOB_CODE,
  BOILER17_JOB_NUMBER,
  BOILER17_PACK_ID,
  BOILER17_STATUS,
  BOILER17_TITLE,
  boiler17NeedsB1Fill,
  boiler17WorkingFigure,
  checkMikeCppr108451,
  defaultStatusForBoiler17,
  isBoiler17Identity,
  jobNumberForPack,
  MIKE_CPPR_108451_MAY_LABOR_PD_TRAVEL,
  MIKE_CPPR_108451_MAY_WITH_THIRD_COE,
} from "./boiler-17.ts";
import { classifyFromSheetsAndName } from "./client-estimate-ingest.ts";
import { COST_REPORT_STORE_PREFIX } from "./cost-report-prefix.ts";
import { hydrateCostReport } from "./cost-report.ts";
import { clampEstimateStatus } from "./estimate-status.ts";
import {
  HIS_AROMATICS_FILE_ID,
  HIS_AROMATICS_FREEZE_FILE_ID,
  HIS_AROMATICS_PACK_ID,
  HIS_BOILER17_FILE_ID,
  HIS_CAT2_PACK_ID,
  hisFileForPackId,
  persistHisWoodRiverCards,
} from "./his-wood-river.ts";
import { jobCodeFromPackId } from "./his-wood-river.ts";
import { JOB_META_PREFIX } from "./job-meta-prefix.ts";
import { localPackToJob, readStoreJson, storageKeyForPack, type StorageLike } from "./local-estimates.ts";
import { isAromaticsIdentity } from "./aromatics-freeze.ts";
import { hydrateJobMeta } from "./staffing-plan.ts";
import { BOILER17_B1_GOLDEN, MIKE_CPPR_108451_GOLDEN } from "./wake-golden.ts";
import { OFFICIAL_BOILER17_B1_REVISION_ID } from "./work-folder.ts";

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

describe("Wood River Boiler 17 Locked wake", () => {
  it("reserves a Wood River pack that is Locked on Regular and wires JN 108451", () => {
    assert.equal(BOILER17_PACK_ID, "new-b1726");
    assert.equal(jobCodeFromPackId(BOILER17_PACK_ID), BOILER17_JOB_CODE);
    assert.equal(hisFileForPackId(BOILER17_PACK_ID)?.fileId, HIS_BOILER17_FILE_ID);
    assert.equal(hisFileForPackId(BOILER17_PACK_ID)?.status, "Locked");
    assert.equal(defaultStatusForBoiler17(BOILER17_PACK_ID), "Locked");
    assert.equal(clampEstimateStatus("Awarded", true), "Locked");
    assert.equal(jobNumberForPack({ packId: BOILER17_PACK_ID, title: BOILER17_TITLE }), BOILER17_JOB_NUMBER);
    assert.equal(isBoiler17Identity({ title: "Boiler 17 2026" }), true);
    assert.equal(isAromaticsIdentity({ packId: BOILER17_PACK_ID, title: BOILER17_TITLE }), false);
    assert.equal(isAromaticsIdentity({ packId: HIS_AROMATICS_PACK_ID }), true);
    assert.notEqual(BOILER17_PACK_ID, HIS_AROMATICS_PACK_ID);
    assert.notEqual(BOILER17_PACK_ID, HIS_CAT2_PACK_ID);

    const job = localPackToJob({
      packId: BOILER17_PACK_ID,
      key: `new:${BOILER17_PACK_ID}`,
      title: BOILER17_TITLE,
      client: "Phillips 66",
      site: "Wood River — Roxana, IL",
      siteId: "site-madison",
      createdAt: 1,
      updatedAt: 1,
      status: "Locked",
    });
    assert.equal(job.code, BOILER17_JOB_CODE);
    assert.equal(job.workingFigure, "JN 108451 · Locked");
    assert.equal(boiler17WorkingFigure({ packId: BOILER17_PACK_ID, status: "Awarded" }), "JN 108451 · Locked");
    assert.equal(/Awarded/.test(job.workingFigure), false);
  });

  it("locks official B-1 hours and Mike CPPR May totals without inventing labor $", () => {
    assert.equal(BOILER17_B1_GOLDEN.officialRevisionId, OFFICIAL_BOILER17_B1_REVISION_ID);
    assert.equal(BOILER17_B1_GOLDEN.dollarsStatus, "formula-unavailable");
    assert.equal(BOILER17_B1_GOLDEN.buckets, null);
    assert.equal(BOILER17_B1_GOLDEN.boiler17Hours?.targetCraftHours, 21422);
    assert.equal(BOILER17_B1_GOLDEN.boiler17Hours?.directHours, 16860);
    assert.equal(MIKE_CPPR_108451_GOLDEN.mayLaborPdTravel, MIKE_CPPR_108451_MAY_LABOR_PD_TRAVEL);
    assert.equal(MIKE_CPPR_108451_GOLDEN.mayWithThirdAndCoe, MIKE_CPPR_108451_MAY_WITH_THIRD_COE);
    assert.equal(MIKE_CPPR_108451_GOLDEN.jobNumber, "108451");
    assert.equal(checkMikeCppr108451({ notes: BOILER17_COST_NOTE, statusDate: "2026-05-30" }).ok, true);
    assert.equal(checkMikeCppr108451({ notes: "no lock" }).ok, false);

    const classified = classifyFromSheetsAndName(
      ["Summary Page", "Staff Page"],
      "Boiler 17 2026  B-1 1019 071326RH.xlsx",
    );
    assert.equal(classified.kind, "wood-river-b1");
    assert.equal(classified.packId, BOILER17_PACK_ID);
    assert.equal(classified.staged, false);
  });

  it("does not commit Excel binaries or smash Aromatics identity", () => {
    const ignore = readFileSync(fileURLToPath(new URL("../.gitignore", import.meta.url)), "utf8");
    assert.match(ignore, /\*B-1\*\.xlsx/);
    assert.match(ignore, /\*CPPR\*/);
    const doc = readFileSync(fileURLToPath(new URL("../docs/boiler-17-work-folder.md", import.meta.url)), "utf8");
    assert.match(doc, /1sMay67BNvtkW6fFLygPtymnIkFqrvvHT/);
    assert.match(doc, /108451/);
    assert.match(doc, /Drive OAuth is live/);
    assert.match(doc, /1SDOBakDxjUCUE-PgTlBUjqnbgchNlG8Y/);
    assert.equal(/\.(xlsx|xls)\n/.test(doc), false);
    assert.equal(isAromaticsIdentity({ packId: HIS_AROMATICS_PACK_ID, title: "2027 Aromatics Turnaround" }), true);
  });

  it("persists Locked + Mike CPPR 108451 Cost notes and leaves Aromatics vault ids alone", () => {
    const store = memoryStore();
    const painted = persistHisWoodRiverCards(store);
    const boiler = painted.find((row) => row.packId === BOILER17_PACK_ID);
    assert.equal(boiler?.status, BOILER17_STATUS);
    const key = storageKeyForPack(BOILER17_PACK_ID);
    const meta = hydrateJobMeta(readStoreJson(store, `${JOB_META_PREFIX}${key}`));
    const book = hydrateCostReport(readStoreJson(store, `${COST_REPORT_STORE_PREFIX}${key}`));
    assert.equal(meta.jobNumber, BOILER17_JOB_NUMBER);
    assert.equal(checkMikeCppr108451(book).ok, true);
    assert.equal(HIS_AROMATICS_PACK_ID, "new-mtj7bvtk-akmei");
    assert.equal(HIS_AROMATICS_FILE_ID, "1KLhPczzj-BHMqT8uOI5VxUkSJUagj7rz");
    assert.equal(HIS_AROMATICS_FREEZE_FILE_ID, "1yMOHR4ES9Ba7Y0G5C2wFcpwH34i0sJ7m");
    assert.equal(painted.some((row) => row.packId === HIS_AROMATICS_PACK_ID), true);
    assert.equal(painted.some((row) => row.packId === HIS_CAT2_PACK_ID), true);
  });

  it("treats empty crew and the 8-21 demo clock as a B-1 fill", () => {
    assert.equal(boiler17NeedsB1Fill({ packId: BOILER17_PACK_ID, crew: { staff: [], direct: [] } }), true);
    assert.equal(
      boiler17NeedsB1Fill({
        packId: BOILER17_PACK_ID,
        crew: { staff: [{ id: "st-1" }] },
        schedule: { projectStart: "2026-08-21", phases: [] },
      }),
      true,
    );
    assert.equal(
      boiler17NeedsB1Fill({
        packId: HIS_AROMATICS_PACK_ID,
        title: "2027 Aromatics Turnaround",
        crew: { staff: [] },
      }),
      false,
    );
  });
});
