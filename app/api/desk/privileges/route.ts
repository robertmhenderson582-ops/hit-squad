import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { isOwner } from "@/lib/desk-role";
import { cookieValue } from "@/lib/http";
import {
  OWNER_ONLY_PRIVILEGES,
  PRESIDENT_SHARED,
  PRIVILEGE_COPY,
  isPrivilegeId,
} from "@/lib/privileges";
import { grantPrivilege, listPrivilegeGrants, revokePrivilege } from "@/lib/privileges-store";
import { hydrateSeatStore, listSeatRows } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!isOwner(user)) return NextResponse.json({ error: "Owner desk only." }, { status: 403 });
  await hydrateSeatStore();
  return NextResponse.json({
    privileges: OWNER_ONLY_PRIVILEGES.map((id) => ({ id, ...PRIVILEGE_COPY[id] })),
    shared: PRESIDENT_SHARED,
    grants: await listPrivilegeGrants(),
    seats: (await listSeatRows()).filter((row) => row.role !== "owner" && row.role !== "operator"),
    note: "Pick a user. Grant or revoke owner-only items. President is not seeded — add the login when the email is known.",
  });
}

export async function POST(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!isOwner(user)) return NextResponse.json({ error: "Owner desk only." }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
    privilege?: string;
    grant?: boolean;
  };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email.includes("@")) return NextResponse.json({ error: "Pick a user." }, { status: 400 });
  if (!isPrivilegeId(body.privilege)) return NextResponse.json({ error: "Pick a privilege." }, { status: 400 });

  const next =
    body.grant === false
      ? await revokePrivilege(email, body.privilege)
      : await grantPrivilege(email, body.privilege);
  await hydrateSeatStore();
  return NextResponse.json({
    ok: true,
    email,
    privileges: next,
    grants: await listPrivilegeGrants(),
    seats: (await listSeatRows()).filter((row) => row.role !== "owner" && row.role !== "operator"),
  });
}
