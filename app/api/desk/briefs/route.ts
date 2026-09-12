import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { DRIVE_WRITE_ERROR } from "@/lib/drive-data";
import { hasBuildDesk } from "@/lib/desk-role";
import { scopedDeskUser } from "@/lib/desk-scope-server";
import { cookieValue } from "@/lib/http";
import { HSE_VAULT_WRITE_ERROR } from "@/lib/lead-briefs";
import {
  isLeadBriefKind,
  leadBriefStoreKind,
  listStoredBriefs,
  publicBrief,
  saveStoredBrief,
} from "@/lib/lead-brief-store";
import {
  lockQualityCompanyDoc,
  listQualityCompanyDocDrop,
  listQualityCompanyDocDrops,
  readQualityCompanyDocFile,
  removeQualityCompanyDocFile,
  resolveQualityCompanyDocAcl,
  saveQualityCompanyDocDrop,
} from "@/lib/quality-company-doc-drops";
import { isQualityCompanyDocId, qualityCompanyDocsListedFor } from "@/lib/quality-company-docs";
import { listQualityFolderDrops, listQualityVaultOwnerTree, saveQualityFolderDrop } from "@/lib/quality-folder-drops";
import { isQualityFolderId, qualityFoldersListedFor } from "@/lib/quality-folders";
import {
  attachQualityPackageShelfKit,
  listQualityPackageShelf,
  saveQualityPackageShelfKit,
} from "@/lib/quality-package-shelf-drops";
import {
  listQualityTemplateFillDestinations,
  readQualityTemplateFill,
  removeQualityTemplateFill,
  saveQualityTemplateFill,
} from "@/lib/quality-template-form-drops";
import {
  lockHseCompanyDoc,
  listHseCompanyDocDrop,
  listHseCompanyDocDrops,
  readHseCompanyDocFile,
  removeHseCompanyDocFile,
  resolveHseCompanyDocAcl,
  saveHseCompanyDocDrop,
} from "@/lib/hse-company-doc-drops";
import { isHseCompanyDocId, hseCompanyDocsListedFor } from "@/lib/hse-company-docs";
import { listHseFolderDrops, listHseVaultOwnerTree, saveHseFolderDrop } from "@/lib/hse-folder-drops";
import { isHseFolderId, hseFoldersListedFor } from "@/lib/hse-folders";
import {
  attachHsePackageShelfKit,
  listHsePackageShelf,
  saveHsePackageShelfKit,
} from "@/lib/hse-package-shelf-drops";
import {
  listHseTemplateFillDestinations,
  readHseTemplateFill,
  removeHseTemplateFill,
  saveHseTemplateFill,
} from "@/lib/hse-template-form-drops";
import { filterVaultBriefsForViewer } from "@/lib/vault-list-filter";

