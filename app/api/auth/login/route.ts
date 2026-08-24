import { NextResponse } from "next/server";
import { sessionCookieOptions, SESSION_COOKIE, signSession } from "@/lib/auth";
import { findUserByEmail, toPublicUser, verifyPassword } from "@/lib/users";

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

  const email = typeof body.email === "string" ? body.email : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  const user = findUserByEmail(email);
  if (!user || !verifyPassword(user, password)) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  const publicUser = toPublicUser(user);
  const token = await signSession(publicUser);
  const response = NextResponse.json({ user: publicUser });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return response;
}
