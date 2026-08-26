import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { cookieValue } from "@/lib/http";
import {
  clearInboxThread,
  emptyInboxFor,
  hideInboxMessage,
  inboxContactsFor,
  inboxStoreKind,
  markInboxRead,
  postInboxMessage,
  threadsForViewer,
} from "@/lib/inbox-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const viewer = { email: user.email, name: user.name, role: user.role };
  return NextResponse.json({
    threads: threadsForViewer(viewer),
    contacts: inboxContactsFor(viewer),
    store: inboxStoreKind(),
  });
}

export async function POST(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const viewer = { email: user.email, name: user.name, role: user.role };
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    to?: string;
    text?: string;
    photo?: string | null;
    threadId?: string;
    messageId?: string;
  };

  if (body.action === "read" && body.threadId) {
    markInboxRead(viewer, body.threadId);
  } else if (body.action === "clear" && body.threadId) {
    clearInboxThread(viewer, body.threadId);
  } else if (body.action === "empty") {
    emptyInboxFor(viewer);
  } else if (body.action === "deleteMessage" && body.threadId && body.messageId) {
    hideInboxMessage(viewer, body.threadId, body.messageId);
  } else if (body.action === "send") {
    const posted = postInboxMessage({
      from: viewer,
      to: typeof body.to === "string" ? body.to : "",
      text: typeof body.text === "string" ? body.text : "",
      photo: body.photo,
    });
    if ("error" in posted) {
      return NextResponse.json({ error: posted.error }, { status: posted.status });
    }
  } else {
    return NextResponse.json({ error: "Unknown inbox action." }, { status: 400 });
  }

  return NextResponse.json({
    threads: threadsForViewer(viewer),
    contacts: inboxContactsFor(viewer),
    store: inboxStoreKind(),
  });
}
