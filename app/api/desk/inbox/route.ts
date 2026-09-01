import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { cookieValue } from "@/lib/http";
import { scopedDeskUser } from "@/lib/desk-scope-server";
import { canUseInbox, inboxCircleById, inboxCirclePerson } from "@/lib/inbox-circle";
import {
  hideInboxFor,
  inboxPeopleFor,
  inboxStoreKind,
  listInboxFor,
  markInboxThreadRead,
  postInboxMessage,
} from "@/lib/inbox-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await readSession(cookieValue(request));
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const user = await scopedDeskUser(session, request);
  if (!canUseInbox(user)) {
    return NextResponse.json({ error: "Inbox is those six only." }, { status: 403 });
  }
  return NextResponse.json({
    threads: await listInboxFor(user.email),
    contacts: inboxPeopleFor(user.email),
    store: inboxStoreKind(),
  });
}

export async function POST(request: Request) {
  const session = await readSession(cookieValue(request));
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const user = await scopedDeskUser(session, request);
  if (!canUseInbox(user)) {
    return NextResponse.json({ error: "Inbox is those six only." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    toEmail?: string;
    personId?: string;
    text?: string;
    photo?: string | null;
    messageId?: string;
    readPersonId?: string;
    hideMessageId?: string;
    hidePersonId?: string;
    hidePersonIds?: string[];
    emptyInbox?: boolean;
  };

  if (typeof body.readPersonId === "string" && body.readPersonId.trim()) {
    return NextResponse.json({
      threads: await markInboxThreadRead(user.email, body.readPersonId.trim()),
      contacts: inboxPeopleFor(user.email),
      store: inboxStoreKind(),
    });
  }

  if (
    typeof body.hideMessageId === "string" ||
    typeof body.hidePersonId === "string" ||
    Array.isArray(body.hidePersonIds) ||
    body.emptyInbox === true
  ) {
    return NextResponse.json({
      threads: await hideInboxFor(user.email, {
        messageId: body.hideMessageId,
        personId: body.hidePersonId,
        personIds: body.hidePersonIds,
        empty: body.emptyInbox === true,
      }),
      contacts: inboxPeopleFor(user.email),
      store: inboxStoreKind(),
    });
  }

  const recipient =
    inboxCirclePerson(typeof body.toEmail === "string" ? body.toEmail : "") ||
    inboxCircleById(typeof body.personId === "string" ? body.personId : "");
  if (!recipient) {
    return NextResponse.json({ error: "Pick a person." }, { status: 400 });
  }

  const posted = await postInboxMessage({
    fromEmail: user.email,
    fromName: user.name,
    toEmail: recipient.email,
    text: body.text,
    photo: body.photo,
    id: body.messageId,
  });
  if (!posted.ok) return NextResponse.json({ error: posted.error }, { status: posted.status });
  return NextResponse.json({
    threads: posted.threads,
    contacts: inboxPeopleFor(user.email),
    store: inboxStoreKind(),
  });
}
