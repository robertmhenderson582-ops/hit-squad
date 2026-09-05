import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { cookieValue, serverTiming } from "@/lib/http";
import { scopedDeskUser } from "@/lib/desk-scope-server";
import { archiveVisiblePack, deleteVisiblePack, getVisiblePack } from "@/lib/estimate-vault";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ packId: string }> }) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { packId } = await context.params;
  const started = Date.now();
  const pack = await getVisiblePack(await scopedDeskUser(user, request), packId);
  const ms = Date.now() - started;
  if (!pack) return NextResponse.json({ error: "That package is not on this desk." }, { status: 404 });
  const response = NextResponse.json({ pack });
  response.headers.set("Server-Timing", serverTiming([["estimate-pack", ms]]));
  if (user.role === "owner") {
    console.info("[hs-vault] pack GET", { packId, ms });
  }
  return response;
}

export async function PATCH(request: Request, context: { params: Promise<{ packId: string }> }) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { packId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { archived?: boolean };
  if (typeof body.archived !== "boolean") {
    return NextResponse.json({ error: "Archive or restore this job." }, { status: 400 });
  }
  try {
    const result = await archiveVisiblePack(user, packId, body.archived);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, pack: result.pack });
  } catch {
    return NextResponse.json({ error: "Could not archive that job." }, { status: 502 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ packId: string }> }) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { packId } = await context.params;
  try {
    const result = await deleteVisiblePack(user, packId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, deleted: result.deleted });
  } catch {
    return NextResponse.json({ error: "Could not delete that job." }, { status: 502 });
  }
}
