import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { hasBuildDesk, isOwner, NOVUS_EMAIL } from "@/lib/desk-role";
import { cookieValue } from "@/lib/http";
import { issueSeatPassword, listSeatRows } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!hasBuildDesk(user)) return NextResponse.json({ error: "Build desk only." }, { status: 403 });
  return NextResponse.json({
    seats: listSeatRows(),
    note: "Operator seats are owner-created. Testers never see this list. No invite is sent.",
  });
}

export async function POST(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!isOwner(user)) return NextResponse.json({ error: "Owner issues operator passwords." }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { email?: string; password?: string };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (email !== NOVUS_EMAIL) {
    return NextResponse.json({ error: "Only the Novus operator seat can be issued here." }, { status: 400 });
  }
  const result = issueSeatPassword(email, password);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({
    ok: true,
    seats: listSeatRows(),
    note: "Password issued on this desk. Don’t send. Never logged.",
  });
}
