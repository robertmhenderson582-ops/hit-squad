import { VISUAL_ROSTER, type FollowSeat } from "./owner-desk.ts";

const BLOCKED =
  /^\/(settings|users|follow|tickets|inbox|activity)(\/|$)/i;

export function canFollowSeatId(id: string): id is FollowSeat {
  return id !== "owner" && VISUAL_ROSTER.some((row) => row.id === id);
}

export function followSeatFromEmail(email = ""): FollowSeat | undefined {
  const needle = email.trim().toLowerCase();
  if (!needle) return undefined;
  const row = VISUAL_ROSTER.find((item) => item.email.toLowerCase() === needle);
  return row?.id;
}

/** Testers never land on owner tools. Home if the last path is blocked or empty. */
export function followLandPath(path = ""): string {
  const next = path.trim() || "/";
  if (!next.startsWith("/")) return "/";
  if (BLOCKED.test(next)) return "/";
  return next;
}
