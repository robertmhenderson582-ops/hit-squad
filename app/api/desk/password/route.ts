import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { cookieValue } from "@/lib/http";
import { findUserByEmail, verifyPassword } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await readSession(cookieValue(request));
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { current?: string; next?: string };
  if (!body.current || !body.next) {
    return NextResponse.json({ error: "Current and new password are required." }, { status: 400 });
  }
  if (body.next.length < 8) {
    return NextResponse.json({ error: "New password must be 8+." }, { status: 400 });
  }

  const stored = findUserByEmail(session.email);
  if (!stored || !verifyPassword(stored, body.current)) {
    return NextResponse.json({ error: "Current password did not match." }, { status: 401 });
  }
  stored.passwordHash = bcrypt.hashSync(body.next, 12);
  return NextResponse.json({ ok: true, note: "Password changed on this desk process. Never logged." });
}
