import { canSeeCompany, companiesForScope, companyScopeFor, isStandaloneId, type Company } from "./companies.ts";
import { assignedCompany, listCompanies, listDivisions } from "./companies-store.ts";
import {
  canAddUsers,
  canManagePositions,
  isOwner,
  isOperator,
} from "./desk-role.ts";
import type { Division } from "./divisions.ts";
import {
  addableRolesForRank,
  actorRank,
  orgPeopleForAssign,
  positionViews,
  type OrgPosition,
  type OrgPositionHold,
  type OrgPositionPerson,
  type SeatGrantActor,
} from "./org-positions.ts";
import { listHolds, listPositionCatalog } from "./org-positions-store.ts";
import type { PrivilegeViewer } from "./privileges.ts";
import { listSeatRows } from "./users.ts";

export type PositionDeskPayload = {
  positions: ReturnType<typeof positionViews>;
  people: OrgPositionPerson[];
  divisions: Division[];
  companies: Company[];
  holds: OrgPositionHold[];
  catalog: OrgPosition[];
  actor: SeatGrantActor;
};

export function peopleFromSeats(
  seats: Array<{ id: string; email: string; name: string; role: string; companyId?: string }>,
): OrgPositionPerson[] {
  return seats
    .filter((row) => row.role !== "operator")
    .map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      companyId: row.companyId,
    }));
}

export function grantActorFor(
  user: PrivilegeViewer & { email?: string; role?: string },
  holds: OrgPositionHold[],
  catalog: OrgPosition[],
  addableCompanyIds: string[],
): SeatGrantActor {
  const rank = actorRank(user, holds, catalog);
  const owner = isOwner(user);
  const operator = isOperator(user);
  return {
    rank,
    canAddUsers: canAddUsers(user),
    canManagePositions: canManagePositions(user),
    canIssuePasswords: owner,
    canAddCompany: owner,
    addableRoles: owner || operator ? ["tester", "president"] : addableRolesForRank(rank),
    addableCompanyIds,
  };
}

export async function loadPositionDesk(
  user: PrivilegeViewer & { email: string; role: string },
): Promise<PositionDeskPayload> {
  const [companies, divisions, seats] = await Promise.all([listCompanies(), listDivisions(), listSeatRows()]);
  const catalog = await listPositionCatalog(divisions);
  const holds = await listHolds(seats);
  const assigned = await assignedCompany(user.email);
  const scope = companyScopeFor(user, assigned);
  const visibleCompanies = (isOwner(user) || isOperator(user)
    ? companies
    : companiesForScope(scope, companies)
  ).filter((row) => !isStandaloneId(row.id));
  const addableCompanyIds = visibleCompanies.map((row) => row.id);
  const people = orgPeopleForAssign(user, peopleFromSeats(seats));
  const visiblePositions = catalog.filter((row) => !row.companyId || canSeeCompany(scope, row.companyId));
  return {
    positions: positionViews(visiblePositions, holds, peopleFromSeats(seats), divisions),
    people,
    divisions: divisions.filter((row) => canSeeCompany(scope, row.companyId)),
    companies: visibleCompanies,
    holds,
    catalog,
    actor: grantActorFor(user, holds, catalog, addableCompanyIds),
  };
}
