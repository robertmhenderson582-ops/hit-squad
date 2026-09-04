import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { assignedCompaniesForEmail, assignedCompany, companyDeskLogoForEmail } from "@/lib/companies-store";
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
  const companyId = await assignedCompany(deskUser.email);
  const assigned = await assignedCompaniesForEmail(deskUser.email);
  const scope = { isOwner: deskUser.role === "owner", email: deskUser.email, companyId };
  const desk = deskForUser(deskUser.id, scope);
  if (!seedJobsAllowed(scope)) desk.jobs = omitCatalogSeedJobs(desk.jobs);

  return NextResponse.json({
    user: { id: deskUser.id, email: deskUser.email, name: deskUser.name },
    desk,
    companyId,
    companyName: assigned[0]?.name ?? "",
    companyDeskLogo: await companyDeskLogoForEmail(deskUser.email),
  });
}
