import { NextResponse } from "next/server";
import { readSession } from "./auth.ts";
import { canSeeRateVault } from "./desk-role.ts";
import { cookieValue } from "./http.ts";
import { rateVaultAccess } from "./rate-vault.ts";

export async function requireRateVault(request: Request) {
  const user = await readSession(cookieValue(request));
  const access = rateVaultAccess(user);
  if (!access.ok) {
    return {
      user: null,
      error: NextResponse.json({ error: access.error }, { status: access.status }),
    };
  }
  if (!canSeeRateVault(user)) {
    return {
      user: null,
      error: NextResponse.json({ error: "Rate Vault is owner-eyes-only." }, { status: 403 }),
    };
  }
  return { user, error: null };
}
