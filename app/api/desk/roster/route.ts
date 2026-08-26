import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { hasBuildDesk, isOwner } from "@/lib/desk-role";
import { cookieValue } from "@/lib/http";
import { PERMISSIONS } from "@/lib/roster";
import { addTesterSeatWithInvite, listAddedRoster } from "@/lib/users";
import type { RosterPermission } from "@/lib/types";

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
    permissions: PERMISSIONS.filter((item) => item !== "Owner"),
    roster: listAddedRoster(),
    note: "Added testers. Each row is a real login. Novus is never listed.",
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
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send JSON." }, { status: 400 });
  }

  if (body.reset || body.removeId) {
    return NextResponse.json(
      { error: "Added testers are real logins and are not cleared from this form." },
      { status: 400 },
    );
  }

  const result = await addTesterSeatWithInvite({
    name: body.name,
    email: body.email,
    permission: body.permission,
    username: body.username,
    expires: body.expires,
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({
    entry: listAddedRoster().find((row) => row.email === result.user.email),
    roster: listAddedRoster(),
    inviteSent: result.inviteSent,
    inviteText: result.inviteText,
    note: result.inviteSent
      ? "Login created. Invite sent. They create their own sign-in on first visit."
      : "Login created. Invite was not sent (mail is not configured). Copy the invite below.",
  });
}
