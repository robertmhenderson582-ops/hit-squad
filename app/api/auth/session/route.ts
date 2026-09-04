import { NextResponse } from "next/server";
import {
  readSeatClaim,
  readSession,
  SEAT_CLAIM_COOKIE,
  SESSION_COOKIE,
  seatClaimCookieOptions,
  sessionCookieOptions,
  signSeatClaim,
  signSession,
} from "@/lib/auth";
import { assignedCompany } from "@/lib/companies-store";
import { cookieValue } from "@/lib/http";
import { hydrateSeatStore, liveSessionUser, persistExistingOwnerHash, seatHashClaimFor } from "@/lib/users";

export const dynamic = "force-dynamic";

const SESSION_PERSIST_ATTEMPTS = 4;

export async function GET(request: Request) {
  const cookieUser = await readSession(cookieValue(request));
  let user = cookieUser;
  if (cookieUser) {
    try {
      await hydrateSeatStore();
      const claim = await readSeatClaim(cookieValue(request, SEAT_CLAIM_COOKIE));
      for (let attempt = 0; attempt < SESSION_PERSIST_ATTEMPTS; attempt++) {
        try {
          const landed = await persistExistingOwnerHash({
            email: cookieUser.email,
            claim,
          });
          if (landed) break;
          // false means skipped (no owner hash / env seed). Do not keep PATCHing.
          break;
        } catch {
          if (attempt === SESSION_PERSIST_ATTEMPTS - 1) break;
        }
      }
    } catch {
      // Keep the signed-in session. Vault retry already exhausted.
    }
    // Vault / local seat wins. A stale hs_session or hs_seat_claim mustChange:true
    // must not keep FIRST SIGN-IN up after Settings / Continue / a vault clear.
    user = liveSessionUser(cookieUser);
  }
  const response = NextResponse.json(
    { user, companyId: user ? await assignedCompany(user.email) : null },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    },
  );
  if (user && cookieUser && Boolean(user.mustChangePassword) !== Boolean(cookieUser.mustChangePassword)) {
    response.cookies.set(SESSION_COOKIE, await signSession(user), sessionCookieOptions());
    const nextClaim = seatHashClaimFor(user.email);
    if (nextClaim) {
      response.cookies.set(SEAT_CLAIM_COOKIE, await signSeatClaim(nextClaim), seatClaimCookieOptions());
    }
  }
  return response;
}
