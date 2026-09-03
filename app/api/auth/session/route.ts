import { NextResponse } from "next/server";
import { readSeatClaim, readSession, SEAT_CLAIM_COOKIE } from "@/lib/auth";
import { assignedCompany } from "@/lib/companies-store";
import { cookieValue } from "@/lib/http";
import { hydrateSeatStore, persistExistingOwnerHash } from "@/lib/users";

export const dynamic = "force-dynamic";

const SESSION_PERSIST_ATTEMPTS = 4;

export async function GET(request: Request) {
  const user = await readSession(cookieValue(request));
  if (user) {
    try {
      await hydrateSeatStore();
      const claim = await readSeatClaim(cookieValue(request, SEAT_CLAIM_COOKIE));
      for (let attempt = 0; attempt < SESSION_PERSIST_ATTEMPTS; attempt++) {
        try {
          const landed = await persistExistingOwnerHash({
            email: user.email,
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
  }
  return NextResponse.json(
    { user, companyId: user ? await assignedCompany(user.email) : null },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    },
  );
}
