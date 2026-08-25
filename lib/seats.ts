import type { Capabilities, SeatPermission } from "@/lib/access";
import { capabilitiesFor } from "@/lib/access";

export type SeatId = "wendell" | "benny" | "chance" | "nathan" | "joseph" | "mark" | "bill";

export type SeatSeed = {
  id: SeatId;
  userId: string;
  name: string;
  username: string;
  email: string;
  permission: SeatPermission;
  aliasPlants: boolean;
  can: Capabilities;
};

function seat(
  id: SeatId,
  name: string,
  username: string,
  email: string,
  permission: SeatPermission,
  aliasPlants = false,
  extras: Partial<Capabilities> = {},
): SeatSeed {
  return {
    id,
    userId: `seat-${id}`,
    name,
    username,
    email: email.toLowerCase(),
    permission,
    aliasPlants,
    can: capabilitiesFor(permission, extras),
  };
}

export const SEEDED_SEATS: SeatSeed[] = [
  seat("wendell", "Wendell", "wendell", "Wlanderno@yahoo.com", "Trusted/HSE"),
  seat("benny", "Benny", "benny", "bccamp2@gmail.com", "Trusted/HSE", true),
  seat("chance", "Chance", "chance", "chancec318@yahoo.com", "Trusted/Quality"),
  seat("nathan", "Nathan Boyte", "nathanboyte", "nathanboyte@gmail.com", "PM/estimator"),
  seat("joseph", "Joseph Henderson", "joseph", "josephmhenderson2002@gmail.com", "Look & feel"),
  seat("mark", "Mark Schneider", "marks544", "marks544@yahoo.com", "Staff/numbers"),
  seat("bill", "Bill Stubblebine", "bstubby", "bstubby@aol.com", "Staff/numbers"),
];

const BLOCKED_EMAILS = new Set(["jhenderson582@gmail.com", "jamescain@gmail.com", "james.cain@gmail.com"]);

export function isBlockedEmail(email: string): boolean {
  return BLOCKED_EMAILS.has(email.trim().toLowerCase());
}

export function findSeatByEmail(email: string): SeatSeed | undefined {
  const normalized = email.trim().toLowerCase();
  if (isBlockedEmail(normalized)) return undefined;
  return SEEDED_SEATS.find((seat) => seat.email === normalized);
}

export function findSeatByUserId(userId: string): SeatSeed | undefined {
  return SEEDED_SEATS.find((seat) => seat.userId === userId);
}

export function findSeatById(id: string): SeatSeed | undefined {
  return SEEDED_SEATS.find((seat) => seat.id === id);
}
