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
  listQualityCompanyDocDrop,
  listQualityCompanyDocDrops,
  readQualityCompanyDocFile,
  saveQualityCompanyDocDrop,
} from "@/lib/quality-company-doc-drops";
import { isQualityCompanyDocId, qualityCompanyDocsListedFor } from "@/lib/quality-company-docs";
import { listQualityFolderDrops, listQualityVaultOwnerTree, saveQualityFolderDrop } from "@/lib/quality-folder-drops";
import { isQualityFolderId, qualityFoldersListedFor } from "@/lib/quality-folders";

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
  const user = kind === "quality" ? await scopedDeskUser(session, request) : session;

  const jobId = params.get("jobId")?.trim() || "";
  const folderId = params.get("folder") || params.get("folderId") || "";
  const fileName = params.get("file")?.trim() || "";
  const companyId = qualityCompanyId(params);
  const companyDocs = params.get("scope") === "company-docs" || isQualityCompanyDocId(folderId, companyId || undefined);
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
      const listed = await listQualityCompanyDocDrop(user, folderId, companyId || undefined);
      return NextResponse.json({
        briefs: listed.briefs,
        files: listed.files,
        folders: qualityCompanyDocsListedFor(companyId),
        store: listed.store,
        stored: listed.stored,
      });
    }
    const listed = await listQualityCompanyDocDrops(user, companyId || undefined);
    return NextResponse.json({
      folders: listed.folders,
      filesByFolder: listed.filesByFolder,
      companyId: listed.companyId,
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

  const briefs = hasBuildDesk(user)
    ? await listStoredBriefs(kind, undefined, jobId ? { jobId, companyId: companyId || undefined } : undefined)
    : await listStoredBriefs(kind, user.email, jobId ? { jobId, companyId: companyId || undefined } : undefined);
  return NextResponse.json({
    briefs: briefs.map(publicBrief),
    folders: kind === "quality" ? qualityFoldersListedFor(companyId) : undefined,
    store: leadBriefStoreKind(kind === "quality" ? "quality" : "hse"),
    stored: kind === "quality" ? leadBriefStoreKind("quality") === "drive" : undefined,
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
  };
  const companyId = qualityCompanyId(body);
  if (!isLeadBriefKind(body.kind)) {
    return NextResponse.json({ error: "Pick a desk." }, { status: 400 });
  }
  const user = body.kind === "quality" ? await scopedDeskUser(session, request) : session;

  if (body.kind === "quality" && (body.scope === "company-docs" || isQualityCompanyDocId(body.folderId, companyId || undefined))) {
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
