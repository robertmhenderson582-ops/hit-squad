import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { DRIVE_WRITE_ERROR } from "@/lib/drive-data";
import { cookieValue } from "@/lib/http";
import { scopedDeskUser } from "@/lib/desk-scope-server";
import { canUseInbox, inboxCircleById, inboxCirclePerson, inboxContactsFor, inboxPeerFor } from "@/lib/inbox-circle";
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

function inboxResponse(
  user: { email: string; role?: string; privileges?: readonly string[] },
  threads: Awaited<ReturnType<typeof listInboxFor>>,
) {
  const hides = inboxHidesFor(user.email);
  return NextResponse.json({
    threads,
    contacts: inboxPeopleFor(user.email, user),
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
    return NextResponse.json({ error: "Inbox is those six only." }, { status: 403 });
  }
  return inboxResponse(user, await listInboxFor(user.email, user));
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

  try {
    if (typeof body.readPersonId === "string" && body.readPersonId.trim()) {
      return inboxResponse(user, await markInboxThreadRead(user.email, body.readPersonId.trim(), user));
    }

    if (
      typeof body.hideMessageId === "string" ||
      typeof body.hidePersonId === "string" ||
      Array.isArray(body.hidePersonIds) ||
      body.emptyInbox === true
    ) {
      return inboxResponse(
        user,
        await hideInboxFor(
          user.email,
          {
            messageId: body.hideMessageId,
            personId: body.hidePersonId,
            personIds: body.hidePersonIds,
            empty: body.emptyInbox === true,
          },
          user,
        ),
      );
    }
  } catch {
    return NextResponse.json({ error: DRIVE_WRITE_ERROR }, { status: 503 });
  }

  const wantedEmail = typeof body.toEmail === "string" ? body.toEmail : "";
  const wantedId = typeof body.personId === "string" ? body.personId : "";
  const recipient =
    inboxContactsFor(user.email, user).find(
      (row) => row.email === wantedEmail.trim().toLowerCase() || row.id === wantedId,
    ) ||
    inboxCirclePerson(wantedEmail) ||
    inboxCircleById(wantedId) ||
    inboxPeerFor(wantedEmail);
  if (!recipient) {
    return NextResponse.json({ error: "Pick a person." }, { status: 400 });
  }
  if (!inboxContactsFor(user.email, user).some((row) => row.email === recipient.email)) {
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
      viewer: user,
    });
    if (!posted.ok) return NextResponse.json({ error: posted.error }, { status: posted.status });
    return inboxResponse(user, posted.threads);
  } catch {
    return NextResponse.json({ error: DRIVE_WRITE_ERROR }, { status: 503 });
  }
}
