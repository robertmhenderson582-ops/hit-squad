import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { cookieValue } from "@/lib/http";
import { scopedDeskUser } from "@/lib/desk-scope-server";
import {
  readScrAttachmentBytes,
  removeScrAttachmentFile,
  saveScrAttachments,
} from "@/lib/scr-attachment-drops";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ packId: string }> }) {
  const session = await readSession(cookieValue(request));
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const user = await scopedDeskUser(session, request);
  const { packId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    rowId?: string;
    files?: Array<{ name?: string; type?: string; data?: string }>;
  };
  const result = await saveScrAttachments(user, { packId, rowId: body.rowId, files: body.files });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, rejected: "rejected" in result ? result.rejected : undefined },
      { status: result.status },
    );
  }
  return NextResponse.json({
    attachments: result.attachments,
    rejected: result.rejected,
    stored: result.stored,
    store: result.store,
  });
}

export async function GET(request: Request, context: { params: Promise<{ packId: string }> }) {
  const session = await readSession(cookieValue(request));
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const user = await scopedDeskUser(session, request);
  const { packId } = await context.params;
  const params = new URL(request.url).searchParams;
  const result = await readScrAttachmentBytes(user, {
    packId,
    rowId: params.get("rowId"),
    driveId: params.get("fileId") || params.get("driveId"),
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  const bytes = result.file.bytes;
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new NextResponse(copy, {
    status: 200,
    headers: {
      "Content-Type": result.file.type || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${result.file.name.replace(/"/g, "")}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function DELETE(request: Request, context: { params: Promise<{ packId: string }> }) {
  const session = await readSession(cookieValue(request));
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const user = await scopedDeskUser(session, request);
  const { packId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    rowId?: string;
    driveId?: string;
    fileName?: string;
    fileId?: string;
  };
  const result = await removeScrAttachmentFile(user, {
    packId,
    rowId: body.rowId,
    driveId: body.driveId || body.fileId,
    fileName: body.fileName,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({
    ok: true,
    missing: result.missing,
    trashed: result.trashed,
    stored: result.stored,
    store: result.store,
  });
}
