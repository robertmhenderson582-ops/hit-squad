import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { qualityFolderId } from "./drive-data.ts";
import { ESTIMATES_ROOM_ID, memoryDrive } from "./drive-estimates.ts";
import { forgetLeadBriefCacheForTests, resetLeadBriefStoreForTests, saveStoredBrief, useLeadBriefVaultForTests } from "./lead-brief-store.ts";
import { listHseFolderDrops, listHseVaultOwnerTree, saveHseFolderDrop } from "./hse-folder-drops.ts";
import { ensureHseVaultPath, readHseVaultFile } from "./hse-vault.ts";
import { listQualityFolderDrops, listQualityVaultOwnerTree, saveQualityFolderDrop } from "./quality-folder-drops.ts";
import { listQualityPackageShelf } from "./quality-package-shelf-drops.ts";
import { ensureQualityVaultPath, readQualityVaultFile } from "./quality-vault.ts";
import { mergeVaultedQualityFiles } from "./quality-vault-shared.ts";
import {
  doorsFromQualitySeat,
  filterVaultListedFiles,
  filterVaultTreeForViewer,
  isVaultInfrastructureFile,
  normalizeSeatDoors,
  shareVaultFoldersForSeat,
  vaultFileVisibleToViewer,
  vaultListViewerForSeat,
  vaultTargetsForDoors,
} from "./vault-acl.ts";
import type { OrgPosition, OrgPositionHold } from "./org-positions.ts";

const catalog: OrgPosition[] = [
  { id: "corporate-qc-manager", kind: "custom", label: "Corporate QC Manager", desk: "corporate" },
];

function hold(positionId: string, email: string): OrgPositionHold {
  return { id: `${positionId}:${email}`, positionId, email };
}

describe("vault ACL share hooks", () => {
  it("maps Quality doors to the Quality room and shares without mailing madisonltd.com", async () => {
    assert.deepEqual(normalizeSeatDoors(["quality", "bogus", "quality"]), ["quality"]);
    assert.deepEqual(
      vaultTargetsForDoors(["quality", "estimates"]).map((row) => row.id),
      [qualityFolderId(), ESTIMATES_ROOM_ID],
    );
    const president = "johnbeech.madison@gmail.com";
    assert.deepEqual(
      doorsFromQualitySeat(president, [hold("corporate-qc-manager", president)], catalog, {
        email: president,
        role: "president",
      }),
      ["quality"],
    );
    const drive = memoryDrive();
    const shared = await shareVaultFoldersForSeat(drive, "qc@example.com", ["quality"]);
    assert.equal(shared.shared[0]?.ok, true);
    assert.equal(drive.shares.get(qualityFolderId())?.[0]?.email, "qc@example.com");
    const blocked = await shareVaultFoldersForSeat(drive, "beechj@madisonltd.com", ["quality"]);
    assert.equal(blocked.shared.length, 0);
    assert.match(blocked.error || "", /cannot receive/);
  });
});

const dir = mkdtempSync(join(tmpdir(), "hs-vault-list-acl-"));
const chance = { email: "chancec318@yahoo.com", name: "Chance Middlebrooks", role: "tester" as const };
const nathan = { email: "nathanboyte@gmail.com", name: "Nathan Boyte", role: "tester" as const };
const novus = { email: "robertmhenderson582+novus@gmail.com", name: "Novus", role: "operator" as const };
const owner = { email: "robertmhenderson582@gmail.com", name: "Robert Henderson", role: "owner" as const };

afterEach(() => {
  forgetLeadBriefCacheForTests();
  resetLeadBriefStoreForTests();
});

function pdf(name: string, text = name) {
  return { name, type: "application/pdf", data: Buffer.from(text).toString("base64") };
}

function xlsx(name: string) {
  return {
    name,
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    data: Buffer.from("PK").toString("base64"),
  };
}

function docx(name: string) {
  return {
    name,
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    data: Buffer.from("PK").toString("base64"),
  };
}

function namesOf(files: Array<{ name?: string }>) {
  return files.map((file) => file.name);
}

