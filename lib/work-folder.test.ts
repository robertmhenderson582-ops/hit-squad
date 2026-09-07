import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  driveFolderUrl,
  driveViewUrl,
  isOfficialRevisionId,
  isRodeoWorkbookFamilyId,
  OFFICIAL_MONROE_541V_REVISION_ID,
  OFFICIAL_U110_REVISION_ID,
  OFFICIAL_U250_REVISION_ID,
  officialRevisionIds,
  RODEO_WORKBOOK_BLANK_ID,
  RODEO_WORKBOOK_U110_ID,
  RODEO_WORKBOOK_U250_ID,
  WEST_COMP_AMEND9_ID,
  WESTERN_STATES_AGREEMENT_ID,
  WORK_FOLDER_ID,
  WORK_FOLDER_MONROE_ID,
  WORK_FOLDER_RODEO_ID,
  workFolderRoots,
} from "./work-folder.ts";

describe("Work Folder ids", () => {
  it("keeps folder and official revision ids as Drive pointers only", () => {
    assert.equal(WORK_FOLDER_ID, "1_e5q1-ZpFTPE5LEWM9kv27a10gC16WbE");
    assert.equal(WORK_FOLDER_RODEO_ID, "1uHhYyFdeu2N-QNYPKxEP9LzBQ1_JLjnk");
    assert.equal(WORK_FOLDER_MONROE_ID, "1ABdF_NkurspzC7YTF2us-3syOt0MBMyZ");
    assert.deepEqual(officialRevisionIds(), [
      OFFICIAL_U110_REVISION_ID,
      OFFICIAL_U250_REVISION_ID,
      OFFICIAL_MONROE_541V_REVISION_ID,
    ]);
    assert.equal(isOfficialRevisionId(OFFICIAL_U110_REVISION_ID), true);
    assert.equal(isRodeoWorkbookFamilyId(RODEO_WORKBOOK_BLANK_ID), true);
    assert.equal(isRodeoWorkbookFamilyId(RODEO_WORKBOOK_U110_ID), true);
    assert.equal(isRodeoWorkbookFamilyId(RODEO_WORKBOOK_U250_ID), true);
    assert.match(driveViewUrl(WESTERN_STATES_AGREEMENT_ID), /1wdYyt-qOEruPtosgiCSbkYO2yaTZnPfi/);
    assert.match(driveFolderUrl(WORK_FOLDER_ID), /1_e5q1-ZpFTPE5LEWM9kv27a10gC16WbE/);
    assert.equal(WEST_COMP_AMEND9_ID, "1zWoijAW5hGx7-Ew2U77_7uYxjEHS3RqT");
    assert.equal(workFolderRoots().some((row) => row.id === WORK_FOLDER_ID), true);
  });

  it("does not check client books into git", () => {
    const ignore = readFileSync(fileURLToPath(new URL("../.gitignore", import.meta.url)), "utf8");
    assert.match(ignore, /\*P66\*\.xlsx/);
    assert.match(ignore, /\*Monroe\*\.xlsx/);
    assert.match(ignore, /\*RODEO\*ESTIMATE\*\.xlsx/);
    const doc = readFileSync(fileURLToPath(new URL("../docs/rodeo-monroe-work-folder.md", import.meta.url)), "utf8");
    assert.match(doc, /Do not git client xlsx/);
    assert.match(doc, /MULTIPLE templates/);
    assert.equal(/\.(xlsx|pdf)\n/.test(doc), false);
  });
});
