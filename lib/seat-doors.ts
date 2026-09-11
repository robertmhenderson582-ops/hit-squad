export const SEAT_DOORS = ["quality", "hse", "estimates"] as const;
export type SeatDoorId = (typeof SEAT_DOORS)[number];

export function isSeatDoorId(value: unknown): value is SeatDoorId {
  return typeof value === "string" && (SEAT_DOORS as readonly string[]).includes(value);
}

export function normalizeSeatDoors(raw: unknown): SeatDoorId[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter(isSeatDoorId))];
}
