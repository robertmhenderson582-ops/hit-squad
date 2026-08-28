import { followIdFromEmail, type DeskPerson } from "./desk-people.ts";
import { isFollowSeat, type FollowSeat } from "./owner-desk.ts";

const BLOCKED =
  /^\/(settings|users|follow|tickets|inbox|activity)(\/|$)/i;

export function canFollowSeatId(id: string): id is FollowSeat {
  return id !== "owner" && isFollowSeat(id);
}

export function followSeatFromEmail(email = "", people: DeskPerson[] = []): FollowSeat | undefined {
  return followIdFromEmail(email, people);
}

/** Testers never land on owner tools. Home if the last path is blocked or empty. */
export function followLandPath(path = ""): string {
  const next = path.trim() || "/";
  if (!next.startsWith("/")) return "/";
  if (BLOCKED.test(next)) return "/";
  return next;
}
