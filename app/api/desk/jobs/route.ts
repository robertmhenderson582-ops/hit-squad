import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { assignedCompaniesForId, companyDeskLogoSrc, companyScopeFor } from "@/lib/companies";
import { assignedCompanyForUser, listCompanies, listDivisionsForScope } from "@/lib/companies-store";
import { cookieValue } from "@/lib/http";
import { scopedDeskUser } from "@/lib/desk-scope-server";
import { deskForUser, omitCatalogSeedJobs, seedJobsAllowed } from "@/lib/jobs";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const deskUser = await scopedDeskUser(user, request);
  const companyId = await assignedCompanyForUser(deskUser);
  const assigned = assignedCompaniesForId(companyId, await listCompanies());
  const scope = companyScopeFor(deskUser, companyId);
  const desk = deskForUser(deskUser.id, scope);
  if (!seedJobsAllowed(scope)) desk.jobs = omitCatalogSeedJobs(desk.jobs);

  return NextResponse.json({
    user: { id: deskUser.id, email: deskUser.email, name: deskUser.name },
    desk,
    companyId,
    companyName: assigned[0]?.name ?? "",
    companyDeskLogo: companyDeskLogoSrc(assigned),
    divisions: await listDivisionsForScope(scope),
  });
}
