import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { hasBuildDesk, isOwner } from "@/lib/desk-role";
import { cookieValue } from "@/lib/http";
import {
  addTesterSeatWithInvite,
  findUserByEmail,
  issueSeatPassword,
  listAddedRoster,
  listSeatRows,
  resendTesterInvite,
} from "@/lib/users";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!hasBuildDesk(user)) return NextResponse.json({ error: "Build desk only." }, { status: 403 });
  return NextResponse.json({
    seats: listSeatRows(),
    roster: listAddedRoster(),
    note: "Owner-created seats. Testers never see this list. Add user sends the first-visit invite.",
  });
}

export async function POST(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!isOwner(user)) return NextResponse.json({ error: "Owner desk only." }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
    name?: string;
    permission?: string;
    username?: string;
    expires?: string;
    resendInvite?: boolean;
  };

  if (body.resendInvite) {
    const result = await resendTesterInvite(typeof body.email === "string" ? body.email : "");
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({
      ok: true,
      seats: listSeatRows(),
      roster: listAddedRoster(),
      inviteSent: result.inviteSent,
      inviteText: result.inviteText,
      note: result.inviteSent
        ? "Invite sent again. No password is included."
        : "Invite was not sent (mail is not configured). Copy the invite below.",
    });
  }

  if (body.name && body.email && body.permission) {
    const result = await addTesterSeatWithInvite({
      name: body.name,
      email: body.email,
      permission: body.permission,
      username: body.username,
      expires: body.expires,
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({
      ok: true,
      seats: listSeatRows(),
      roster: listAddedRoster(),
      inviteSent: result.inviteSent,
      inviteText: result.inviteText,
      note: result.inviteSent
        ? "Login created. Invite sent. They create their own sign-in on first visit."
        : "Login created. Invite was not sent (mail is not configured). Copy the invite below.",
    });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const target = findUserByEmail(email);
  if (!target || target.role === "owner") {
    return NextResponse.json({ error: "Pick a non-owner seat." }, { status: 400 });
  }
  const result = issueSeatPassword(email, password);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({
    ok: true,
    seats: listSeatRows(),
    roster: listAddedRoster(),
    note: "Password issued on this desk. Don’t send. Never logged.",
  });
}
