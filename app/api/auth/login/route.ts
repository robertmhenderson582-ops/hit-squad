import { NextResponse } from "next/server";
import { sessionCookieOptions, SESSION_COOKIE, signSession } from "@/lib/auth";
import { loginOutcome } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: {
    email?: unknown;
    password?: unknown;
    acknowledged?: unknown;
    newPassword?: unknown;
    confirmPassword?: unknown;
  };

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

  const outcome = loginOutcome({
    email: typeof body.email === "string" ? body.email : "",
    password: typeof body.password === "string" ? body.password : "",
    newPassword: typeof body.newPassword === "string" ? body.newPassword : "",
    confirmPassword: typeof body.confirmPassword === "string" ? body.confirmPassword : "",
  });

  if (outcome.status === "needsCreate") {
    return NextResponse.json({ needsCreate: true });
  }
  if (outcome.status === "needsPassword") {
    return NextResponse.json({ needsPassword: true });
  }
  if (outcome.status === "error") {
    return NextResponse.json({ error: outcome.error }, { status: outcome.http });
  }

  const token = await signSession(outcome.user);
  const response = NextResponse.json({ user: outcome.user });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return response;
}
