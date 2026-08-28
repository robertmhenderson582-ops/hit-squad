import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { cookieValue } from "@/lib/http";
import { hasBuildDesk } from "@/lib/desk-role";
import { scopedDeskUser } from "@/lib/desk-scope-server";
import { RETURN_WRITE_ERROR, returnVisiblePack } from "@/lib/estimate-vault";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ packId: string }> }) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const deskUser = await scopedDeskUser(user, request);
  const { packId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { pack?: unknown };
  try {
    const result = await returnVisiblePack(deskUser, packId, undefined, body.pack);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    const payload: { ok: true; pack: typeof result.pack; to: typeof result.to; store?: string } = {
      ok: true,
      pack: result.pack,
      to: result.to,
    };
    if (hasBuildDesk(user)) payload.store = result.store;
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json({ error: RETURN_WRITE_ERROR }, { status: 502 });
  }
}
