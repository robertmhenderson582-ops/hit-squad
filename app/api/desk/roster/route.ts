import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { cookieValue } from "@/lib/http";
import { listRoster, PERMISSIONS, resetAllInvites, resetInvite } from "@/lib/roster";
import { findSeatByEmail } from "@/lib/seats";

export const dynamic = "force-dynamic";

async function requireOwner(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return { user: null, response: NextResponse.json({ error: "Not signed in." }, { status: 401 }) };
  if (user.role !== "owner") {
    return { user: null, response: NextResponse.json({ error: "Owner desk only." }, { status: 403 }) };
  }
  return { user, response: null };
}

export async function GET(request: Request) {
  const gate = await requireOwner(request);
  if (gate.response) return gate.response;
  return NextResponse.json({
    permissions: PERMISSIONS,
    roster: await listRoster(),
    note: "Owner book only. Testers never see this list. Seats do not use old Grok passwords.",
  });
}

export async function POST(request: Request) {
  const gate = await requireOwner(request);
  if (gate.response) return gate.response;

  let body: { email?: string; resetInvite?: boolean; resetAllInvites?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send JSON." }, { status: 400 });
  }

  if (body.resetAllInvites) {
    await resetAllInvites();
    return NextResponse.json({ roster: await listRoster() });
  }

  if (body.resetInvite && body.email) {
    if (!findSeatByEmail(body.email)) {
      return NextResponse.json({ error: "That email is not a field-trial seat." }, { status: 400 });
    }
    await resetInvite(body.email);
    return NextResponse.json({ roster: await listRoster() });
  }

  return NextResponse.json(
    { error: "Field-trial seats are locked to the seven invitees. Reset an invite instead." },
    { status: 400 },
  );
}
