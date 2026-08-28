import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { addCompany, isKnownCompany, listCompanies, setAssignedCompany } from "@/lib/companies-store";
import { hasBuildDesk, isOwner } from "@/lib/desk-role";
import { cookieValue } from "@/lib/http";
import { createSeat, findUserByEmail, flushSeatVault, hydrateSeatStore, issueSeatPassword, listSeatRows } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!hasBuildDesk(user)) return NextResponse.json({ error: "Build desk only." }, { status: 403 });
  await hydrateSeatStore();
  return NextResponse.json({
    seats: await listSeatRows(),
    companies: await listCompanies(),
    note: "Owner-created seats. Testers never see this list. No invite is sent.",
  });
}

export async function POST(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!isOwner(user)) return NextResponse.json({ error: "Owner issues one-time passwords." }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    email?: string;
    password?: string;
    companyId?: string;
    addCompany?: string;
  };

  if (typeof body.addCompany === "string") {
    const result = await addCompany(body.addCompany);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({
      ok: true,
      company: result.company,
      seats: await listSeatRows(),
      companies: await listCompanies(),
      note: "Company added on this desk.",
    });
  }

  if (typeof body.name === "string" && body.name.trim()) {
    const created = await createSeat({
      name: body.name,
      email: body.email,
      password: body.password,
      companyId: body.companyId,
    });
    if ("error" in created) return NextResponse.json({ error: created.error }, { status: 400 });
    await flushSeatVault();
    return NextResponse.json({
      ok: true,
      user: created.user,
      seats: await listSeatRows(),
      companies: await listCompanies(),
      note: "Login created on this desk. Don’t send. First sign-in must change the password.",
    });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  await hydrateSeatStore();
  const target = findUserByEmail(email);
  if (!target || target.role === "owner") {
    return NextResponse.json({ error: "Pick a non-owner seat on this desk." }, { status: 400 });
  }

  if (typeof body.companyId === "string") {
    if (!(await isKnownCompany(body.companyId))) {
      return NextResponse.json({ error: "Pick a company on this desk." }, { status: 400 });
    }
    await setAssignedCompany(email, body.companyId);
    return NextResponse.json({
      ok: true,
      seats: await listSeatRows(),
      companies: await listCompanies(),
      note: "Company assignment saved on this desk.",
    });
  }

  const result = issueSeatPassword(email, password);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  await flushSeatVault();
  return NextResponse.json({
    ok: true,
    seats: await listSeatRows(),
    companies: await listCompanies(),
    note: "Password issued on this desk. Don’t send. Never logged.",
  });
}
