import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { cookieValue } from "@/lib/http";
import { getVisiblePack } from "@/lib/estimate-vault";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ packId: string }> }) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { packId } = await context.params;
  const pack = await getVisiblePack(user, packId);
  if (!pack) return NextResponse.json({ error: "That package is not on this desk." }, { status: 404 });
  return NextResponse.json({ pack });
}
