import { hasBuildDesk, lensUser } from "./desk-role.ts";
import { isViewAsSeat } from "./owner-desk.ts";
import type { PublicUser } from "./types.ts";

export const VIEW_AS_HEADER = "x-hs-view-as";

export function viewAsSeatFromValue(value?: string | null): string | null {
  const seat = (value || "").trim().toLowerCase();
  if (!seat || seat === "owner" || !isViewAsSeat(seat)) return null;
  return seat;
}

export function viewAsSeatFromRequest(request: Request): string | null {
  const header = request.headers.get(VIEW_AS_HEADER);
  const query = new URL(request.url).searchParams.get("viewAs");
  return viewAsSeatFromValue(header) || viewAsSeatFromValue(query);
}

/** Owner/operator View as uses that person's desk. Testers, including Joseph, stay themselves. */
export function deskScopeUser(
  session: PublicUser,
  viewAs?: string | null,
  followSeat?: string | null,
): PublicUser {
  if (!hasBuildDesk(session)) return session;
  return lensUser(session, viewAs, followSeat) ?? session;
}

export function deskUserFromRequest(session: PublicUser, request: Request): PublicUser {
  return deskScopeUser(session, viewAsSeatFromRequest(request));
}

export function viewingOtherDesk(session: Pick<PublicUser, "email">, deskUser: Pick<PublicUser, "email">) {
  return session.email.trim().toLowerCase() !== deskUser.email.trim().toLowerCase();
}

export function viewAsHeaders(seat?: string | null): HeadersInit {
  const next = viewAsSeatFromValue(seat);
  return { [VIEW_AS_HEADER]: next || "owner" };
}

export function viewAsInit(seat?: string | null, init?: RequestInit): RequestInit {
  const extra = viewAsHeaders(seat);
  const headers = new Headers(init?.headers);
  for (const [key, value] of Object.entries(extra)) headers.set(key, value);
  return { ...init, credentials: "include", cache: "no-store", headers };
}
