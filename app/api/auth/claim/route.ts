import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { sessionCookieOptions, SESSION_COOKIE, signSession } from "@/lib/auth";
import { isBlockedEmail } from "@/lib/seats";
import { getSeatSecret, markSeatSignIn, setSeatPassword } from "@/lib/seat-store";
import { findUserByEmail, toPublicUser } from "@/lib/users";

export const dynamic = "force-dynamic";

const GENERIC_ERROR = "Sign-in failed. Check the email and password.";

export async function POST(request: Request) {
  let body: { email?: unknown; password?: unknown; acknowledged?: unknown };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send email and password as JSON." }, { status: 400 });
  }

  if (body.acknowledged !== true) {
    return NextResponse.json(
      { error: "Confidentiality acknowledgement is required before sign-in." },
      { status: 400 },
    );
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }
  if (isBlockedEmail(email)) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }
  if (password.length < 10) {
    return NextResponse.json({ error: "Choose a password of at least 10 characters." }, { status: 400 });
  }

  const user = await findUserByEmail(email);
  if (!user || user.role !== "tester") {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  const existing = await getSeatSecret(user.email);
  if (existing?.passwordHash) {
    return NextResponse.json({ error: "Password already set. Use Enter the desk." }, { status: 409 });
  }

  await setSeatPassword(user.email, bcrypt.hashSync(password, 12));
  const claimed = await findUserByEmail(user.email);
  if (!claimed) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  const publicUser = toPublicUser(claimed);
  const token = await signSession(publicUser);
  await markSeatSignIn(publicUser.email);
  const response = NextResponse.json({ user: publicUser });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return response;
}
