import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { cookieValue } from "@/lib/http";
import { hasBuildDesk } from "@/lib/desk-role";
import { listVisiblePacks, packsResponse, UPSERT_WRITE_ERROR, upsertVisiblePack } from "@/lib/estimate-vault";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { packs, store } = await listVisiblePacks(user);
  return NextResponse.json(packsResponse(user, packs, store));
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
    return NextResponse.json({ error: UPSERT_WRITE_ERROR }, { status: 502 });
  }
}
