import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { cookieValue } from "@/lib/http";
import { hasBuildDesk } from "@/lib/desk-role";
import { deskUserFromRequest } from "@/lib/desk-scope";
import { emailOwnerTicket } from "@/lib/ticket-mail";
import {
  addStoredTicket,
  listStoredTickets,
  patchStoredTicket,
  removeStoredDoneTickets,
  removeStoredTicket,
  ticketStoreKind,
} from "@/lib/ticket-store";
import { isTicketKind, makeTicket } from "@/lib/tickets";

export const dynamic = "force-dynamic";

function scoped(user: { role: string; email: string }) {
  return hasBuildDesk(user) ? listStoredTickets() : listStoredTickets(user.email);
}

export async function GET(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  return NextResponse.json({ tickets: scoped(deskUserFromRequest(user, request)), store: ticketStoreKind() });
}

export async function POST(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    id?: string;
    kind?: string;
    note?: string;
    capture?: string | null;
    later?: boolean;
  };

  if (!isTicketKind(body.kind)) {
    return NextResponse.json({ error: "Pick a ticket kind." }, { status: 400 });
  }

  const ticket = addStoredTicket(
    makeTicket({
      id: typeof body.id === "string" ? body.id : undefined,
      kind: body.kind,
      note: typeof body.note === "string" ? body.note : "",
      capture: typeof body.capture === "string" && body.capture.startsWith("data:") ? body.capture : null,
      later: Boolean(body.later),
      who: user.email,
    }),
  );

  const emailed = await emailOwnerTicket(ticket);

  return NextResponse.json({
    ticket,
    tickets: scoped(user),
    emailed,
    store: ticketStoreKind(),
  });
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
  const ticket = patchStoredTicket(body.id, {
    ...(typeof body.done === "boolean" ? { done: body.done } : {}),
    ...(body.notifyFix === true || body.notifyFix === false || body.notifyFix === null
      ? { notifyFix: body.notifyFix }
      : {}),
  });
  if (!ticket) return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
  return NextResponse.json({ tickets: listStoredTickets(), store: ticketStoreKind() });
}

export async function DELETE(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!hasBuildDesk(user)) {
    return NextResponse.json({ error: "Testers cannot delete tickets." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { id?: string; done?: boolean };
  if (body.done) removeStoredDoneTickets();
  else if (body.id) removeStoredTicket(body.id);
  else return NextResponse.json({ error: "Missing ticket." }, { status: 400 });
  return NextResponse.json({ tickets: listStoredTickets(), store: ticketStoreKind() });
}
