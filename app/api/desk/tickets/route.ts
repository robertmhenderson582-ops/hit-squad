import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { cookieValue } from "@/lib/http";
import { hasBuildDesk } from "@/lib/desk-role";
import {
  addTicket,
  isTicketKind,
  listTickets,
  patchTicket,
  removeDoneTickets,
  removeTicket,
} from "@/lib/tickets";

export const dynamic = "force-dynamic";

function scoped(user: { role: string; email: string }) {
  return hasBuildDesk(user) ? listTickets() : listTickets(user.email);
}

export async function GET(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  return NextResponse.json({ tickets: scoped(user) });
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

  addTicket({
    kind: body.kind,
    note: typeof body.note === "string" ? body.note : "",
    capture: typeof body.capture === "string" && body.capture.startsWith("data:") ? body.capture : null,
    later: Boolean(body.later),
    who: user.email,
  });

  return NextResponse.json({ tickets: scoped(user) });
}

export async function PATCH(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!hasBuildDesk(user)) {
    return NextResponse.json({ error: "Testers cannot change tickets." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    id?: string;
    done?: boolean;
    notifyFix?: boolean | null;
  };
  if (!body.id) return NextResponse.json({ error: "Missing ticket." }, { status: 400 });
  const ticket = patchTicket(body.id, {
    ...(typeof body.done === "boolean" ? { done: body.done } : {}),
    ...(body.notifyFix === true || body.notifyFix === false || body.notifyFix === null
      ? { notifyFix: body.notifyFix }
      : {}),
  });
  if (!ticket) return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
  return NextResponse.json({ tickets: listTickets() });
}

export async function DELETE(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!hasBuildDesk(user)) {
    return NextResponse.json({ error: "Testers cannot delete tickets." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { id?: string; done?: boolean };
  if (body.done) removeDoneTickets();
  else if (body.id) removeTicket(body.id);
  else return NextResponse.json({ error: "Missing ticket." }, { status: 400 });
  return NextResponse.json({ tickets: listTickets() });
}
