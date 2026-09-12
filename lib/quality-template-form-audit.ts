import { QUALITY_COMPANY_DOC_CATALOG } from "./quality-company-docs.ts";
import { listQualityCompanyDocDrop } from "./quality-company-doc-drops.ts";
import { listQualityFolderDrops, listQualityVaultOwnerTree, type QualityDropUser } from "./quality-folder-drops.ts";
import { isQualityFolderId, qualityFolderLabel, type QualityFolderId } from "./quality-folders.ts";
import { listQualityPackageShelf } from "./quality-package-shelf-drops.ts";
import { listStoredBriefs } from "./lead-brief-store.ts";
import {
  QUALITY_TEMPLATE_FILL_RIPPLE_RULE,
  qualityTemplateFillHomeFolder,
  qualityTemplateFillRippleHit,
  qualityTemplateFillRipplePlan,
  type QualityTemplateFillRippleSurface,
} from "./quality-template-form-ripple.ts";
import type { QualityTemplateFillDest } from "./quality-template-form.ts";
import type { QualityTemplateFillUser } from "./quality-template-form-drops.ts";

/** Owner listing — testers always get an empty Quality vault tree. */
export const QUALITY_TEMPLATE_FILL_AUDIT_OWNER: QualityDropUser = {
  email: "robertmhenderson582@gmail.com",
  name: "Robert Henderson",
  role: "owner",
};

export type QualityTemplateFillAuditCheck = {
  surface: QualityTemplateFillRippleSurface | "company-rail";
  ok: boolean;
  note: string;
};

export type QualityTemplateFillAuditInput = {
  dest: QualityTemplateFillDest;
  companyId?: string;
  jobId?: string;
  packageId?: string;
  folderId?: string;
  fileName: string;
  actor: QualityTemplateFillUser;
  owner?: QualityDropUser;
};

/**
 * Nightly deep-audit probe for one filled copy.
 * Checks every ripple surface and asserts the company rail stayed blank.
 */
export async function auditQualityTemplateFillRipple(input: QualityTemplateFillAuditInput) {
  const home = qualityTemplateFillHomeFolder(input.dest, input.folderId, input.folderId);
  const plan = qualityTemplateFillRipplePlan(input.dest, home);
  const fileName = input.fileName.trim();
  const companyId = input.companyId;
  const checks: QualityTemplateFillAuditCheck[] = [];
  const hits: Partial<Record<QualityTemplateFillRippleSurface | "company-rail", boolean>> = {};

  if (input.dest === "job") {
    const jobId = (input.jobId || "").trim();
    const folderListed = isQualityFolderId(home)
      ? await listQualityFolderDrops(input.actor, jobId, home, companyId)
      : { files: [] as Array<{ name: string }> };
    const inFolder = folderListed.files.some((file) => file.name === fileName);
    hits["job-folder"] = inFolder;
    checks.push({
      surface: "job-folder",
      ok: inFolder,
      note: inFolder
        ? `Listed on ${qualityFolderLabel(home as QualityFolderId)}`
        : `Missing from ${home} job folder`,
    });

    const packageListed = await listQualityFolderDrops(input.actor, jobId, "packages", companyId);
    const inPackage = packageListed.files.some((file) => file.name === fileName);
    hits["job-package"] = inPackage;
    checks.push({
      surface: "job-package",
      ok: inPackage,
      note: inPackage ? "Listed on the job Packages radio" : "Missing from the job Packages radio",
    });

    const folders = plan.folders.length ? plan.folders : [home];
    let briefsHit = false;
    for (const folderId of folders) {
      const briefs = await listStoredBriefs("quality", input.actor.email, { jobId, folderId, companyId });
      if (briefs.some((row) => row.files.some((file) => file.name === fileName))) briefsHit = true;
    }
    hits["briefs-index"] = briefsHit;
    checks.push({
      surface: "briefs-index",
      ok: briefsHit,
      note: briefsHit ? "Indexed on job folder briefs" : "Missing from the briefs index",
    });
  } else {
    const shelf = await listQualityPackageShelf(input.actor, companyId);
    const inShelf = shelf.kits.some((kit) => kit.files.some((file) => file.name === fileName));
    hits["prepackage-shelf"] = inShelf;
    checks.push({
      surface: "prepackage-shelf",
      ok: inShelf,
      note: inShelf ? "Listed on the Ready Quality package shelf" : "Missing from the Ready prepackage shelf",
    });

    const jobId = (input.jobId || "").trim();
    const briefs = jobId
      ? await listStoredBriefs("quality", input.actor.email, { jobId, folderId: "packages", companyId })
      : await listStoredBriefs("quality", input.actor.email, { companyId });
    const briefsHit = briefs.some((row) => row.files.some((file) => file.name === fileName));
    hits["briefs-index"] = briefsHit;
    checks.push({
      surface: "briefs-index",
      ok: briefsHit,
      note: briefsHit ? "Indexed on the Ready shelf brief" : "Missing from the briefs index",
    });
  }

  const owner = input.owner ?? QUALITY_TEMPLATE_FILL_AUDIT_OWNER;
  const tree = await listQualityVaultOwnerTree(owner);
  const inTree = tree.some((row) => row.files.includes(fileName));
  hits["vault-tree"] = inTree;
  checks.push({
    surface: "vault-tree",
    ok: inTree,
    note: inTree
      ? `Owner vault listing includes ${fileName}`
      : "Missing from the owner Quality vault tree (testers never see this tree)",
  });

  let leaked = false;
  for (const doc of QUALITY_COMPANY_DOC_CATALOG) {
    const rail = await listQualityCompanyDocDrop(input.actor, doc.id, companyId);
    if (rail.files.some((file) => file.name === fileName)) leaked = true;
  }
  hits["company-rail"] = leaked;
  checks.push({
    surface: "company-rail",
    ok: !leaked,
    note: leaked ? "Filled copy leaked onto a company-rail library" : "Company rail templates stayed blank",
  });

  const hit = qualityTemplateFillRippleHit(plan, hits);
  return {
    rule: QUALITY_TEMPLATE_FILL_RIPPLE_RULE,
    plan,
    checks,
    hit,
    ok: hit.ok && checks.every((check) => check.ok),
  };
}

export async function auditQualityTemplateFillGone(input: QualityTemplateFillAuditInput) {
  const result = await auditQualityTemplateFillRipple(input);
  const lingering = result.checks.filter(
    (check) => check.surface !== "company-rail" && check.ok,
  );
  const rail = result.checks.find((check) => check.surface === "company-rail");
  return {
    rule: QUALITY_TEMPLATE_FILL_RIPPLE_RULE,
    ok: lingering.length === 0 && Boolean(rail?.ok),
    lingering: lingering.map((check) => check.surface),
    checks: result.checks,
  };
}
