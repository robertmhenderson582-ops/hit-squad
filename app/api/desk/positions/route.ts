import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { canSeeCompany, companyScopeFor, isStandaloneId } from "@/lib/companies";
import { assignedCompany, isKnownCompany, setAssignedCompany } from "@/lib/companies-store";
import { canManagePositions, isOwner } from "@/lib/desk-role";
import { loadPositionDesk } from "@/lib/desk-positions-server";
import { cookieValue } from "@/lib/http";
import {
  CORPORATE_QC_MANAGER_POSITION_ID,
  PRESIDENT_POSITION_ID,
  SITE_QC_MANAGER_POSITION_ID,
  canCreateCustomPosition,
  canGrantPosition,
  canRemovePosition,
  canRenamePosition,
  canRevokeHold,
  parseDivisionHeadPositionId,
} from "@/lib/org-positions";
import {
  assignPosition,
  createCustomPosition,
  listHolds,
  removeStoredPosition,
  renameStoredPosition,
  revokePositionHold,
} from "@/lib/org-positions-store";
import { findUserByEmail, hydrateSeatStore, listSeatRows, setExtraSeatRole } from "@/lib/users";
import { applyVaultAclForSeat } from "@/lib/vault-acl-apply";

export const dynamic = "force-dynamic";

async function payload(user: { email: string; role: string; privileges?: string[] }) {
  await hydrateSeatStore();
  return loadPositionDesk(user);
}

async function syncPresidentLogin(email: string, holding: boolean) {
  const user = findUserByEmail(email);
  if (!user || user.role === "owner" || user.role === "operator") return;
  if (holding) {
    const changed = await setExtraSeatRole(email, "president");
    if ("ok" in changed) await setAssignedCompany(email, "madison");
    return;
  }
  const seats = await listSeatRows({ hydrate: false });
  const holds = await listHolds(seats);
  if (holds.some((row) => row.positionId === PRESIDENT_POSITION_ID && row.email === email)) return;
  await setExtraSeatRole(email, "tester");
}

export async function GET(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!canManagePositions(user)) return NextResponse.json({ error: "Working desk only." }, { status: 403 });
  const desk = await payload(user);
  return NextResponse.json({
    positions: desk.positions,
    people: desk.people,
    divisions: desk.divisions,
    companies: desk.companies,
    actor: desk.actor,
    note: "Assign, revoke, or rename any seat. Titles stack — Division Head does not strip Owner.",
  });
}

export async function POST(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!canManagePositions(user)) return NextResponse.json({ error: "Working desk only." }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    positionId?: string;
    email?: string;
    holdId?: string;
    label?: string;
    name?: string;
    companyId?: string;
    remove?: boolean;
  };
  const desk = await payload(user);
  const action = typeof body.action === "string" ? body.action.trim() : "";
  const positionId = typeof body.positionId === "string" ? body.positionId.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

  if (action === "assign") {
    const position = desk.catalog.find((row) => row.id === positionId);
    const target = desk.people.find((row) => row.email === email) || desk.positions.flatMap((row) => row.holders).find((row) => row.email === email);
    const person = target
      ? { id: "id" in target ? target.id : email, email: target.email, name: target.name, role: target.role, companyId: target.companyId }
      : undefined;
    const scope = companyScopeFor(user, await assignedCompany(user.email));
    const granted = canGrantPosition(user, position!, person, desk.holds, desk.catalog, {
      canSeeTarget: Boolean(person && desk.people.some((row) => row.email === person.email)),
      canSeeCompany: !position?.companyId || canSeeCompany(scope, position.companyId),
    });
    if ("error" in granted) return NextResponse.json({ error: granted.error }, { status: granted.error === "Not signed in." ? 401 : 400 });
    const result = await assignPosition(positionId, email, desk.divisions);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
    if (position?.kind === "president") await syncPresidentLogin(email, true);
    if (position?.id === CORPORATE_QC_MANAGER_POSITION_ID || position?.id === SITE_QC_MANAGER_POSITION_ID) {
      try {
        await applyVaultAclForSeat(email, ["quality"], person);
      } catch {
        // Seat assigned. Owner can retry vault share from the invite card.
      }
    }
    return NextResponse.json({ ok: true, hold: result.hold, ...(await payload(user)), note: "Seat assigned. Titles stack." });
  }

  if (action === "revoke") {
    const hold =
      desk.holds.find((row) => row.id === (typeof body.holdId === "string" ? body.holdId.trim() : "")) ||
      desk.holds.find((row) => row.positionId === positionId && row.email === email);
    const position = desk.catalog.find((row) => row.id === (hold?.positionId || positionId));
    const revoked = canRevokeHold(user, position, desk.holds, desk.catalog);
    if ("error" in revoked) return NextResponse.json({ error: revoked.error }, { status: 400 });
    const result = await revokePositionHold({ holdId: hold?.id, positionId: hold?.positionId || positionId, email: hold?.email || email });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
    if (position?.kind === "president") await syncPresidentLogin(result.hold.email, false);
    return NextResponse.json({ ok: true, hold: result.hold, ...(await payload(user)), note: "Seat revoked." });
  }

  if (action === "rename") {
    const position = desk.catalog.find((row) => row.id === positionId);
    const renamed = canRenamePosition(user, position, desk.holds, desk.catalog, body.label);
    if ("error" in renamed) return NextResponse.json({ error: renamed.error }, { status: 400 });
    const result = await renameStoredPosition(positionId, renamed.label, desk.divisions);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, position: result.position, ...(await payload(user)), note: "Position renamed." });
  }

  if (action === "create") {
    const created = canCreateCustomPosition(user, desk.holds, desk.catalog, body.name);
    if ("error" in created) return NextResponse.json({ error: created.error }, { status: 400 });
    const companyId = typeof body.companyId === "string" ? body.companyId.trim() : "";
    if (companyId) {
      if (isStandaloneId(companyId) || !(await isKnownCompany(companyId))) {
        return NextResponse.json({ error: "Pick a company on this desk." }, { status: 400 });
      }
      const scope = companyScopeFor(user, await assignedCompany(user.email));
      if (!canSeeCompany(scope, companyId)) {
        return NextResponse.json({ error: "Pick a company on this desk." }, { status: 403 });
      }
    }
    const result = await createCustomPosition(created.label, { companyId: companyId || undefined }, desk.divisions);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, position: result.position, ...(await payload(user)), note: "Position added. Same assign / revoke / rename as the others." });
  }

  if (action === "remove" || body.remove) {
    const position = desk.catalog.find((row) => row.id === positionId);
    const removable = canRemovePosition(position);
    if ("error" in removable) return NextResponse.json({ error: removable.error }, { status: 400 });
    if (!isOwner(user) && parseDivisionHeadPositionId(positionId)) {
      return NextResponse.json({ error: "Seeded seats stay on the catalog. Revoke people instead." }, { status: 403 });
    }
    const result = await removeStoredPosition(positionId);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, ...(await payload(user)), note: "Position removed. Holds on that title are gone." });
  }

  return NextResponse.json({ error: "Pick assign, revoke, rename, create, or remove." }, { status: 400 });
}
