import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { cookieValue } from "@/lib/http";
import { hasBuildDesk } from "@/lib/desk-role";
import { scopedDeskUser } from "@/lib/desk-scope-server";
import { canUseSuggestionBox } from "@/lib/inbox-circle";
import { TICKETS_VAULT_WRITE_ERROR, ticketsVaultLeaks } from "@/lib/ticket-cache";
import { emailOwnerTicket } from "@/lib/ticket-mail";
import {
  addStoredTicket,
  listStoredTickets,
  patchStoredTicket,
  removeStoredDoneTickets,
  removeStoredTicket,
  ticketStoreKind,
  ticketsStored,
} from "@/lib/ticket-store";
import { isTicketKind, makeTicket } from "@/lib/tickets";

export const dynamic = "force-dynamic";

function payload(body: Record<string, unknown>, status = 200) {
  if (ticketsVaultLeaks(body)) {
    return NextResponse.json({ error: TICKETS_VAULT_WRITE_ERROR }, { status: 503 });
  }
  return NextResponse.json(body, { status });
}

async function scoped(user: { role: string; email: string }) {
  return hasBuildDesk(user) ? listStoredTickets() : listStoredTickets(user.email);
}

function storeBody(extra: Record<string, unknown> = {}) {
  const store = ticketStoreKind();
  return { ...extra, store, stored: ticketsStored(store) };
}

export async function GET(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  try {
    return payload(storeBody({ tickets: await scoped(await scopedDeskUser(user, request)) }));
  } catch {
    return payload({ error: TICKETS_VAULT_WRITE_ERROR, tickets: [], store: ticketStoreKind(), stored: false }, 503);
  }
}

export async function POST(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!canUseSuggestionBox(user) && !hasBuildDesk(user)) {
    return NextResponse.json({ error: "Suggestion Box is not on this desk." }, { status: 403 });
  }

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

  try {
    const ticket = await addStoredTicket(
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

    return payload(
      storeBody({
        ticket,
        tickets: await scoped(user),
        emailed,
      }),
    );
  } catch {
    return payload({ error: TICKETS_VAULT_WRITE_ERROR, store: ticketStoreKind(), stored: false }, 503);
  }
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
  try {
    const ticket = await patchStoredTicket(body.id, {
      ...(typeof body.done === "boolean" ? { done: body.done } : {}),
      ...(body.notifyFix === true || body.notifyFix === false || body.notifyFix === null
        ? { notifyFix: body.notifyFix }
        : {}),
    });
    if (!ticket) return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
    return payload(storeBody({ tickets: await listStoredTickets() }));
  } catch {
    return payload({ error: TICKETS_VAULT_WRITE_ERROR, store: ticketStoreKind(), stored: false }, 503);
  }
}

export async function DELETE(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!hasBuildDesk(user)) {
    return NextResponse.json({ error: "Testers cannot delete tickets." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { id?: string; done?: boolean };
  try {
    if (body.done) await removeStoredDoneTickets();
    else if (body.id) await removeStoredTicket(body.id);
    else return NextResponse.json({ error: "Missing ticket." }, { status: 400 });
    return payload(storeBody({ tickets: await listStoredTickets() }));
  } catch {
    return payload({ error: TICKETS_VAULT_WRITE_ERROR, store: ticketStoreKind(), stored: false }, 503);
  }
}
