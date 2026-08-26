import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { hasBuildDesk, isOwner } from "@/lib/desk-role";
import { cookieValue } from "@/lib/http";
import { findUserByEmail, issueSeatPassword, listSeatRows } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!hasBuildDesk(user)) return NextResponse.json({ error: "Build desk only." }, { status: 403 });
  return NextResponse.json({
    seats: listSeatRows(),
    note: "Owner-created seats. Testers never see this list. No invite is sent.",
  });
}

export async function POST(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!isOwner(user)) return NextResponse.json({ error: "Owner issues one-time passwords." }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { email?: string; password?: string };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const target = findUserByEmail(email);
  if (!target || target.role === "owner") {
    return NextResponse.json({ error: "Pick a seeded non-owner seat." }, { status: 400 });
  }
  const result = issueSeatPassword(email, password);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({
    ok: true,
    seats: listSeatRows(),
    note: "Password issued on this desk. Don’t send. Never logged.",
  });
}
