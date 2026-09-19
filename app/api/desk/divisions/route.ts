import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { canSeeCompany, companiesListedForViewer, companyScopeFor, isStandaloneId } from "@/lib/companies";
import {
  addDivision,
  assignedCompanyForUser,
  listCompanies,
  listDivisionsForScope,
  removeDivision,
  renameDivision,
} from "@/lib/companies-store";
import { WOOD_RIVER_MOLD } from "@/lib/divisions";
import { hasWorkingDesk, isOwner } from "@/lib/desk-role";
import { scopedDeskUser } from "@/lib/desk-scope-server";
import { cookieValue } from "@/lib/http";

export const dynamic = "force-dynamic";

async function scopeFor(user: { email: string; role?: string }) {
  return companyScopeFor(user, await assignedCompanyForUser(user));
}

async function viewerFor(request: Request, session: { email: string; role: string }) {
  return isOwner(session) ? scopedDeskUser(session, request) : session;
}

export async function GET(request: Request) {
  const session = await readSession(cookieValue(request));
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!hasWorkingDesk(session)) return NextResponse.json({ error: "Working desk only." }, { status: 403 });
  const user = await viewerFor(request, session);
  const scope = await scopeFor(user);
  const companies = companiesListedForViewer(user, await listCompanies(), scope.companyId).filter(
    (row) => !isStandaloneId(row.id),
  );
  return NextResponse.json({
    companies,
    divisions: await listDivisionsForScope(scope),
    mold: WOOD_RIVER_MOLD,
  });
}

export async function POST(request: Request) {
  const session = await readSession(cookieValue(request));
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!hasWorkingDesk(session)) return NextResponse.json({ error: "Working desk only." }, { status: 403 });

  const user = await viewerFor(request, session);
  const scope = await scopeFor(user);
  const body = (await request.json().catch(() => ({}))) as {
    companyId?: string;
    id?: string;
    name?: string;
    code?: string | null;
    remove?: boolean;
  };
  const companyId = typeof body.companyId === "string" ? body.companyId.trim() : "";
  if (!canSeeCompany(scope, companyId) || isStandaloneId(companyId)) {
    return NextResponse.json({ error: "Pick a company on this desk." }, { status: 400 });
  }
  if (!isOwner(session) && companyId !== scope?.companyId) {
    return NextResponse.json({ error: "Pick a company on this desk." }, { status: 403 });
  }

  if (body.remove) {
    const result = await removeDivision(companyId, typeof body.id === "string" ? body.id : "");
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({
      ok: true,
      divisions: await listDivisionsForScope(scope),
      companies: companiesListedForViewer(user, await listCompanies(), scope.companyId),
      note: "Division removed. Live estimates stay on their packs.",
    });
  }

  if (typeof body.id === "string" && body.id.trim()) {
    const result = await renameDivision(companyId, body.id.trim(), typeof body.name === "string" ? body.name : "", body.code);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({
      ok: true,
      division: result.division,
      divisions: await listDivisionsForScope(scope),
      companies: companiesListedForViewer(user, await listCompanies(), scope.companyId),
      note: "Division renamed.",
    });
  }

  const result = await addDivision(companyId, typeof body.name === "string" ? body.name : "", body.code);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({
    ok: true,
    division: result.division,
    divisions: await listDivisionsForScope(scope),
      companies: companiesListedForViewer(user, await listCompanies(), scope.companyId),
      note: "Division created on the Wood River mold.",
    mold: WOOD_RIVER_MOLD,
  });
}
