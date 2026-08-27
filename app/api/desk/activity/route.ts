import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { hasBuildDesk } from "@/lib/desk-role";
import { cookieValue } from "@/lib/http";
import {
  addActivity,
  clearActivity,
  listActivity,
  removeActivity,
  removeActivityOlderThan,
  type ActivityKind,
} from "@/lib/activity-store";

export const dynamic = "force-dynamic";

const KINDS: ActivityKind[] = ["sign-in", "failed", "session", "feature", "error"];

function isKind(value: unknown): value is ActivityKind {
  return typeof value === "string" && (KINDS as string[]).includes(value);
}

export async function GET(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!hasBuildDesk(user)) return NextResponse.json({ error: "Build desk ledger only." }, { status: 403 });
  return NextResponse.json({ rows: await listActivity() });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    kind?: string;
    who?: string;
    detail?: string;
  };
  const user = await readSession(cookieValue(request));

  if (body.kind === "failed") {
    const who = typeof body.who === "string" ? body.who.trim().slice(0, 120) : "unknown";
    return NextResponse.json({
      row: await addActivity({
        kind: "failed",
        who: who || "unknown",
        detail: "Sign-in failed · username only · password not stored",
      }),
    });
  }

  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!isKind(body.kind) || body.kind === "failed") {
    return NextResponse.json({ error: "Owner trail only." }, { status: 400 });
  }
  return NextResponse.json({
    row: await addActivity({
      kind: body.kind,
      who: user.name,
      detail: typeof body.detail === "string" && body.detail.trim() ? body.detail.trim().slice(0, 200) : body.kind,
    }),
  });
}

export async function DELETE(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!hasBuildDesk(user)) return NextResponse.json({ error: "Build desk ledger only." }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { id?: string; olderThanDays?: number; clear?: boolean };
  if (body.clear) await clearActivity();
  else if (typeof body.olderThanDays === "number") await removeActivityOlderThan(body.olderThanDays);
  else if (body.id) await removeActivity(body.id);
  else return NextResponse.json({ error: "Nothing to delete." }, { status: 400 });
  return NextResponse.json({ rows: await listActivity() });
}
