import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { cookieValue } from "@/lib/http";
import { deskUserFromRequest } from "@/lib/desk-scope";
import { handoffTargetsFor } from "@/lib/handoff";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  return NextResponse.json({
    people: handoffTargetsFor(deskUserFromRequest(user, request)),
  });
}
