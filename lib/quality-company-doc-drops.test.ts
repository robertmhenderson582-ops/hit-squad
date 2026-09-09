import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  forgetLeadBriefCacheForTests,
  listStoredBriefs,
  resetLeadBriefStoreForTests,
  useLeadBriefVaultForTests,
} from "./lead-brief-store.ts";
import { memoryDrive } from "./drive-estimates.ts";
import {
  listQualityCompanyDocDrop,
  listQualityCompanyDocDrops,
  qualityCompanyDocRowId,
  saveQualityCompanyDocDrop,
} from "./quality-company-doc-drops.ts";
import { QUALITY_DROP_TYPE_ERROR } from "./quality-folder-drops.ts";
import { qualityCompanyDocsJobId } from "./quality-company-docs.ts";

const dir = mkdtempSync(join(tmpdir(), "hs-quality-docs-"));
const chance = { email: "chancec318@yahoo.com", name: "Chance Middlebrooks", role: "tester" as const };
const wendell = { email: "wlanderno@yahoo.com", name: "Wendell Landerno", role: "tester" as const };
const owner = { email: "robertmhenderson582@gmail.com", name: "Robert Henderson", role: "owner" as const };

afterEach(() => {
  forgetLeadBriefCacheForTests();
  resetLeadBriefStoreForTests();
});

function pdf(name: string, text = name) {
  return { name, type: "application/pdf", data: Buffer.from(text).toString("base64") };
}

describe("Quality company document vault drops", { concurrency: 1 }, () => {
  it("saves into a standing company file and does not mix testers or job folders", async () => {
    resetLeadBriefStoreForTests(join(dir, "iso"));
    useLeadBriefVaultForTests(memoryDrive());

    const first = await saveQualityCompanyDocDrop(chance, {
      companyId: "madison",
      folderId: "quality-control-manual",
      files: [pdf("qc-manual.pdf")],
    });
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.brief.folderId, "quality-control-manual");
    assert.equal(first.brief.companyId, "madison");
    assert.equal(first.brief.jobId, "company-docs:madison");
    assert.equal(
      first.brief.id,
      qualityCompanyDocRowId(chance.email, "madison", "quality-control-manual"),
    );

    await saveQualityCompanyDocDrop(chance, {
      companyId: "madison",
      folderId: "forms",
      files: [pdf("form.pdf")],
    });
    await saveQualityCompanyDocDrop(wendell, {
      companyId: "madison",
      folderId: "quality-control-manual",
      files: [pdf("wendell.pdf")],
    });

    const chanceManual = await listQualityCompanyDocDrop(chance, "quality-control-manual", "madison");
    const chanceForms = await listQualityCompanyDocDrop(chance, "forms", "madison");
    const wendellManual = await listQualityCompanyDocDrop(wendell, "quality-control-manual", "madison");
    assert.deepEqual(
      chanceManual.files.map((file) => file.name),
      ["qc-manual.pdf"],
    );
    assert.deepEqual(
      chanceForms.files.map((file) => file.name),
      ["form.pdf"],
    );
    assert.deepEqual(
      wendellManual.files.map((file) => file.name),
      ["wendell.pdf"],
    );

    const ownerList = await listQualityCompanyDocDrops(owner, "madison");
    assert.equal(ownerList.filesByFolder["quality-control-manual"]?.some((file) => file.name === "qc-manual.pdf"), true);
    assert.equal(ownerList.filesByFolder["quality-control-manual"]?.some((file) => file.name === "wendell.pdf"), true);

    const jobRows = await listStoredBriefs("quality", chance.email, { jobId: "job-b17", folderId: "welders" });
    assert.equal(jobRows.length, 0);
    assert.equal(qualityCompanyDocsJobId("madison").startsWith("company-docs:"), true);
  });

  it("rejects a blocked type and an unknown bucket", async () => {
    resetLeadBriefStoreForTests(join(dir, "reject"));
    useLeadBriefVaultForTests(memoryDrive());
    const blocked = await saveQualityCompanyDocDrop(chance, {
      companyId: "madison",
      folderId: "forms",
      files: [{ name: "trap.exe", type: "application/x-msdownload", data: "QQ==" }],
    });
    assert.equal(blocked.ok, false);
    if (!blocked.ok) assert.equal(blocked.error, QUALITY_DROP_TYPE_ERROR);
    const invented = await saveQualityCompanyDocDrop(chance, {
      companyId: "madison",
      folderId: "welders",
      files: [pdf("nope.pdf")],
    });
    assert.equal(invented.ok, false);
  });
});
