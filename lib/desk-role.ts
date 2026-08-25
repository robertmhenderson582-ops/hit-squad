import type { PublicUser } from "@/lib/types";

export const NOVUS_EMAIL = "robertmhenderson582+novus@gmail.com";
export const NOVUS_ID = "operator-novus";

export function isOwner(user?: { role?: string } | null): boolean {
  return user?.role === "owner";
}

export function isOperator(user?: { role?: string } | null): boolean {
  return user?.role === "operator";
}

export function hasBuildDesk(user?: { role?: string } | null): boolean {
  return isOwner(user) || isOperator(user);
}

export function viewingAsOther(viewAs?: string | null): boolean {
  return Boolean(viewAs && viewAs !== "owner");
}

export function buildDeskChrome(user?: PublicUser | null, viewAs?: string | null): boolean {
  return hasBuildDesk(user) && !viewingAsOther(viewAs);
}
