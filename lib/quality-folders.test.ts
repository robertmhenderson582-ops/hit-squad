import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  QUALITY_DROP_MAX_FILE_BYTES,
  QUALITY_DROP_SIZE_ERROR,
  QUALITY_DROP_TYPE_ERROR,
  QUALITY_FOLDER_TEMPLATES,
  QUALITY_FOLDERS,
  QUALITY_MODULE_CATALOG,
  checkQualityDrop,
  cloneQualityFolderTemplate,
  isQualityFolderId,
  mergeQualityFolderFiles,
  qualityFolderBriefId,
  qualityFolderDropsFor,
  qualityFolderLabel,
  qualityFoldersFor,
  qualityFoldersListedFor,
  readQualityFolderFiles,
  readQualityFolderPick,
  resolveQualityFolder,
  showsQualityFolderDesk,
  writeQualityFolderFiles,
  writeQualityFolderPick,
} from "./quality-folders.ts";

function source(rel: string) {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

function memoryStore() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
  };
}

describe("Quality folder catalog", () => {
  it("locks Chance’s twelve folder labels and 1:1 synonyms", () => {
    assert.deepEqual(
      QUALITY_FOLDERS.map((folder) => folder.label),
      [
        "Packages",
        "Package Tracker",
        "Welds / NDE",
        "Welders",
        "NDE Request",
        "WPS",
        "Gauges",
        "Weld Log",
        "Flange Log",
        "Travelers",
        "Job Completion",
        "Rolling Chart",
      ],
    );
    assert.equal(QUALITY_FOLDERS.length, 12);
    assert.equal(resolveQualityFolder("Welds/NDE"), "welds-nde");
    assert.equal(resolveQualityFolder("Welds / NDE"), "welds-nde");
    assert.equal(resolveQualityFolder("NDE req spreadsheet"), "nde-request");
    assert.equal(resolveQualityFolder("Calibration / gauges"), "gauges");
    assert.equal(resolveQualityFolder("2.7.19 Madison Flange Log Rev.1"), "flange-log");
    assert.equal(resolveQualityFolder("2.7.34 Job Completion Sign-off Form Rev 2"), "job-completion");
    assert.equal(resolveQualityFolder("Day-1 package"), "packages");
    assert.equal(resolveQualityFolder("Rolling chart"), "rolling-chart");
    assert.equal(resolveQualityFolder("Connections / flanges"), "flange-log");
    assert.equal(resolveQualityFolder("Invented lane"), "");
    assert.equal(isQualityFolderId("wps"), true);
    assert.equal(isQualityFolderId("ncrs"), false);
    assert.equal(qualityFolderLabel("weld-log"), "Weld Log");
    assert.equal(
      qualityFolderBriefId("ChanceC318@yahoo.com", "job-new-b1726", "welders"),
      "brief-quality-chancec318@yahoo.com-job:job-new-b1726-folder:welders",
    );
    assert.deepEqual(
      qualityFoldersFor("madison").map((folder) => folder.label),
      QUALITY_FOLDERS.map((folder) => folder.label),
    );
    assert.deepEqual(qualityFoldersFor("madison").map((folder) => folder.id), QUALITY_MODULE_CATALOG.map((folder) => folder.id));
    assert.deepEqual(qualityFoldersFor("hitsquad"), []);
    assert.deepEqual(qualityFoldersFor("acme"), []);
    assert.equal(showsQualityFolderDesk("madison"), true);
    assert.equal(showsQualityFolderDesk("hitsquad"), false);
    assert.equal(showsQualityFolderDesk("acme"), false);
    assert.equal(isQualityFolderId("welders", "madison"), true);
    assert.equal(isQualityFolderId("welders", "hitsquad"), false);
    assert.deepEqual(
      qualityFoldersListedFor("").map((folder) => folder.label),
      QUALITY_FOLDERS.map((folder) => folder.label),
    );
    assert.deepEqual(qualityFoldersListedFor("hitsquad"), []);
    assert.deepEqual(
      QUALITY_FOLDER_TEMPLATES.filter((row) => row.live).map((row) => row.companyId),
      ["madison"],
    );
    const cloned = cloneQualityFolderTemplate("acme");
    assert.equal(cloned.companyId, "acme");
    assert.equal(cloned.live, false);
    assert.deepEqual(
      cloned.folders.map((folder) => folder.id),
      QUALITY_MODULE_CATALOG.map((folder) => folder.id),
    );
    assert.deepEqual(
      cloned.folders.map((folder) => folder.label),
      QUALITY_FOLDERS.map((folder) => folder.label),
    );
    assert.equal(showsQualityFolderDesk("acme"), false);
  });

  it("keeps a per-job folder pick and does not mix local files across folders", () => {
    const store = memoryStore();
    writeQualityFolderPick("job-a", "welders", store);
    assert.equal(readQualityFolderPick("job-a", store), "welders");
    assert.equal(readQualityFolderPick("job-b", store), "packages");
    writeQualityFolderFiles(
      "job-a",
      "welders",
      [{ name: "stamp.pdf", type: "application/pdf", data: "JVBERi0x" }],
      store,
    );
    writeQualityFolderFiles(
      "job-a",
      "wps",
      [{ name: "wps.xlsx", type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", data: "UEs=" }],
      store,
    );
    assert.deepEqual(
      readQualityFolderFiles("job-a", "welders", store).map((file) => file.name),
      ["stamp.pdf"],
    );
    assert.deepEqual(
      readQualityFolderFiles("job-a", "wps", store).map((file) => file.name),
      ["wps.xlsx"],
    );
    assert.deepEqual(readQualityFolderFiles("job-b", "welders", store), []);
  });

  it("accepts Quality paperwork and rejects blocked or oversize drops without wiping keepers", () => {
    const pdf = { name: "itp.pdf", type: "application/pdf", data: Buffer.from("pdf").toString("base64") };
    const exe = { name: "trap.exe", type: "application/x-msdownload", data: "QQ==" };
    const ok = checkQualityDrop([pdf]);
    assert.equal(ok.ok, true);
    assert.equal(ok.accepted.length, 1);
    const blocked = checkQualityDrop([exe]);
    assert.equal(blocked.ok, false);
    assert.equal(blocked.error, QUALITY_DROP_TYPE_ERROR);
    const mixed = checkQualityDrop([pdf, exe]);
    assert.equal(mixed.accepted.length, 1);
    assert.equal(mixed.rejected[0]?.name, "trap.exe");
    const huge = {
      name: "huge.pdf",
      type: "application/pdf",
      data: "A".repeat(Math.ceil((QUALITY_DROP_MAX_FILE_BYTES + 1) / 3) * 4),
    };
    assert.equal(checkQualityDrop([huge]).error, QUALITY_DROP_SIZE_ERROR);
    const merged = mergeQualityFolderFiles(
      [{ name: "keep.pdf", type: "application/pdf", data: "QQ==" }],
      [pdf],
    );
    assert.deepEqual(
      merged.map((file) => file.name),
      ["keep.pdf", "itp.pdf"],
    );
  });

  it("lists only the asked job and folder for that tester", () => {
    const chance = "chancec318@yahoo.com";
    const listed = qualityFolderDropsFor(
      [
        {
          kind: "quality",
          who: chance,
          jobId: "job-a",
          folderId: "welders",
          savedAt: "now",
          files: [{ name: "stamp.pdf", type: "application/pdf" }],
        },
        {
          kind: "quality",
          who: "wlanderno@yahoo.com",
          jobId: "job-a",
          folderId: "welders",
          savedAt: "now",
          files: [{ name: "wendell.pdf", type: "application/pdf" }],
        },
        {
          kind: "quality",
          who: chance,
          jobId: "job-b",
          folderId: "welders",
          savedAt: "now",
          files: [{ name: "other-job.pdf", type: "application/pdf" }],
        },
        {
          kind: "quality",
          who: chance,
          jobId: "job-a",
          folderId: "wps",
          savedAt: "now",
          files: [{ name: "wps.pdf", type: "application/pdf" }],
        },
      ],
      "job-a",
      "welders",
      chance,
    );
    assert.deepEqual(
      listed.flatMap((row) => row.files.map((file) => file.name)),
      ["stamp.pdf"],
    );
  });

  it("fails if Quality no longer opens on the folder dropdown first", () => {
    const quality = source("../components/QualityDesk.tsx");
    const drop = source("../components/QualityFolderDrop.tsx");
    const folders = source("./quality-folders.ts");
    assert.match(quality, /QualityFolderDrop/);
    assert.match(quality, /JobScopePicks/);
    assert.match(quality, /showsQualityFolderDesk/);
    assert.match(quality, /cascadeCompanyId/);
    assert.doesNotMatch(quality, /LeadStudio/);
    const dropIndex = quality.indexOf("<QualityFolderDrop");
    const tabsIndex = quality.indexOf('role="tablist"');
    assert.equal(dropIndex > 0 && tabsIndex > dropIndex, true);
    assert.match(drop, /quality-folder-pick/);
    assert.match(drop, /onDrop/);
    assert.match(drop, /type="file"/);
    assert.match(drop, /selectRef.current\?\.focus/);
    assert.match(drop, /qualityFoldersFor/);
    assert.match(drop, /companyId/);
    for (const label of QUALITY_FOLDERS.map((folder) => folder.label)) {
      assert.match(folders, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  });
});
