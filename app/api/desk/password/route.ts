import { NextResponse } from "next/server";
import {
  readSession,
  SEAT_CLAIM_COOKIE,
  SESSION_COOKIE,
  seatClaimCookieOptions,
  sessionCookieOptions,
  signSeatClaim,
  signSession,
} from "@/lib/auth";
import { cookieValue } from "@/lib/http";
import { findUserByEmail, flushSeatVault, hydrateSeatStore, seatHashClaimFor, setOwnPassword, toPublicUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await readSession(cookieValue(request));
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { current?: string; next?: string };
  const next = typeof body.next === "string" ? body.next : "";
  const current = typeof body.current === "string" ? body.current : "";

  await hydrateSeatStore();
  const result = setOwnPassword(session.email, next, current || undefined);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  await flushSeatVault();

  const stored = findUserByEmail(session.email);
  if (!stored) return NextResponse.json({ error: "That seat is not on this desk." }, { status: 404 });
  const publicUser = toPublicUser(stored);
  const token = await signSession(publicUser);
  const response = NextResponse.json({
    ok: true,
    user: publicUser,
    note: "Password changed on this desk process. Never logged.",
  });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  const claim = seatHashClaimFor(publicUser.email);
  if (claim) {
    response.cookies.set(SEAT_CLAIM_COOKIE, await signSeatClaim(claim), seatClaimCookieOptions());
  }
  return response;
}
