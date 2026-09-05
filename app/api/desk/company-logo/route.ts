import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { assignedCompany, listCompanies } from "@/lib/companies-store";
import { companyScopeFor } from "@/lib/companies";
import { resolveEstimateCompanyLogo } from "@/lib/estimate-company-logo";
import { cookieValue } from "@/lib/http";
import { scopedDeskUser } from "@/lib/desk-scope-server";

export const dynamic = "force-dynamic";

/** Estimate company logo from the live catalog. Never the assigned-desk door alone. */
export async function GET(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const deskUser = await scopedDeskUser(user, request);
  const companyId = await assignedCompany(deskUser.email);
  const scope = companyScopeFor(deskUser, companyId);
  const url = new URL(request.url);
  const client = url.searchParams.get("client") ?? "";
  const site = url.searchParams.get("site") ?? "";
  const logo = resolveEstimateCompanyLogo(client, site, await listCompanies(), scope);
  return NextResponse.json({ logo });
}
