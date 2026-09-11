import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { isOwner } from "@/lib/desk-role";
import { cookieValue } from "@/lib/http";
import {
  INVITE_FORBIDDEN_DOMAIN,
  INVITE_SEND_UNCONFIRMED,
  inviteEmailAllowed,
  sendSeatInvite,
} from "@/lib/invite-mail";
import { doorsFor, setDoors } from "@/lib/privileges-store";
import { applyVaultAclForSeat } from "@/lib/vault-acl-apply";
import { normalizeSeatDoors } from "@/lib/vault-acl";
import { findUserByEmail, hydrateSeatStore } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!isOwner(user)) return NextResponse.json({ error: "Owner desk only." }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
    name?: string;
    password?: string;
    doors?: unknown;
    send?: unknown;
  };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const doors = normalizeSeatDoors(body.doors);
  if (!email.includes("@")) return NextResponse.json({ error: "Pick a user." }, { status: 400 });
  if (!inviteEmailAllowed(email)) {
    return NextResponse.json({ error: INVITE_FORBIDDEN_DOMAIN, sent: false }, { status: 400 });
  }
  await hydrateSeatStore();
  const seat = findUserByEmail(email);
  if (doors.length) await setDoors(email, doors);
  const shared = await applyVaultAclForSeat(email, doors.length ? doors : await doorsFor(email), seat);
  if (body.send !== true) {
    return NextResponse.json({
      ok: true,
      sent: false,
      email,
      shared: shared.shared,
      note: INVITE_SEND_UNCONFIRMED,
    });
  }
  const result = await sendSeatInvite(
    {
      to: email,
      name: name || seat?.name || email,
      tempPassword: password,
      doors: doors.length ? doors : await doorsFor(email),
    },
    { send: true },
  );
  return NextResponse.json({
    ok: result.sent,
    sent: result.sent,
    email,
    from: result.mail.from,
    shared: shared.shared,
    error: result.error,
    note: result.sent
      ? "Invite sent from Novus Gmail after Owner clicked Send."
      : result.error || INVITE_SEND_UNCONFIRMED,
  }, { status: result.sent ? 200 : 400 });
}
