import { NextResponse } from "next/server";
import { readSeatClaim, readSession, SEAT_CLAIM_COOKIE } from "@/lib/auth";
import { assignedCompany } from "@/lib/companies-store";
import { cookieValue } from "@/lib/http";
import { hydrateSeatStore, persistExistingOwnerHash } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await readSession(cookieValue(request));
  if (user) {
    try {
      await hydrateSeatStore();
      await persistExistingOwnerHash({
        email: user.email,
        claim: await readSeatClaim(cookieValue(request, SEAT_CLAIM_COOKIE)),
      });
    } catch {
      // Keep the signed-in session. Vault retry is best-effort.
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
