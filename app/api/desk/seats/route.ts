import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { companiesListedForViewer } from "@/lib/companies";
import {
  addCompany,
  assignedCompanyForUser,
  isKnownCompany,
  listCompanies,
  peekAssignedCompanyForUser,
  peekCompanies,
  setAssignedCompany,
} from "@/lib/companies-store";
import { loadPositionDesk } from "@/lib/desk-positions-server";
import { canAddUsers, canManageUsers, hasWorkingDesk, isOwner } from "@/lib/desk-role";
import { seatsVisibleTo } from "@/lib/desk-people";
import { cookieValue } from "@/lib/http";
import { canCreateSeatAs } from "@/lib/org-positions";
import { mergeJobRoleCatalog, parseJobRoleLabel, resolveJobRole } from "@/lib/job-roles";
import { getOwnerSettings, setOwnerSettings } from "@/lib/owner-settings-store";
import {
  createSeat,
  findUserByEmail,
  flushSeatVault,
  hydrateSeatStore,
  issueRecoveryPassword,
  issueSeatPassword,
  listSeatRows,
  setExtraSeatJobTitle,
} from "@/lib/users";
import { setDoors } from "@/lib/privileges-store";
import { applyVaultAclForSeat } from "@/lib/vault-acl-apply";
import { normalizeSeatDoors } from "@/lib/vault-acl";

export const dynamic = "force-dynamic";

async function companiesForActor(user: { email: string; role?: string }) {
  return companiesListedForViewer(user, await listCompanies(), await assignedCompanyForUser(user));
}

function peekCompaniesForActor(user: { email: string; role?: string }) {
  return companiesListedForViewer(user, peekCompanies(), peekAssignedCompanyForUser(user));
}

async function actorFor(user: { email: string; role: string; privileges?: string[] }) {
  const desk = await loadPositionDesk(user);
  return desk.actor;
}

async function seatsWithJobTitles(user: { email: string; role?: string; privileges?: string[] }) {
  const settings = await getOwnerSettings();
  const seats = seatsVisibleTo(user, await listSeatRows({ hydrate: false })).map((row) => ({
    ...row,
    jobTitle: resolveJobRole(row, settings.seatJobTitles),
  }));
  return { seats, jobRoles: mergeJobRoleCatalog(settings.jobRoles), settings };
}

export async function GET(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!hasWorkingDesk(user) && !canManageUsers(user) && !canAddUsers(user)) {
    return NextResponse.json({ error: "Build desk only." }, { status: 403 });
  }
  await hydrateSeatStore();
  const settings = await getOwnerSettings();
  const seats = seatsVisibleTo(user, await listSeatRows()).map((row) => ({
    ...row,
    jobTitle: resolveJobRole(row, settings.seatJobTitles),
  }));
  return NextResponse.json({
    seats,
    jobRoles: mergeJobRoleCatalog(settings.jobRoles),
    companies: await companiesForActor(user),
    actor: await actorFor(user),
    note: "Owner-created seats. Users never see this list. No invite is sent.",
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
    jobTitle?: string;
    doors?: unknown;
  };

  if (typeof body.addCompany === "string") {
    if (!isOwner(user)) return NextResponse.json({ error: "Owner issues one-time passwords." }, { status: 403 });
    const result = await addCompany(body.addCompany);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({
      ok: true,
      company: result.company,
      seats: await listSeatRows(),
      companies: await companiesForActor(user),
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
      jobTitle: body.jobTitle,
    });
    if ("error" in created) {
      const status = created.error.startsWith("Password was not saved") ? 503 : 400;
      return NextResponse.json({ error: created.error, vaultPersisted: status === 503 ? false : undefined }, { status });
    }
    if (created.user.jobTitle) {
      try {
        await setOwnerSettings({ seatJobTitles: { [created.user.email]: created.user.jobTitle } });
      } catch {
        // Seat landed. Title stays on the extra until settings retry.
      }
    }
    await flushSeatVault();
    const doors = isOwner(user) ? normalizeSeatDoors(body.doors) : [];
    let shared: Awaited<ReturnType<typeof applyVaultAclForSeat>>["shared"] = [];
    try {
      if (doors.length) await setDoors(created.user.email, doors);
      shared = (await applyVaultAclForSeat(created.user.email, doors, created.user)).shared;
    } catch {
      shared = [];
    }
    const titled = await seatsWithJobTitles(user);
    return NextResponse.json({
      ok: true,
      user: created.user,
      seats: titled.seats,
      jobRoles: titled.jobRoles,
      companies: peekCompaniesForActor(user),
      actor: desk.actor,
      doors,
      shared,
      note: "Login created on this desk. Don’t send. First sign-in must change the password.",
    });
  }

  if (!isOwner(user)) return NextResponse.json({ error: "Owner issues one-time passwords." }, { status: 403 });

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  await hydrateSeatStore();

  if (typeof body.jobTitle === "string" && email && !password && body.recover !== true && typeof body.companyId !== "string") {
    const parsed = parseJobRoleLabel(body.jobTitle);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const target = findUserByEmail(email);
    if (!target || target.role === "owner" || target.role === "operator") {
      return NextResponse.json({ error: "Pick a user seat on this desk." }, { status: 400 });
    }
    try {
      await setOwnerSettings({ seatJobTitles: { [email]: parsed.label } });
      await setExtraSeatJobTitle(email, parsed.label);
    } catch {
      return NextResponse.json(
        { error: "Could not save that assignment. Try again.", vaultPersisted: false },
        { status: 503 },
      );
    }
    const titled = await seatsWithJobTitles(user);
    return NextResponse.json({
      ok: true,
      seats: titled.seats,
      jobRoles: titled.jobRoles,
      companies: peekCompaniesForActor(user),
      note: "Role saved on this desk.",
    });
  }

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
      companies: peekCompaniesForActor(user),
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
      companies: peekCompaniesForActor(user),
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
    companies: peekCompaniesForActor(user),
    note: "Password issued on this desk. Don’t send. Never logged.",
  });
}