function qualityCompanyId(request: URLSearchParams | { companyId?: string; company?: string }) {
  if (request instanceof URLSearchParams) {
    return request.get("company")?.trim() || request.get("companyId")?.trim() || "";
  }
  return request.companyId?.trim() || request.company?.trim() || "";
}

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await readSession(cookieValue(request));
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const kind = params.get("kind");
  if (!isLeadBriefKind(kind)) {
    return NextResponse.json({ error: "Pick a desk." }, { status: 400 });
  }
  const user = kind === "quality" || kind === "hse" ? await scopedDeskUser(session, request) : session;

  const jobId = params.get("jobId")?.trim() || "";
  const folderId = params.get("folder") || params.get("folderId") || "";
  const fileName = params.get("file")?.trim() || "";
  const companyId = qualityCompanyId(params);
  const companyDocs = params.get("scope") === "company-docs" || isQualityCompanyDocId(folderId, companyId || undefined);
  const hseCompanyDocs = params.get("scope") === "company-docs" || isHseCompanyDocId(folderId, companyId || undefined);
  if (kind === "quality" && params.get("scope") === "template-fill") {
    const fileName = params.get("file")?.trim() || params.get("fileName")?.trim() || "";
    if (fileName) {
      const listed = await readQualityTemplateFill(user, {
        dest: params.get("dest"),
        jobId: jobId || undefined,
        folderId: folderId || undefined,
        packageId: params.get("packageId"),
        fileName,
        companyId: companyId || undefined,
        companyLabel: params.get("companyLabel") || undefined,
        siteLabel: params.get("site") || params.get("siteLabel") || undefined,
        jobLabel: params.get("jobLabel") || undefined,
      });
      if (!listed.ok) return NextResponse.json({ error: listed.error }, { status: listed.status });
      return NextResponse.json({
        file: listed.file,
        form: listed.form,
        dest: listed.dest,
        jobId: listed.jobId,
        folderId: listed.folderId,
        store: listed.store,
        stored: listed.stored,
      });
    }
    const listed = await listQualityTemplateFillDestinations(user, companyId || undefined);
    return NextResponse.json({
      acl: listed.acl,
      kits: listed.kits,
    });
  }
  if (kind === "quality" && params.get("scope") === "package-shelf") {
    const listed = await listQualityPackageShelf(user, companyId || undefined);
    return NextResponse.json({
      kits: listed.kits,
      acl: listed.acl,
      store: listed.store,
      stored: listed.stored,
    });
  }
  if (kind === "quality" && params.get("tree") === "1") {
    if (!hasBuildDesk(user)) return NextResponse.json({ error: "Build desk only." }, { status: 403 });
    const tree = await listQualityVaultOwnerTree(user);
    return NextResponse.json({
      tree,
      store: leadBriefStoreKind("quality"),
      stored: leadBriefStoreKind("quality") === "drive",
    });
  }
  if (kind === "quality" && companyDocs) {
    if (fileName && isQualityCompanyDocId(folderId, companyId || undefined)) {
      const listed = await readQualityCompanyDocFile(user, folderId, fileName, companyId || undefined);
      if (!listed.file) {
        return NextResponse.json(
          { error: listed.error || "File not found." },
          { status: listed.error ? 415 : 404 },
        );
      }
      return NextResponse.json({
        file: listed.file,
        store: listed.store,
        stored: listed.stored,
      });
    }
    if (isQualityCompanyDocId(folderId, companyId || undefined)) {
      const [listed, acl] = await Promise.all([
        listQualityCompanyDocDrop(user, folderId, companyId || undefined),
        resolveQualityCompanyDocAcl(user),
      ]);
      return NextResponse.json({
        briefs: listed.briefs,
        files: listed.files,
        folders: qualityCompanyDocsListedFor(companyId),
        locked: listed.locked,
        locksKnown: listed.locksKnown,
        acl,
        store: listed.store,
        stored: listed.stored,
      });
    }
    const [listed, acl] = await Promise.all([
      listQualityCompanyDocDrops(user, companyId || undefined),
      resolveQualityCompanyDocAcl(user),
    ]);
    return NextResponse.json({
      folders: listed.folders,
      filesByFolder: listed.filesByFolder,
      locksByFolder: listed.locksByFolder,
      locksKnown: listed.locksKnown,
      companyId: listed.companyId,
      acl,
      store: listed.store,
      stored: listed.stored,
    });
  }
  if (kind === "quality" && jobId && isQualityFolderId(folderId, companyId || undefined)) {
    const listed = await listQualityFolderDrops(user, jobId, folderId, companyId || undefined, {
      companyLabel: params.get("companyLabel") || undefined,
      siteLabel: params.get("site") || params.get("siteLabel") || undefined,
      jobLabel: params.get("jobLabel") || undefined,
    });
    return NextResponse.json({
      briefs: listed.briefs,
      files: listed.files,
      folders: qualityFoldersListedFor(companyId),
      store: listed.store,
      stored: listed.stored,
    });
  }
  if (kind === "hse" && params.get("scope") === "template-fill") {
    const fillName = params.get("file")?.trim() || params.get("fileName")?.trim() || "";
    if (fillName) {
      const listed = await readHseTemplateFill(user, {
        dest: params.get("dest"),
        jobId: jobId || undefined,
        folderId: folderId || undefined,
        packageId: params.get("packageId"),
        fileName: fillName,
        companyId: companyId || undefined,
        companyLabel: params.get("companyLabel") || undefined,
        siteLabel: params.get("site") || params.get("siteLabel") || undefined,
        jobLabel: params.get("jobLabel") || undefined,
      });
      if (!listed.ok) return NextResponse.json({ error: listed.error }, { status: listed.status });
      return NextResponse.json({
        file: listed.file,
        form: listed.form,
        dest: listed.dest,
        jobId: listed.jobId,
        folderId: listed.folderId,
        store: listed.store,
        stored: listed.stored,
      });
    }
    const listed = await listHseTemplateFillDestinations(user, companyId || undefined);
    return NextResponse.json({
      acl: listed.acl,
      kits: listed.kits,
    });
  }
  if (kind === "hse" && params.get("scope") === "package-shelf") {
    const listed = await listHsePackageShelf(user, companyId || undefined);
    return NextResponse.json({
      kits: listed.kits,
      acl: listed.acl,
      store: listed.store,
      stored: listed.stored,
    });
  }
  if (kind === "hse" && params.get("tree") === "1") {
    if (!hasBuildDesk(user)) return NextResponse.json({ error: "Build desk only." }, { status: 403 });
    const tree = await listHseVaultOwnerTree(user);
    return NextResponse.json({
      tree,
      store: leadBriefStoreKind("hse"),
      stored: leadBriefStoreKind("hse") === "drive",
    });
  }
  if (kind === "hse" && hseCompanyDocs) {
    if (fileName && isHseCompanyDocId(folderId, companyId || undefined)) {
      const listed = await readHseCompanyDocFile(user, folderId, fileName, companyId || undefined);
      if (!listed.file) {
        return NextResponse.json(
          { error: listed.error || "File not found." },
          { status: listed.error ? 415 : 404 },
        );
      }
      return NextResponse.json({
        file: listed.file,
        store: listed.store,
        stored: listed.stored,
      });
    }
    if (isHseCompanyDocId(folderId, companyId || undefined)) {
      const [listed, acl] = await Promise.all([
        listHseCompanyDocDrop(user, folderId, companyId || undefined),
        resolveHseCompanyDocAcl(user),
      ]);
      return NextResponse.json({
        briefs: listed.briefs,
        files: listed.files,
        folders: hseCompanyDocsListedFor(companyId),
        locked: listed.locked,
        locksKnown: listed.locksKnown,
        acl,
        store: listed.store,
        stored: listed.stored,
      });
    }
    const [listed, acl] = await Promise.all([
      listHseCompanyDocDrops(user, companyId || undefined),
      resolveHseCompanyDocAcl(user),
    ]);
    return NextResponse.json({
      folders: listed.folders,
      filesByFolder: listed.filesByFolder,
      locksByFolder: listed.locksByFolder,
      locksKnown: listed.locksKnown,
      companyId: listed.companyId,
      acl,
      store: listed.store,
      stored: listed.stored,
    });
  }
  if (kind === "hse" && jobId && isHseFolderId(folderId, companyId || undefined)) {
    const listed = await listHseFolderDrops(user, jobId, folderId, companyId || undefined, {
      companyLabel: params.get("companyLabel") || undefined,
      siteLabel: params.get("site") || params.get("siteLabel") || undefined,
      jobLabel: params.get("jobLabel") || undefined,
    });
    return NextResponse.json({
      briefs: listed.briefs,
      files: listed.files,
      folders: hseFoldersListedFor(companyId),
      store: listed.store,
      stored: listed.stored,
    });
  }

  const briefs = hasBuildDesk(user)
    ? await listStoredBriefs(kind, undefined, jobId ? { jobId, companyId: companyId || undefined } : undefined)
    : await listStoredBriefs(kind, user.email, jobId ? { jobId, companyId: companyId || undefined } : undefined);
  return NextResponse.json({
    briefs: filterVaultBriefsForViewer(briefs.map(publicBrief), user),
    folders: kind === "quality" ? qualityFoldersListedFor(companyId) : kind === "hse" ? hseFoldersListedFor(companyId) : undefined,
    store: leadBriefStoreKind(kind === "quality" ? "quality" : "hse"),
    stored: kind === "quality" || kind === "hse" ? leadBriefStoreKind(kind) === "drive" : undefined,
  });
}