describe("vault listing ACL — hide site plumbing from users", () => {
  it("fail-closed: JSON/keys/_meta/unknown are infra; PDF/xlsx/doc/txt still show", () => {
    for (const name of [
      "tickets.json",
      "seats.json",
      "inbox.json",
      "quality-briefs.json",
      "hse-briefs.json",
      "quality-library.lock.json",
      "hse-library.lock.json",
      "acl.json",
      "vault.key",
      "_meta",
      "_meta.dump",
      ".env",
      "mystery.bin",
      "no-extension",
    ]) {
      assert.equal(isVaultInfrastructureFile(name), true, name);
      assert.equal(vaultFileVisibleToViewer(name, chance), false, name);
      assert.equal(vaultFileVisibleToViewer(name, nathan), false, name);
      assert.equal(vaultFileVisibleToViewer(name, novus), false, name);
      assert.equal(vaultFileVisibleToViewer(name, owner), true, name);
    }
    for (const name of [
      "stamp.pdf",
      "hours.xlsx",
      "brief.docx",
      "Madison JSA — Boiler 17 — 2026-09-12 — Wendell.txt",
      "codes.zip",
    ]) {
      assert.equal(isVaultInfrastructureFile(name), false, name);
      assert.equal(vaultFileVisibleToViewer(name, chance), true, name);
      assert.equal(vaultFileVisibleToViewer(name, owner), true, name);
    }
    assert.equal(vaultListViewerForSeat(owner, "chance")?.role, "tester");
    assert.equal(vaultFileVisibleToViewer("tickets.json", vaultListViewerForSeat(owner, "chance")), false);
    assert.deepEqual(
      namesOf(filterVaultListedFiles([
        { name: "stamp.pdf" },
        { name: "tickets.json" },
        { name: "hours.xlsx" },
      ], chance)),
      ["stamp.pdf", "hours.xlsx"],
    );
    assert.deepEqual(
      filterVaultTreeForViewer(
        [{ path: ["Madison"], files: ["stamp.pdf", "seats.json", "quality-briefs.json"] }],
        nathan,
      ).map((row) => row.files),
      [["stamp.pdf"]],
    );
    assert.deepEqual(
      namesOf(mergeVaultedQualityFiles(
        [{ name: "stamp.pdf", type: "application/pdf" }, { name: "tickets.json", type: "application/json" }],
        [],
        chance,
      )),
      ["stamp.pdf"],
    );
    assert.deepEqual(
      namesOf(mergeVaultedQualityFiles(
        [{ name: "stamp.pdf", type: "application/pdf" }, { name: "tickets.json", type: "application/json" }],
        [],
        owner,
      )),
      ["stamp.pdf", "tickets.json"],
    );
  });

  it("Quality/HSE lists hide planted keys from Nathan/Chance; Owner still sees them; Drive keeps the files", async () => {
    const drive = memoryDrive();
    resetLeadBriefStoreForTests(join(dir, "infra"));
    useLeadBriefVaultForTests(drive);
    const place = {
      companyId: "madison",
      siteLabel: "Wood River",
      jobId: "job-b17",
      jobLabel: "Boiler 17",
      folderId: "welders",
    };
    const saved = await saveQualityFolderDrop(chance, {
      ...place,
      files: [pdf("stamp.pdf"), xlsx("hours.xlsx"), docx("wps.docx")],
    });
    assert.equal(saved.ok, true);
    const folderId = await ensureQualityVaultPath(drive, place);
    await drive.createJson(folderId, "tickets.json", "{}\n", { kind: "tickets", who: chance.email });
    await drive.createJson(folderId, "seats.json", "{}\n", { kind: "seats", who: chance.email });
    await drive.createJson(folderId, "quality-briefs.json", "{}\n", { kind: "quality-briefs" });
    await drive.createJson(folderId, "quality-library.lock.json", "{}\n", { kind: "quality-library-lock" });
    await drive.uploadBytes!(folderId, "mystery.bin", new Uint8Array([1]), "application/octet-stream", {
      who: chance.email,
    });
    const kids = await drive.listChildren!(folderId);
    assert.equal(kids.some((row) => row.name === "tickets.json"), true);
    assert.equal(kids.some((row) => row.name === "stamp.pdf"), true);

    const chanceList = await listQualityFolderDrops(chance, "job-b17", "welders", "madison", {
      siteLabel: "Wood River",
      jobLabel: "Boiler 17",
    });
    assert.deepEqual(namesOf(chanceList.files).sort(), ["hours.xlsx", "stamp.pdf", "wps.docx"]);
    assert.equal(chanceList.files.some((file) => /\.json$/i.test(file.name)), false);
    const nathanList = await listQualityFolderDrops(nathan, "job-b17", "welders", "madison", {
      siteLabel: "Wood River",
      jobLabel: "Boiler 17",
    });
    assert.equal(nathanList.files.some((file) => file.name === "tickets.json" || file.name === "seats.json"), false);
    const ownerList = await listQualityFolderDrops(owner, "job-b17", "welders", "madison", {
      siteLabel: "Wood River",
      jobLabel: "Boiler 17",
    });
    assert.equal(ownerList.files.some((file) => file.name === "stamp.pdf"), true);
    assert.equal(ownerList.files.some((file) => file.name === "tickets.json"), true);
    assert.equal(ownerList.files.some((file) => file.name === "seats.json"), true);
    assert.equal(ownerList.files.some((file) => file.name === "quality-briefs.json"), true);

    const chanceTree = await listQualityVaultOwnerTree(chance);
    assert.deepEqual(chanceTree, []);
    const novusTree = await listQualityVaultOwnerTree(novus);
    assert.equal(novusTree.some((row) => row.files.includes("stamp.pdf")), true);
    assert.equal(novusTree.some((row) => row.files.includes("tickets.json")), false);
    const ownerTree = await listQualityVaultOwnerTree(owner);
    assert.equal(ownerTree.some((row) => row.files.includes("stamp.pdf") && row.files.includes("tickets.json")), true);

    const hidden = await readQualityVaultFile(drive, { ...place, who: chance.email }, "tickets.json", chance);
    assert.equal(hidden.file, null);
    const opened = await readQualityVaultFile(drive, place, "tickets.json", owner);
    assert.equal(opened.file?.name, "tickets.json");
    assert.equal((await drive.listChildren!(folderId)).some((row) => row.name === "tickets.json"), true);

    const hsePlace = {
      companyId: "madison",
      siteLabel: "Wood River",
      jobId: "job-b17",
      jobLabel: "Boiler 17",
      folderId: "jsa",
    };
    const hseSaved = await saveHseFolderDrop(chance, {
      ...hsePlace,
      files: [pdf("jsa.pdf"), { name: "Madison JSA — Boiler 17 — 2026-09-12 — Chance.txt", type: "text/plain", data: Buffer.from("jsa").toString("base64") }],
    });
    assert.equal(hseSaved.ok, true);
    const hseFolder = await ensureHseVaultPath(drive, hsePlace);
    await drive.createJson(hseFolder, "hse-briefs.json", "{}\n", { kind: "hse-briefs", who: chance.email });
    await drive.createJson(hseFolder, "inbox.json", "{}\n", { kind: "inbox", who: chance.email });
    const chanceHse = await listHseFolderDrops(chance, "job-b17", "jsa", "madison", {
      siteLabel: "Wood River",
      jobLabel: "Boiler 17",
    });
    assert.equal(chanceHse.files.some((file) => file.name === "jsa.pdf"), true);
    assert.equal(chanceHse.files.some((file) => file.name.endsWith(".txt")), true);
    assert.equal(chanceHse.files.some((file) => file.name === "hse-briefs.json" || file.name === "inbox.json"), false);
    const ownerHse = await listHseFolderDrops(owner, "job-b17", "jsa", "madison", {
      siteLabel: "Wood River",
      jobLabel: "Boiler 17",
    });
    assert.equal(ownerHse.files.some((file) => file.name === "inbox.json"), true);
    const ownerHseTree = await listHseVaultOwnerTree(owner);
    assert.equal(ownerHseTree.some((row) => row.files.includes("inbox.json")), true);
    const novusHseTree = await listHseVaultOwnerTree(novus);
    assert.equal(novusHseTree.some((row) => row.files.includes("inbox.json")), false);
    assert.equal((await readHseVaultFile(drive, { ...hsePlace, who: chance.email }, "inbox.json", chance)).file, null);

    await saveStoredBrief({
      kind: "quality",
      who: chance.email,
      whoName: chance.name,
      describe: "Day-1 kit",
      files: [pdf("pack.pdf"), { name: "tickets.json", type: "application/json", data: "e30=" }],
      jobId: "quality-ready-shelf:day-1-kit",
      folderId: "packages",
      companyId: "madison",
    });
    const chanceShelf = await listQualityPackageShelf(chance, "madison");
    assert.equal(chanceShelf.kits.some((kit) => kit.files.some((file) => file.name === "pack.pdf")), true);
    assert.equal(chanceShelf.kits.some((kit) => kit.files.some((file) => file.name === "tickets.json")), false);
    const ownerShelf = await listQualityPackageShelf(owner, "madison");
    assert.equal(ownerShelf.kits.some((kit) => kit.files.some((file) => file.name === "tickets.json")), true);
  });
});

