import { NOVUS_HELP_EMAIL } from "./desk-help.ts";

export const NOVUS_INVITE_FROM = NOVUS_HELP_EMAIL;
export const FORBIDDEN_INVITE_DOMAIN = "madisonltd.com";
export const INVITE_SEND_UNCONFIRMED = "Owner must click Send before Novus Gmail delivers the invite.";
export const INVITE_FORBIDDEN_DOMAIN = "Never email madisonltd.com.";
export const INVITE_NOT_CONFIGURED = "Novus Gmail is not configured. The invite card stays on this desk.";

export function inviteEmailAllowed(email?: string | null) {
  const key = (email || "").trim().toLowerCase();
  if (!key.includes("@") || key.includes(" ")) return false;
  return !key.endsWith(`@${FORBIDDEN_INVITE_DOMAIN}`);
}
