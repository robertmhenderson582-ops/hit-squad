import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { cookieValue, serverTiming } from "@/lib/http";
import { hasBuildDesk } from "@/lib/desk-role";
import { scopedDeskUser } from "@/lib/desk-scope-server";
import { listVisiblePacks, packsResponse, upsertVisiblePack } from "@/lib/estimate-vault";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const deskUser = await scopedDeskUser(user, request);
  const started = Date.now();
  const { packs, store } = await listVisiblePacks(deskUser);
  const ms = Date.now() - started;
  const response = NextResponse.json(packsResponse(deskUser, packs, store));
  response.headers.set("Server-Timing", serverTiming([["estimates", ms]]));
  if (user.role === "owner") {
    console.info("[hs-vault] estimates GET", { ms, packs: packs.length, store });
  }
  return response;
}

export async function PUT(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { pack?: unknown };
  try {
    const result = await upsertVisiblePack(user, body.pack ?? body);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    const payload: { ok: true; stored: boolean; pack: typeof result.pack; store?: string } = {
      ok: true,
      stored: result.stored,
      pack: result.pack,
    };
    if (hasBuildDesk(user)) payload.store = result.store;
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json({ error: "Could not store that package." }, { status: 502 });
  }
}
