import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { hasBuildDesk, isOwner, NOVUS_EMAIL } from "@/lib/desk-role";
import { cookieValue } from "@/lib/http";
import { addRosterEntry, clearRoster, EMPTY_MODULES, listRoster, PERMISSIONS, removeRosterEntry } from "@/lib/roster";
import type { RosterEntry, RosterPermission } from "@/lib/types";

export const dynamic = "force-dynamic";

async function requireOwner(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return { user: null, response: NextResponse.json({ error: "Not signed in." }, { status: 401 }) };
  if (!isOwner(user)) {
    return { user: null, response: NextResponse.json({ error: "Owner desk only." }, { status: 403 }) };
  }
  return { user, response: null };
}

export async function GET(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!hasBuildDesk(user)) return NextResponse.json({ error: "Build desk only." }, { status: 403 });
  return NextResponse.json({
    permissions: PERMISSIONS,
    roster: listRoster(),
    note: "Visual tester roster only. It does not create a login session. Novus is never listed.",
  });
}

export async function POST(request: Request) {
  const gate = await requireOwner(request);
  if (gate.response) return gate.response;

  let body: {
    name?: string;
    username?: string;
    email?: string;
    permission?: RosterPermission;
    expires?: string;
    reset?: boolean;
    removeId?: string;
    modules?: RosterEntry["modules"];
    estimate?: boolean;
    rateBuilder?: boolean;
    passwordSet?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send JSON." }, { status: 400 });
  }

  if (body.reset) {
    clearRoster();
    return NextResponse.json({ roster: listRoster() });
  }
  if (body.removeId) {
    removeRosterEntry(body.removeId);
    return NextResponse.json({ roster: listRoster() });
  }

  if (!body.name || !body.email || !body.permission) {
    return NextResponse.json({ error: "Name, email, and permission are required." }, { status: 400 });
  }
  if (body.email.trim().toLowerCase() === NOVUS_EMAIL) {
    return NextResponse.json({ error: "Novus is not a tester and stays off this roster." }, { status: 400 });
  }

  const entry = addRosterEntry({
    name: body.name,
    username: body.username || body.email.split("@")[0],
    email: body.email,
    permission: body.permission,
    expires: body.expires || "",
    modules: body.modules ?? EMPTY_MODULES,
    estimate: body.estimate ?? true,
    rateBuilder: body.rateBuilder ?? body.permission !== "Look & feel",
    passwordSet: body.passwordSet ?? false,
  });
  return NextResponse.json({ entry, roster: listRoster() });
}