export async function POST(request: Request) {
  const session = await readSession(cookieValue(request));
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    kind?: string;
    describe?: string;
    files?: Array<{ name?: string; type?: string; data?: string }>;
    jobId?: string;
    folderId?: string;
    companyId?: string;
    company?: string;
    companyLabel?: string;
    siteLabel?: string;
    jobLabel?: string;
    scope?: string;
    action?: string;
    locked?: boolean;
    fileName?: string;
    file?: { name?: string; type?: string; data?: string } | string;
    packageId?: string;
    packageName?: string;
    name?: string;
    dest?: string;
    source?: string;
    sourceFolder?: string;
    sourceName?: string;
    replace?: boolean;
  };
  const companyId = qualityCompanyId(body);
  if (!isLeadBriefKind(body.kind)) {
    return NextResponse.json({ error: "Pick a desk." }, { status: 400 });
  }
  const user = body.kind === "quality" || body.kind === "hse" ? await scopedDeskUser(session, request) : session;

  if (body.kind === "quality" && body.scope === "template-fill") {
    if (body.action === "remove") {
      const result = await removeQualityTemplateFill(user, { ...body, companyId: companyId || undefined });
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
      return NextResponse.json({
        dest: result.dest,
        fileName: result.fileName,
        jobId: result.jobId,
        folderId: result.folderId,
        stored: result.stored,
        store: result.store,
        ripple: result.ripple,
      });
    }
    const result = await saveQualityTemplateFill(user, { ...body, companyId: companyId || undefined });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, rejected: "rejected" in result ? result.rejected : undefined },
        { status: result.status },
      );
    }
    return NextResponse.json({
      dest: result.dest,
      fileName: result.fileName,
      jobId: result.jobId,
      folderId: result.folderId,
      packageId: "packageId" in result ? result.packageId : undefined,
      brief: result.brief,
      kit: "kit" in result ? result.kit : undefined,
      stored: result.stored,
      store: result.store,
      ripple: result.ripple,
    });
  }

  if (body.kind === "quality" && body.scope === "package-shelf") {
    if (body.action === "attach") {
      const result = await attachQualityPackageShelfKit(user, { ...body, companyId: companyId || undefined });
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
      return NextResponse.json({
        brief: result.brief,
        attached: result.attached,
        stored: result.stored,
        store: result.store,
      });
    }
    const result = await saveQualityPackageShelfKit(user, { ...body, companyId: companyId || undefined });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, rejected: "rejected" in result ? result.rejected : undefined },
        { status: result.status },
      );
    }
    return NextResponse.json({
      brief: result.brief,
      kit: result.kit,
      stored: result.stored,
      store: result.store,
    });
  }

  if (body.kind === "quality" && (body.scope === "company-docs" || isQualityCompanyDocId(body.folderId, companyId || undefined))) {
    if (body.action === "lock") {
      const result = await lockQualityCompanyDoc(user, { ...body, companyId: companyId || undefined });
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
      return NextResponse.json({
        locked: result.locked,
        stored: result.stored,
        store: result.store,
        folders: qualityCompanyDocsListedFor(companyId),
      });
    }
    const result = await saveQualityCompanyDocDrop(user, { ...body, companyId: companyId || undefined });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, rejected: result.rejected },
        { status: result.status },
      );
    }
    return NextResponse.json({
      brief: result.brief,
      files: result.brief.files,
      rejected: result.rejected,
      folders: qualityCompanyDocsListedFor(companyId),
      stored: result.stored,
      store: result.store,
    });
  }

  if (body.kind === "quality" && (body.folderId || body.jobId)) {
    const result = await saveQualityFolderDrop(user, { ...body, companyId: companyId || undefined });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, rejected: result.rejected },
        { status: result.status },
      );
    }
    return NextResponse.json({
      brief: result.brief,
      files: result.brief.files,
      rejected: result.rejected,
      folders: qualityFoldersListedFor(companyId),
      stored: result.stored,
      store: result.store,
    });
  }

  if (body.kind === "hse" && body.scope === "template-fill") {
    if (body.action === "remove") {
      const result = await removeHseTemplateFill(user, { ...body, companyId: companyId || undefined });
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
      return NextResponse.json({
        dest: result.dest,
        fileName: result.fileName,
        jobId: result.jobId,
        folderId: result.folderId,
        stored: result.stored,
        store: result.store,
        ripple: result.ripple,
      });
    }
    const result = await saveHseTemplateFill(user, { ...body, companyId: companyId || undefined });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, rejected: "rejected" in result ? result.rejected : undefined },
        { status: result.status },
      );
    }
    return NextResponse.json({
      dest: result.dest,
      fileName: result.fileName,
      jobId: result.jobId,
      folderId: result.folderId,
      packageId: "packageId" in result ? result.packageId : undefined,
      brief: result.brief,
      kit: "kit" in result ? result.kit : undefined,
      stored: result.stored,
      store: result.store,
      ripple: result.ripple,
    });
  }

  if (body.kind === "hse" && body.scope === "package-shelf") {
    if (body.action === "attach") {
      const result = await attachHsePackageShelfKit(user, { ...body, companyId: companyId || undefined });
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
      return NextResponse.json({
        brief: result.brief,
        attached: result.attached,
        stored: result.stored,
        store: result.store,
      });
    }
    const result = await saveHsePackageShelfKit(user, { ...body, companyId: companyId || undefined });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, rejected: "rejected" in result ? result.rejected : undefined },
        { status: result.status },
      );
    }
    return NextResponse.json({
      brief: result.brief,
      kit: result.kit,
      stored: result.stored,
      store: result.store,
    });
  }

  if (body.kind === "hse" && (body.scope === "company-docs" || isHseCompanyDocId(body.folderId, companyId || undefined))) {
    if (body.action === "lock") {
      const result = await lockHseCompanyDoc(user, { ...body, companyId: companyId || undefined });
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
      return NextResponse.json({
        locked: result.locked,
        stored: result.stored,
        store: result.store,
        folders: hseCompanyDocsListedFor(companyId),
      });
    }
    const result = await saveHseCompanyDocDrop(user, { ...body, companyId: companyId || undefined });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, rejected: result.rejected },
        { status: result.status },
      );
    }
    return NextResponse.json({
      brief: result.brief,
      files: result.brief.files,
      rejected: result.rejected,
      folders: hseCompanyDocsListedFor(companyId),
      stored: result.stored,
      store: result.store,
    });
  }

  if (body.kind === "hse" && (body.folderId || body.jobId)) {
    const result = await saveHseFolderDrop(user, { ...body, companyId: companyId || undefined });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, rejected: result.rejected },
        { status: result.status },
      );
    }
    return NextResponse.json({
      brief: result.brief,
      files: result.brief.files,
      rejected: result.rejected,
      folders: hseFoldersListedFor(companyId),
      stored: result.stored,
      store: result.store,
    });
  }

  try {
    const brief = await saveStoredBrief({
      kind: body.kind,
      who: user.email,
      whoName: user.name,
      describe: body.describe,
      files: Array.isArray(body.files) ? body.files.map((file) => ({
        name: typeof file.name === "string" ? file.name : "",
        type: typeof file.type === "string" ? file.type : "",
        data: typeof file.data === "string" ? file.data : "",
      })) : [],
      jobId: body.jobId,
      folderId: body.folderId,
      companyId: companyId || undefined,
    });
    return NextResponse.json({
      brief: publicBrief(brief),
      store: leadBriefStoreKind(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return NextResponse.json(
      { error: message === HSE_VAULT_WRITE_ERROR ? HSE_VAULT_WRITE_ERROR : DRIVE_WRITE_ERROR },
      { status: 503 },
    );
  }
}

export async function DELETE(request: Request) {
  const session = await readSession(cookieValue(request));
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    kind?: string;
    scope?: string;
    folderId?: string;
    companyId?: string;
    company?: string;
    fileName?: string;
    file?: string;
    dest?: string;
    jobId?: string;
    packageId?: string;
  };
  const companyId = qualityCompanyId(body);
  if (body.kind === "quality" && body.scope === "template-fill") {
    const user = await scopedDeskUser(session, request);
    const result = await removeQualityTemplateFill(user, { ...body, companyId: companyId || undefined });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({
      dest: result.dest,
      fileName: result.fileName,
      jobId: result.jobId,
      folderId: result.folderId,
      stored: result.stored,
      store: result.store,
    });
  }
  if (body.kind === "hse" && body.scope === "template-fill") {
    const user = await scopedDeskUser(session, request);
    const result = await removeHseTemplateFill(user, { ...body, companyId: companyId || undefined });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({
      dest: result.dest,
      fileName: result.fileName,
      jobId: result.jobId,
      folderId: result.folderId,
      stored: result.stored,
      store: result.store,
    });
  }
  if (body.kind === "hse" && (body.scope === "company-docs" || isHseCompanyDocId(body.folderId, companyId || undefined))) {
    const user = await scopedDeskUser(session, request);
    const result = await removeHseCompanyDocFile(user, {
      companyId: companyId || undefined,
      folderId: body.folderId,
      fileName: body.fileName || body.file,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({
      files: result.files,
      stored: result.stored,
      store: result.store,
      folders: hseCompanyDocsListedFor(companyId),
    });
  }
  if (body.kind !== "quality" || (body.scope !== "company-docs" && !isQualityCompanyDocId(body.folderId, companyId || undefined))) {
    return NextResponse.json({ error: "Pick a Quality file." }, { status: 400 });
  }
  const user = await scopedDeskUser(session, request);
  const result = await removeQualityCompanyDocFile(user, {
    companyId: companyId || undefined,
    folderId: body.folderId,
    fileName: body.fileName || body.file,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({
    files: result.files,
    stored: result.stored,
    store: result.store,
    folders: qualityCompanyDocsListedFor(companyId),
  });
}
