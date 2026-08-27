import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { cookieValue } from "@/lib/http";
import { hasBuildDesk } from "@/lib/desk-role";
import { transferVisiblePack } from "@/lib/estimate-vault";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ packId: string }> }) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { packId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { email?: string };
  const email = typeof body.email === "string" ? body.email : "";
  try {
    const result = await transferVisiblePack(user, packId, email);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    const payload: { ok: true; pack: typeof result.pack; to: typeof result.to; store?: string } = {
      ok: true,
      pack: result.pack,
      to: result.to,
    };
    if (hasBuildDesk(user)) payload.store = result.store;
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json({ error: "Could not turn that job over." }, { status: 502 });
  }
}
