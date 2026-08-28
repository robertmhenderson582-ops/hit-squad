import { viewAsSeatFromRequest, deskScopeUser } from "./desk-scope.ts";
import { hydrateSeatStore, listSeatRows } from "./users.ts";
import type { PublicUser } from "./types.ts";

export async function scopedDeskUser(session: PublicUser, request: Request): Promise<PublicUser> {
  await hydrateSeatStore();
  const people = (await listSeatRows()).filter((row) => row.role === "tester");
  return deskScopeUser(session, viewAsSeatFromRequest(request), null, people);
}

export async function hydratedHandoffExtras() {
  await hydrateSeatStore();
  return (await listSeatRows())
    .filter((row) => row.role === "tester")
    .map((row) => ({ name: row.name, email: row.email }));
}
