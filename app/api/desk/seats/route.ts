import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { addCompany, isKnownCompany, listCompanies, peekCompanies, setAssignedCompany } from "@/lib/companies-store";
import { loadPositionDesk } from "@/lib/desk-positions-server";
import { canAddUsers, canManageUsers, hasWorkingDesk, isOwner } from "@/lib/desk-role";
import { seatsVisibleTo } from "@/lib/desk-people";
import { cookieValue } from "@/lib/http";
import { canCreateSeatAs } from "@/lib/org-positions";
import {
  createSeat,
  findUserByEmail,
  flushSeatVault,
  hydrateSeatStore,
  issueRecoveryPassword,
  issueSeatPassword,
  listSeatRows,
} from "@/lib/users";

export const dynamic = "force-dynamic";

async function actorFor(user: { email: string; role: string; privileges?: string[] }) {
  const desk = await loadPositionDesk(user);
  return desk.actor;
}

export async function GET(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!hasWorkingDesk(user) && !canManageUsers(user) && !canAddUsers(user)) {
    return NextResponse.json({ error: "Build desk only." }, { status: 403 });
  }
  await hydrateSeatStore();
  return NextResponse.json({
    seats: seatsVisibleTo(user, await listSeatRows()),
    companies: await listCompanies(),
    actor: await actorFor(user),
    note: "Owner-created seats. Testers never see this list. No invite is sent.",
  });
}

export async function POST(request: Request) {
  try {
    return await postSeats(request);
  } catch {
    return NextResponse.json(
      { error: "Could not save that seat change. Try again.", vaultPersisted: false },
      { status: 503 },
    );
  }
}

async function postSeats(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    email?: string;
    password?: string;
    companyId?: string;
    addCompany?: string;
    recover?: boolean;
    role?: string;
  };

  if (typeof body.addCompany === "string") {
    if (!isOwner(user)) return NextResponse.json({ error: "Owner issues one-time passwords." }, { status: 403 });
    const result = await addCompany(body.addCompany);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({
      ok: true,
      company: result.company,
      seats: await listSeatRows(),
      companies: await listCompanies(),
      actor: await actorFor(user),
      note: "Company added on this desk.",
    });
  }

  if (typeof body.name === "string" && body.name.trim()) {
    if (!canAddUsers(user)) return NextResponse.json({ error: "That permission is above your seat." }, { status: 403 });
    const desk = await loadPositionDesk(user);
    const allowed = canCreateSeatAs(user, { role: body.role, companyId: body.companyId }, desk.holds, desk.catalog, desk.actor.addableCompanyIds);
    if ("error" in allowed) return NextResponse.json({ error: allowed.error }, { status: 403 });
    const created = await createSeat({
      name: body.name,
      email: body.email,
      password: body.password,
      companyId: body.companyId,
      role: body.role === "president" && desk.actor.addableRoles.includes("president") ? "president" : "tester",
    });
    if ("error" in created) {
      const status = created.error.startsWith("Password was not saved") ? 503 : 400;
      return NextResponse.json({ error: created.error, vaultPersisted: status === 503 ? false : undefined }, { status });
    }
    await flushSeatVault();
    return NextResponse.json({
      ok: true,
      user: created.user,
      seats: seatsVisibleTo(user, await listSeatRows({ hydrate: false })),
      companies: peekCompanies(),
      actor: desk.actor,
      note: "Login created on this desk. Don’t send. First sign-in must change the password.",
    });
  }

  if (!isOwner(user)) return NextResponse.json({ error: "Owner issues one-time passwords." }, { status: 403 });

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  await hydrateSeatStore();

  if (body.recover === true) {
    const issued = await issueRecoveryPassword(email);
    if ("error" in issued) {
      const status = issued.error.includes("not saved") ? 503 : 400;
      return NextResponse.json({ error: issued.error, vaultPersisted: status === 503 ? false : undefined }, { status });
    }
    return NextResponse.json({
      ok: true,
      email: issued.email,
      password: issued.password,
      seats: seatsVisibleTo(user, await listSeatRows({ hydrate: false })),
      companies: peekCompanies(),
      note: "One-time recovery issued. Copy it now. It is not emailed and not logged.",
    });
  }

  const target = findUserByEmail(email);
  if (!target || target.role === "owner") {
    return NextResponse.json({ error: "Pick a non-owner seat on this desk." }, { status: 400 });
  }

  if (typeof body.companyId === "string") {
    if (!(await isKnownCompany(body.companyId))) {
      return NextResponse.json({ error: "Pick a company on this desk." }, { status: 400 });
    }
    try {
      await setAssignedCompany(email, body.companyId);
    } catch {
      return NextResponse.json(
        { error: "Could not save that assignment. Try again.", vaultPersisted: false },
        { status: 503 },
      );
    }
    return NextResponse.json({
      ok: true,
      seats: seatsVisibleTo(user, await listSeatRows({ hydrate: false })),
      companies: peekCompanies(),
      note: "Company assignment saved on this desk.",
    });
  }

  const result = await issueSeatPassword(email, password);
  if ("error" in result) {
    const status = result.error.startsWith("Password was not saved") ? 503 : 400;
    return NextResponse.json({ error: result.error, vaultPersisted: status === 503 ? false : undefined }, { status });
  }
  return NextResponse.json({
    ok: true,
    seats: seatsVisibleTo(user, await listSeatRows({ hydrate: false })),
    companies: peekCompanies(),
    note: "Password issued on this desk. Don’t send. Never logged.",
  });
}
