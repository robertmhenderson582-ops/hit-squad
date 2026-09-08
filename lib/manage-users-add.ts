export const SEATS_REQUEST_DEADLINE_MS = 15000;
export const SEATS_RECOVER_DEADLINE_MS = 4000;
export const SEATS_TIMEOUT_ERROR =
  "Add user timed out. Try again. If the seat already appears below, you do not need to resubmit.";
export const DESK_SEATS_CHANGED_EVENT = "desk-seats-changed";

export type ManageSeatRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  passwordIssued?: boolean;
  companyId?: string;
};

export function seatEmailKey(email: string) {
  return email.trim().toLowerCase();
}

export function seatsIncludeEmail(seats: Array<{ email?: string }>, email: string) {
  const key = seatEmailKey(email);
  return Boolean(key) && seats.some((row) => seatEmailKey(row.email || "") === key);
}

export function optimisticSeat(input: {
  name: string;
  email: string;
  role: "tester" | "president";
  companyId: string;
}): ManageSeatRow {
  const email = seatEmailKey(input.email);
  return {
    id: `pending-${email}`,
    email,
    name: input.name.trim().replace(/\s+/g, " "),
    role: input.role,
    passwordIssued: true,
    companyId: input.companyId,
  };
}

export function applyAddedSeats<T extends ManageSeatRow>(
  current: T[],
  nextSeats?: T[] | null,
  created?: Partial<ManageSeatRow> | null,
  fallback?: ManageSeatRow,
): T[] {
  if (Array.isArray(nextSeats) && nextSeats.length > 0) return nextSeats;
  const email = seatEmailKey(created?.email || fallback?.email || "");
  if (!email) return current;
  const row = {
    ...fallback,
    ...created,
    id: created?.id || fallback?.id || `custom-${email}`,
    email,
    name: (created?.name || fallback?.name || "").trim(),
    role: created?.role || fallback?.role || "tester",
    passwordIssued: true,
    companyId: created?.companyId || fallback?.companyId,
  } as T;
  if (seatsIncludeEmail(current, email)) {
    return current.map((seat) => (seatEmailKey(seat.email) === email ? { ...seat, ...row } : seat));
  }
  return [...current, row];
}

export function removeOptimisticSeat<T extends ManageSeatRow>(seats: T[], email: string) {
  const key = seatEmailKey(email);
  return seats.filter((row) => !(row.id.startsWith("pending-") && seatEmailKey(row.email) === key));
}

export function isAlreadySeatedError(message?: string) {
  return /already has a seat/i.test(message || "");
}
