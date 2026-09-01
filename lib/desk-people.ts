import { companyIdForEmail, peopleLane, type CompanyId } from "./companies.ts";
import { NOVUS_EMAIL } from "./desk-role.ts";
import { VISUAL_ROSTER } from "./owner-desk.ts";
import { TESTER_SEATS } from "./tester-seats.ts";

export type DeskPerson = {
  id: string;
  email: string;
  name: string;
  companyId?: CompanyId;
};

type SeatLike = {
  id?: string;
  email?: string;
  name?: string;
  role?: string;
  companyId?: string;
};

/** Stable View as / Follow id. Seeded visual ids stay nathan/joseph/… so stored lenses keep working. */
export function lensIdForSeat(seat: { id: string; email: string }): string {
  const email = seat.email.trim().toLowerCase();
  const visual = VISUAL_ROSTER.find((row) => row.email.toLowerCase() === email);
  return visual?.id ?? seat.id;
}

export function lensPeopleFromSeats(seats: SeatLike[]): DeskPerson[] {
  const people: DeskPerson[] = [];
  const seen = new Set<string>();
  for (const row of seats) {
    if (!row || row.role === "owner" || row.role === "operator") continue;
    const email = typeof row.email === "string" ? row.email.trim().toLowerCase() : "";
    const name = typeof row.name === "string" ? row.name.trim() : "";
    const rawId = typeof row.id === "string" ? row.id.trim() : "";
    if (!email || !name || !rawId || email === NOVUS_EMAIL) continue;
    if (row.role && row.role !== "tester") continue;
    if (seen.has(email)) continue;
    seen.add(email);
    const companyId =
      typeof row.companyId === "string" && row.companyId.trim()
        ? row.companyId.trim()
        : companyIdForEmail(email);
    people.push({ id: lensIdForSeat({ id: rawId, email }), email, name, companyId });
  }
  return people;
}

export function peopleByLane<T extends { email: string; companyId?: string }>(
  people: T[],
  assignments?: Record<string, string>,
): { company: T[]; standalone: T[] } {
  const company: T[] = [];
  const standalone: T[] = [];
  for (const row of people) {
    const id = row.companyId || companyIdForEmail(row.email, assignments);
    if (peopleLane(id) === "standalone") standalone.push(row);
    else company.push(row);
  }
  return { company, standalone };
}

export function followIdFromEmail(email = "", people: DeskPerson[] = []): string | undefined {
  const needle = email.trim().toLowerCase();
  if (!needle || needle === NOVUS_EMAIL) return undefined;
  const visual = VISUAL_ROSTER.find((row) => row.email.toLowerCase() === needle);
  if (visual) return visual.id;
  return people.find((row) => row.email === needle)?.id;
}

export function personFromLensId(id: string, people: DeskPerson[] = []): DeskPerson | undefined {
  if (!id || id === "owner") return undefined;
  const visual = VISUAL_ROSTER.find((row) => row.id === id);
  if (visual) {
    return {
      id: visual.id,
      email: visual.email.toLowerCase(),
      name: visual.name,
      companyId: companyIdForEmail(visual.email),
    };
  }
  return people.find((row) => row.id === id || row.email === id);
}

/** Seeded testers for first paint. Vault extras arrive after /api/desk/seats. Never Novus. */
export function seededDeskPeople(): DeskPerson[] {
  return lensPeopleFromSeats(
    TESTER_SEATS.map((seat) => ({ id: seat.id, email: seat.email, name: seat.name, role: "tester" })),
  );
}

export function mergeDeskPeople(fetched: SeatLike[]): DeskPerson[] {
  return lensPeopleFromSeats([
    ...TESTER_SEATS.map((seat) => ({ id: seat.id, email: seat.email, name: seat.name, role: "tester" })),
    ...fetched,
  ]);
}
