import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { cookieValue } from "@/lib/http";
import { addTicket, isTicketKind, listTickets } from "@/lib/tickets";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  return NextResponse.json({
    tickets: user.role === "owner" ? listTickets() : listTickets(user.email),
  });
}

export async function POST(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    kind?: string;
    note?: string;
    capture?: string | null;
    later?: boolean;
  };

  if (!isTicketKind(body.kind)) {
    return NextResponse.json({ error: "Pick a ticket kind." }, { status: 400 });
  }

  const ticket = addTicket({
    kind: body.kind,
    note: typeof body.note === "string" ? body.note : "",
    capture: typeof body.capture === "string" && body.capture.startsWith("data:") ? body.capture : null,
    later: Boolean(body.later),
    who: user.email,
  });

  return NextResponse.json({ ticket, tickets: user.role === "owner" ? listTickets() : listTickets(user.email) });
}
