import { HSE_COMPANY_DOC_CATALOG } from "./hse-company-docs.ts";
import { listHseCompanyDocDrop } from "./hse-company-doc-drops.ts";
import { listHseFolderDrops, listHseVaultOwnerTree, type HseDropUser } from "./hse-folder-drops.ts";
import { isHseFolderId, hseFolderLabel, type HseFolderId } from "./hse-folders.ts";
import { listHsePackageShelf } from "./hse-package-shelf-drops.ts";
import { listStoredBriefs } from "./lead-brief-store.ts";
import {
  HSE_TEMPLATE_FILL_RIPPLE_RULE,
  hseTemplateFillHomeFolder,
  hseTemplateFillRippleHit,
  hseTemplateFillRipplePlan,
  type HseTemplateFillRippleSurface,
} from "./hse-template-form-ripple.ts";
import type { HseTemplateFillDest } from "./hse-template-form.ts";
import type { HseTemplateFillUser } from "./hse-template-form-drops.ts";

/** Owner listing — testers always get an empty HSE vault tree. */
export const HSE_TEMPLATE_FILL_AUDIT_OWNER: HseDropUser = {
  email: "robertmhenderson582@gmail.com",
  name: "Robert Henderson",
  role: "owner",
};

export type HseTemplateFillAuditCheck = {
  surface: HseTemplateFillRippleSurface | "company-rail";
  ok: boolean;
  note: string;
};

export type HseTemplateFillAuditInput = {
  dest: HseTemplateFillDest;
  companyId?: string;
  jobId?: string;
  packageId?: string;
  folderId?: string;
  fileName: string;
  actor: HseTemplateFillUser;
  owner?: HseDropUser;
};

/**
 * Nightly deep-audit probe for one filled copy.
 * Checks every ripple surface and asserts the company rail stayed blank.
 */
export async function auditHseTemplateFillRipple(input: HseTemplateFillAuditInput) {
  const home = hseTemplateFillHomeFolder(input.dest, input.folderId, input.folderId);
  const plan = hseTemplateFillRipplePlan(input.dest, home);
  const fileName = input.fileName.trim();
  const companyId = input.companyId;
  const checks: HseTemplateFillAuditCheck[] = [];
  const hits: Partial<Record<HseTemplateFillRippleSurface | "company-rail", boolean>> = {};

  if (input.dest === "job") {
    const jobId = (input.jobId || "").trim();
    const folderListed = isHseFolderId(home)
      ? await listHseFolderDrops(input.actor, jobId, home, companyId)
      : { files: [] as Array<{ name: string }> };
    const inFolder = folderListed.files.some((file) => file.name === fileName);
    hits["job-folder"] = inFolder;
    checks.push({
      surface: "job-folder",
      ok: inFolder,
      note: inFolder
        ? `Listed on ${hseFolderLabel(home as HseFolderId)}`
        : `Missing from ${home} job folder`,
    });

    const packageListed = await listHseFolderDrops(input.actor, jobId, "packages", companyId);
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
      const briefs = await listStoredBriefs("hse", input.actor.email, { jobId, folderId, companyId });
      if (briefs.some((row) => row.files.some((file) => file.name === fileName))) briefsHit = true;
    }
    hits["briefs-index"] = briefsHit;
    checks.push({
      surface: "briefs-index",
      ok: briefsHit,
      note: briefsHit ? "Indexed on job folder briefs" : "Missing from the briefs index",
    });
  } else {
    const shelf = await listHsePackageShelf(input.actor, companyId);
    const inShelf = shelf.kits.some((kit) => kit.files.some((file) => file.name === fileName));
    hits["prepackage-shelf"] = inShelf;
    checks.push({
      surface: "prepackage-shelf",
      ok: inShelf,
      note: inShelf ? "Listed on the Ready HSE package shelf" : "Missing from the Ready prepackage shelf",
    });

    const jobId = (input.jobId || "").trim();
    const briefs = jobId
      ? await listStoredBriefs("hse", input.actor.email, { jobId, folderId: "packages", companyId })
      : await listStoredBriefs("hse", input.actor.email, { companyId });
    const briefsHit = briefs.some((row) => row.files.some((file) => file.name === fileName));
    hits["briefs-index"] = briefsHit;
    checks.push({
      surface: "briefs-index",
      ok: briefsHit,
      note: briefsHit ? "Indexed on the Ready shelf brief" : "Missing from the briefs index",
    });
  }

  const owner = input.owner ?? HSE_TEMPLATE_FILL_AUDIT_OWNER;
  const tree = await listHseVaultOwnerTree(owner);
  const inTree = tree.some((row) => row.files.includes(fileName));
  hits["vault-tree"] = inTree;
  checks.push({
    surface: "vault-tree",
    ok: inTree,
    note: inTree
      ? `Owner vault listing includes ${fileName}`
      : "Missing from the owner HSE vault tree (testers never see this tree)",
  });

  let leaked = false;
  for (const doc of HSE_COMPANY_DOC_CATALOG) {
    const rail = await listHseCompanyDocDrop(input.actor, doc.id, companyId);
    if (rail.files.some((file) => file.name === fileName)) leaked = true;
  }
  hits["company-rail"] = leaked;
  checks.push({
    surface: "company-rail",
    ok: !leaked,
    note: leaked ? "Filled copy leaked onto a company-rail library" : "Company rail templates stayed blank",
  });

  const hit = hseTemplateFillRippleHit(plan, hits);
  return {
    rule: HSE_TEMPLATE_FILL_RIPPLE_RULE,
    plan,
    checks,
    hit,
    ok: hit.ok && checks.every((check) => check.ok),
  };
}

export async function auditHseTemplateFillGone(input: HseTemplateFillAuditInput) {
  const result = await auditHseTemplateFillRipple(input);
  const lingering = result.checks.filter(
    (check) => check.surface !== "company-rail" && check.ok,
  );
  const rail = result.checks.find((check) => check.surface === "company-rail");
  return {
    rule: HSE_TEMPLATE_FILL_RIPPLE_RULE,
    ok: lingering.length === 0 && Boolean(rail?.ok),
    lingering: lingering.map((check) => check.surface),
    checks: result.checks,
  };
}
