import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { companiesListedForViewer, isStandaloneId } from "@/lib/companies";
import { assignedCompanyForUser, listCompanies, setCompanyLogo } from "@/lib/companies-store";
import { hasWorkingDesk, isOwner } from "@/lib/desk-role";
import { scopedDeskUser } from "@/lib/desk-scope-server";
import { cookieValue } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await readSession(cookieValue(request));
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!hasWorkingDesk(session)) return NextResponse.json({ error: "Build desk only." }, { status: 403 });
  const user = isOwner(session) ? await scopedDeskUser(session, request) : session;
  const companyId = await assignedCompanyForUser(user);
  const companies = companiesListedForViewer(user, await listCompanies(), companyId).filter(
    (row) => !isStandaloneId(row.id),
  );
  return NextResponse.json({ companies });
}

export async function POST(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!isOwner(user)) return NextResponse.json({ error: "Owner tools stay with the owner." }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { companyId?: string; logo?: string | null };
  const result = await setCompanyLogo(typeof body.companyId === "string" ? body.companyId : "", body.logo ?? null);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  const companies = (await listCompanies()).filter((row) => !isStandaloneId(row.id));
  return NextResponse.json({
    ok: true,
    company: result.company,
    companies,
    note: result.company.logo ? "Logo saved on this desk." : "Logo removed.",
  });
}
