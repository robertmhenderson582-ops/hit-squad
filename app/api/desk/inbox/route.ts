import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { DRIVE_WRITE_ERROR } from "@/lib/drive-data";
import { cookieValue } from "@/lib/http";
import { scopedDeskUser } from "@/lib/desk-scope-server";
import { canUseInbox, inboxCircleById, inboxCirclePerson, INBOX_CIRCLE_COPY } from "@/lib/inbox-circle";
import {
  hideInboxFor,
  inboxHidesFor,
  inboxPeopleFor,
  inboxStoreKind,
  listInboxFor,
  markInboxThreadRead,
  postInboxMessage,
} from "@/lib/inbox-store";

export const dynamic = "force-dynamic";

function inboxResponse(email: string, threads: Awaited<ReturnType<typeof listInboxFor>>) {
  const hides = inboxHidesFor(email);
  return NextResponse.json({
    threads,
    contacts: inboxPeopleFor(email),
    store: inboxStoreKind(),
    hiddenMessageIds: hides.messageIds,
    hiddenPersonIds: hides.personIds,
  });
}

export async function GET(request: Request) {
  const session = await readSession(cookieValue(request));
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const user = await scopedDeskUser(session, request);
  if (!canUseInbox(user)) {
    return NextResponse.json({ error: INBOX_CIRCLE_COPY }, { status: 403 });
  }
  return inboxResponse(user.email, await listInboxFor(user.email));
}

export async function POST(request: Request) {
  const session = await readSession(cookieValue(request));
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const user = await scopedDeskUser(session, request);
  if (!canUseInbox(user)) {
    return NextResponse.json({ error: INBOX_CIRCLE_COPY }, { status: 403 });
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

  try {
    if (typeof body.readPersonId === "string" && body.readPersonId.trim()) {
      return inboxResponse(user.email, await markInboxThreadRead(user.email, body.readPersonId.trim()));
    }

    if (
      typeof body.hideMessageId === "string" ||
      typeof body.hidePersonId === "string" ||
      Array.isArray(body.hidePersonIds) ||
      body.emptyInbox === true
    ) {
      return inboxResponse(
        user.email,
        await hideInboxFor(user.email, {
          messageId: body.hideMessageId,
          personId: body.hidePersonId,
          personIds: body.hidePersonIds,
          empty: body.emptyInbox === true,
        }),
      );
    }
  } catch {
    return NextResponse.json({ error: DRIVE_WRITE_ERROR }, { status: 503 });
  }

  const recipient =
    inboxCirclePerson(typeof body.toEmail === "string" ? body.toEmail : "") ||
    inboxCircleById(typeof body.personId === "string" ? body.personId : "");
  if (!recipient) {
    return NextResponse.json({ error: "Pick a person." }, { status: 400 });
  }

  try {
    const posted = await postInboxMessage({
      fromEmail: user.email,
      fromName: user.name,
      toEmail: recipient.email,
      text: body.text,
      photo: body.photo,
      id: body.messageId,
    });
    if (!posted.ok) return NextResponse.json({ error: posted.error }, { status: posted.status });
    return inboxResponse(user.email, posted.threads);
  } catch {
    return NextResponse.json({ error: DRIVE_WRITE_ERROR }, { status: 503 });
  }
}
