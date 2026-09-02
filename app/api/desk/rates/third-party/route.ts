import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { canUseRateBuilder } from "@/lib/desk-role";
import { scopedDeskUser } from "@/lib/desk-scope-server";
import { cookieValue } from "@/lib/http";
import { listThirdPartyCatalog, ratesStoreKind, saveThirdPartyCatalog } from "@/lib/third-party-rental-store";
import { parseThirdPartyCatalog } from "@/lib/third-party-rental";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  return NextResponse.json({ catalog: await listThirdPartyCatalog(), store: ratesStoreKind() });
}

export async function PUT(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const deskUser = await scopedDeskUser(user, request);
  if (!canUseRateBuilder(deskUser)) {
    return NextResponse.json({ error: "Rate builder only." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { catalog?: unknown };
  if (!Array.isArray(body.catalog)) {
    return NextResponse.json({ error: "Missing catalog." }, { status: 400 });
  }
  const catalog = await saveThirdPartyCatalog(parseThirdPartyCatalog(body.catalog));
  return NextResponse.json({ catalog, store: ratesStoreKind() });
}
