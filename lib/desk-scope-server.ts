import { viewAsSeatFromRequest, deskScopeUser } from "./desk-scope.ts";
import { hydrateSeatStore, listSeatRows } from "./users.ts";
import type { PublicUser } from "./types.ts";

async function testerPeople() {
  try {
    await hydrateSeatStore();
    return (await listSeatRows()).filter((row) => row.role === "tester");
  } catch {
    return [];
  }
}

export async function scopedDeskUser(session: PublicUser, request: Request): Promise<PublicUser> {
  return deskScopeUser(session, viewAsSeatFromRequest(request), null, await testerPeople());
}

export async function hydratedHandoffExtras() {
  return (await testerPeople()).map((row) => ({ name: row.name, email: row.email }));
}
