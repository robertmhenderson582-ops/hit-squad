import { NextResponse } from "next/server";
import {
  readSeatClaim,
  SEAT_CLAIM_COOKIE,
  SESSION_COOKIE,
  seatClaimCookieOptions,
  sessionCookieOptions,
  signSeatClaim,
  signSession,
} from "@/lib/auth";
import { cookieValue } from "@/lib/http";
import { flushSeatVault, hydrateSeatStore, loginOutcome, restoreSeatHash, seatHashClaimFor } from "@/lib/users";

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

  const email = typeof body.email === "string" ? body.email : "";
  await hydrateSeatStore();
  restoreSeatHash(email, await readSeatClaim(cookieValue(request, SEAT_CLAIM_COOKIE)));

  const outcome = loginOutcome({
    email,
    password: typeof body.password === "string" ? body.password : "",
    newPassword: typeof body.newPassword === "string" ? body.newPassword : "",
    confirmPassword: typeof body.confirmPassword === "string" ? body.confirmPassword : "",
  });
  await flushSeatVault();

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
  const claim = seatHashClaimFor(outcome.user.email);
  if (claim) {
    response.cookies.set(SEAT_CLAIM_COOKIE, await signSeatClaim(claim), seatClaimCookieOptions());
  }
  return response;
}
