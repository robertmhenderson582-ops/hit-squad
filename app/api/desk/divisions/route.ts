import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { canSeeCompany, companyScopeFor, isStandaloneId } from "@/lib/companies";
import {
  addDivision,
  assignedCompany,
  listCompanies,
  listDivisionsForScope,
  removeDivision,
  renameDivision,
} from "@/lib/companies-store";
import { WOOD_RIVER_MOLD } from "@/lib/divisions";
import { hasWorkingDesk, isOwner } from "@/lib/desk-role";
import { cookieValue } from "@/lib/http";

export const dynamic = "force-dynamic";

async function scopeFor(user: { email: string; role: string }) {
  const companyId = await assignedCompany(user.email);
  return companyScopeFor(user, companyId);
}

export async function GET(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!hasWorkingDesk(user)) return NextResponse.json({ error: "Working desk only." }, { status: 403 });
  const scope = await scopeFor(user);
  return NextResponse.json({
    companies: (await listCompanies()).filter((row) => canSeeCompany(scope, row.id) && !isStandaloneId(row.id)),
    divisions: await listDivisionsForScope(scope),
    mold: WOOD_RIVER_MOLD,
  });
}

export async function POST(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!hasWorkingDesk(user)) return NextResponse.json({ error: "Working desk only." }, { status: 403 });

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
  if (!isOwner(user) && companyId !== scope?.companyId) {
    return NextResponse.json({ error: "Pick a company on this desk." }, { status: 403 });
  }

  if (body.remove) {
    const result = await removeDivision(companyId, typeof body.id === "string" ? body.id : "");
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({
      ok: true,
      divisions: await listDivisionsForScope(scope),
      companies: (await listCompanies()).filter((row) => canSeeCompany(scope, row.id)),
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
      companies: (await listCompanies()).filter((row) => canSeeCompany(scope, row.id)),
      note: "Division renamed.",
    });
  }

  const result = await addDivision(companyId, typeof body.name === "string" ? body.name : "", body.code);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({
    ok: true,
    division: result.division,
    divisions: await listDivisionsForScope(scope),
    companies: (await listCompanies()).filter((row) => canSeeCompany(scope, row.id)),
    note: "Division created on the Wood River mold.",
    mold: WOOD_RIVER_MOLD,
  });
}
