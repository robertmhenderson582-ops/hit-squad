import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { memoryDrive } from "./drive-estimates.ts";
import {
  forgetLeadBriefCacheForTests,
  resetLeadBriefStoreForTests,
  useLeadBriefVaultForTests,
} from "./lead-brief-store.ts";
import {
  attachQualityPackageShelfKit,
  saveQualityPackageShelfKit,
} from "./quality-package-shelf-drops.ts";
import {
  QUALITY_PACKAGE_SHELF_ATTACH_ERROR,
  QUALITY_PACKAGE_SHELF_BUILD_ERROR,
  isQualityReadyShelfJobId,
  qualityPackageShelfAcl,
  qualityReadyShelfJobId,
} from "./quality-package-shelf.ts";
import type { OrgPosition, OrgPositionHold } from "./org-positions.ts";

const dir = mkdtempSync(join(tmpdir(), "hs-quality-shelf-"));
const chance = { email: "chancec318@yahoo.com", name: "Chance", role: "tester" as const };
const nathan = { email: "nathanboyte@gmail.com", name: "Nathan Boyte", role: "tester" as const };
const joseph = { email: "josephmhenderson2002@gmail.com", name: "Joseph Henderson", role: "tester" as const };
const wendell = { email: "wlanderno@yahoo.com", name: "Wendell", role: "tester" as const };
const owner = { email: "robertmhenderson582@gmail.com", name: "Robert Henderson", role: "owner" as const };
const president = { email: "johnbeech.madison@gmail.com", name: "John", role: "president" as const };

const catalog: OrgPosition[] = [
  { id: "corporate-qc-manager", kind: "custom", label: "Corporate QC Manager", desk: "corporate" },
  { id: "site-qc-manager", kind: "custom", label: "Site QC Manager", desk: "field" },
  { id: "project-manager", kind: "project-manager", label: "Project Manager", desk: "field" },
];

function hold(positionId: string, email: string): OrgPositionHold {
  return { id: `${positionId}:${email}`, positionId, email };
}

function pdf(name: string) {
  return { name, type: "application/pdf", data: Buffer.from(name).toString("base64") };
}

afterEach(() => {
  forgetLeadBriefCacheForTests();
  resetLeadBriefStoreForTests();
});

describe("Quality package shelf ACL", () => {
  it("lets Corporate QC, Site QC, and any PM/estimator attach — not Nathan-only", () => {
    assert.deepEqual(qualityPackageShelfAcl(chance), {
      canBuild: true,
      canAttach: true,
      seat: "site-qc",
    });
    assert.deepEqual(qualityPackageShelfAcl(nathan), {
      canBuild: false,
      canAttach: true,
      seat: "pm",
    });
    assert.deepEqual(qualityPackageShelfAcl(joseph), {
      canBuild: false,
      canAttach: true,
      seat: "pm",
    });
    const corporate = qualityPackageShelfAcl(president, {
      catalog,
      holds: [hold("corporate-qc-manager", president.email)],
    });
    assert.equal(corporate.canBuild, true);
    assert.equal(corporate.canAttach, true);
    assert.equal(corporate.seat, "corporate-qc");
    const site = qualityPackageShelfAcl(wendell, {
      catalog,
      holds: [hold("site-qc-manager", wendell.email)],
    });
    assert.equal(site.canBuild, true);
    assert.equal(site.canAttach, true);
    assert.equal(site.seat, "site-qc");
    assert.equal(qualityPackageShelfAcl(wendell).canAttach, false);
    assert.equal(qualityPackageShelfAcl(owner).canBuild, true);
    assert.equal(isQualityReadyShelfJobId(qualityReadyShelfJobId("day-1-kit")), true);
    assert.equal(isQualityReadyShelfJobId("job-b17"), false);
  });

  it("persists a Ready kit in the Quality vault and attaches it onto a job", async () => {
    const drive = memoryDrive();
    resetLeadBriefStoreForTests(join(dir, "shelf"));
    useLeadBriefVaultForTests(drive);
    const saved = await saveQualityPackageShelfKit(chance, {
      name: "Day-1 kit",
      files: [pdf("wps.pdf")],
      companyId: "madison",
      companyLabel: "Madison",
    });
    assert.equal(saved.ok, true);
    if (!saved.ok) return;
    assert.equal(saved.store, "drive");
    assert.equal(saved.stored, true);
    assert.equal(isQualityReadyShelfJobId(saved.kit.jobId), true);
    const attached = await attachQualityPackageShelfKit(nathan, {
      packageId: saved.kit.id,
      jobId: "job-b17",
      companyId: "madison",
      companyLabel: "Madison",
      siteLabel: "Wood River",
      jobLabel: "Boiler 17",
    });
    assert.equal(attached.ok, true);
    if (!attached.ok) return;
    assert.deepEqual(attached.attached, ["wps.pdf"]);
    const denied = await saveQualityPackageShelfKit(nathan, { name: "Nope", files: [pdf("x.pdf")] });
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.error, QUALITY_PACKAGE_SHELF_BUILD_ERROR);
    const viewer = await attachQualityPackageShelfKit(wendell, {
      packageId: saved.kit.id,
      jobId: "job-b17",
      companyId: "madison",
    });
    assert.equal(viewer.ok, false);
    if (!viewer.ok) assert.equal(viewer.error, QUALITY_PACKAGE_SHELF_ATTACH_ERROR);
  });
});
