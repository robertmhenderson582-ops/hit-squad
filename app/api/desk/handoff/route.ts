import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { cookieValue } from "@/lib/http";
import { hydratedHandoffExtras, scopedDeskUser } from "@/lib/desk-scope-server";
import { handoffTargetsFor } from "@/lib/handoff";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const extras = await hydratedHandoffExtras();
  return NextResponse.json({
    people: handoffTargetsFor(await scopedDeskUser(user, request), extras),
  });
}
