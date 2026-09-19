import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { assignmentChoices, isStandaloneId, parseCompanyModulePatch, parseCompanyModules } from "@/lib/companies";
import {
  addCompany,
  assignedCompanyForUser,
  listCompanies,
  peekAssignedCompanyForUser,
  updateCompany,
} from "@/lib/companies-store";
import { toCompanySetupSite } from "@/lib/company-setup";
import { catalogSites } from "@/lib/desk-data";
import { seatsVisibleTo } from "@/lib/desk-people";
import { isOwner } from "@/lib/desk-role";
import { scopedDeskUser } from "@/lib/desk-scope-server";
import { cookieValue } from "@/lib/http";
import { companyDispatchEnabled } from "@/lib/module-access";
import { publicSiteAccessGrant } from "@/lib/site-access";
import { listSiteAccessGrants } from "@/lib/site-access-store";
import { hydrateSeatStore, listSeatRows } from "@/lib/users";

export const dynamic = "force-dynamic";

async function companyPayloadFor(user: { email: string; role?: string }) {
  const companies = await listCompanies();
  const companyId = await assignedCompanyForUser(user);
  const company = companies.find((row) => row.id === companyId) ?? null;
  return {
    companies,
    companyId,
    company,
    modules: parseCompanyModules(company?.modules),
    dispatch: companyDispatchEnabled(company),
  };
}

export async function GET(request: Request) {
  const session = await readSession(cookieValue(request));
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  if (!isOwner(session)) {
    const base = await companyPayloadFor(session);
    return NextResponse.json({
      companies: base.companies.filter((row) => row.id === base.companyId && !isStandaloneId(row.id)),
      companyId: base.companyId,
      company: base.company,
      modules: base.modules,
      dispatch: base.dispatch,
    });
  }

  const user = await scopedDeskUser(session, request);
  const base = await companyPayloadFor(user);
  await hydrateSeatStore();
  const seats = seatsVisibleTo(session, await listSeatRows({ hydrate: false })).map((row) => ({
    ...row,
    companyId: row.companyId || peekAssignedCompanyForUser(row),
  }));
  return NextResponse.json({
    ...base,
    seats,
    choices: assignmentChoices(base.companies),
    sites: catalogSites().map(toCompanySetupSite),
    grants: (await listSiteAccessGrants()).map((grant) => publicSiteAccessGrant(grant)),
  });
}

export async function POST(request: Request) {
  const session = await readSession(cookieValue(request));
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!isOwner(session)) return NextResponse.json({ error: "Owner tools stay with the owner." }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    name?: string;
    shortName?: string | null;
    companyId?: string;
    dispatch?: boolean;
    modules?: Record<string, unknown>;
  };

  if (body.action === "create" || (typeof body.name === "string" && !body.companyId && body.action !== "update")) {
    const result = await addCompany(typeof body.name === "string" ? body.name : "", { shortName: body.shortName });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
    const listed = await listCompanies();
    return NextResponse.json({
      ok: true,
      company: result.company,
      companies: listed,
      note: "Company added on this desk.",
    });
  }

  const companyId = typeof body.companyId === "string" ? body.companyId.trim() : "";
  const result = await updateCompany(companyId, {
    name: body.name,
    shortName: body.shortName,
    modules: {
      ...(typeof body.dispatch === "boolean" ? { dispatch: body.dispatch } : {}),
      ...parseCompanyModulePatch(body.modules),
    },
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({
    ok: true,
    company: result.company,
    companies: await listCompanies(),
    note: "Company saved on this desk.",
  });
}
