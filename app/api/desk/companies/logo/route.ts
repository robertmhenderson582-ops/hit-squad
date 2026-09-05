import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { isStandaloneId } from "@/lib/companies";
import { listCompanies, setCompanyLogo } from "@/lib/companies-store";
import { hasBuildDesk, isOwner } from "@/lib/desk-role";
import { cookieValue } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!hasBuildDesk(user)) return NextResponse.json({ error: "Build desk only." }, { status: 403 });
  const companies = (await listCompanies()).filter((row) => !isStandaloneId(row.id));
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
