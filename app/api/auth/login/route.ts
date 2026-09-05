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
import { cookieValue, serverTiming } from "@/lib/http";
import { isOwnerLoginEmail } from "@/lib/owner-login";
import {
  flushSeatVault,
  hydrateSeatStore,
  loginOutcome,
  persistExistingOwnerHash,
  passwordWriteLanded,
  restoreSeatHash,
  seatHashClaimFor,
} from "@/lib/users";

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
      { error: "Confidentiality acknowledgement is required before signing in." },
      { status: 400 },
    );
  }

  const email = typeof body.email === "string" ? body.email : "";
  const hydrateStarted = Date.now();
  await hydrateSeatStore();
  const hydrateMs = Date.now() - hydrateStarted;
  const incomingClaim = await readSeatClaim(cookieValue(request, SEAT_CLAIM_COOKIE));
  restoreSeatHash(email, incomingClaim);
  const persistStarted = Date.now();
  try {
    await persistExistingOwnerHash({ email, claim: incomingClaim });
  } catch {
    // Keep sign-in. Vault retry is best-effort.
  }
  const persistMs = Date.now() - persistStarted;

  const outcome = loginOutcome({
    email,
    password: typeof body.password === "string" ? body.password : "",
    newPassword: typeof body.newPassword === "string" ? body.newPassword : "",
    confirmPassword: typeof body.confirmPassword === "string" ? body.confirmPassword : "",
  });
  const createdPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  // Normal password auth: hydrate already read Drive seats. Skip awaiting a
  // seats.json write when this request did not create/migrate a password.
  let flushMs = 0;
  if (createdPassword) {
    const flushStarted = Date.now();
    try {
      await flushSeatVault();
    } catch {
      return NextResponse.json(
        { error: "Password was not saved.", vaultPersisted: false },
        { status: 503 },
      );
    }
    flushMs = Date.now() - flushStarted;
  }
  if (createdPassword && outcome.status === "authenticated") {
    if (!(await passwordWriteLanded(email, createdPassword))) {
      return NextResponse.json(
        { error: "Password was not saved.", vaultPersisted: false },
        { status: 503 },
      );
    }
  }

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
  response.headers.set("Server-Timing", serverTiming([
    ["seat-hydrate", hydrateMs],
    ["seat-persist", persistMs],
    ["seat-flush", flushMs],
  ]));
  if (isOwnerLoginEmail(email)) {
    console.info("[hs-auth] login", { hydrateMs, persistMs, flushMs, flushed: Boolean(createdPassword) });
  }
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  const claim = seatHashClaimFor(outcome.user.email);
  if (claim) {
    response.cookies.set(SEAT_CLAIM_COOKIE, await signSeatClaim(claim), seatClaimCookieOptions());
  }
  return response;
}
