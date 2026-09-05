import { after, NextResponse } from "next/server";
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
import { peekAssignedCompany } from "@/lib/companies-store";
import { cookieValue } from "@/lib/http";
import {
  hydrateSeatStore,
  liveSessionUser,
  persistExistingOwnerHash,
  scheduleSessionVaultCatchUp,
  seatHashClaimFor,
} from "@/lib/users";

export const dynamic = "force-dynamic";

const SESSION_PERSIST_ATTEMPTS = 4;

async function catchUpOwnerVault(request: Request, email: string) {
  await hydrateSeatStore();
  const claim = await readSeatClaim(cookieValue(request, SEAT_CLAIM_COOKIE));
  for (let attempt = 0; attempt < SESSION_PERSIST_ATTEMPTS; attempt++) {
    try {
      const landed = await persistExistingOwnerHash({
        email,
        claim,
      });
      if (landed) break;
      // false means skipped (no owner hash / env seed). Do not keep PATCHing.
      break;
    } catch {
      if (attempt === SESSION_PERSIST_ATTEMPTS - 1) break;
    }
  }
}

function beginSessionVaultCatchUp(request: Request, email: string) {
  const work = () => catchUpOwnerVault(request, email);
  // after() cannot delay the response. Outside a request scope (tests), fire-and-forget.
  try {
    after(() => work().catch(() => {}));
  } catch {
    scheduleSessionVaultCatchUp(work);
  }
}

export async function GET(request: Request) {
  const cookieUser = await readSession(cookieValue(request));
  // Cookie / local seat only on the hot path. Never await Drive here —
  // hung hydrateSeatStore / persistExistingOwnerHash left SessionProvider
  // status=loading and AuthGate on CHECKING DESK SESSION.
  const user = cookieUser ? liveSessionUser(cookieUser) : cookieUser;
  if (cookieUser) {
    beginSessionVaultCatchUp(request, cookieUser.email);
  }
  const response = NextResponse.json(
    { user, companyId: user ? peekAssignedCompany(user.email) : null },
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
