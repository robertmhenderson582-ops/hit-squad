import type { PublicUser } from "@/lib/types";
import { isJosephEmail, testerByEmail } from "./tester-seats.ts";

export const NOVUS_EMAIL = "robertmhenderson582+novus@gmail.com";
export const NOVUS_ID = "operator-novus";

export function isOwner(user?: { role?: string } | null): boolean {
  return user?.role === "owner";
}

export function isOperator(user?: { role?: string } | null): boolean {
  return user?.role === "operator";
}

export function isTester(user?: { role?: string } | null): boolean {
  return user?.role === "tester";
}

export function hasBuildDesk(user?: { role?: string } | null): boolean {
  return isOwner(user) || isOperator(user);
}

export function canUseRateBuilder(user?: { email?: string; role?: string } | null): boolean {
  if (!user) return false;
  if (isJosephEmail(user.email)) return false;
  if (isTester(user)) return testerByEmail(user.email || "")?.rateBuilder !== false;
  return true;
}

export function canUseViewAs(user?: { email?: string; role?: string } | null): boolean {
  return hasBuildDesk(user) || isJosephEmail(user?.email);
}

export function viewingAsOther(viewAs?: string | null): boolean {
  return Boolean(viewAs && viewAs !== "owner");
}

export function buildDeskChrome(user?: PublicUser | null, viewAs?: string | null): boolean {
  return hasBuildDesk(user) && !viewingAsOther(viewAs);
}
