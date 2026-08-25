import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { cookieValue } from "@/lib/http";
import { addActivity, listActivity } from "@/lib/owner-desk";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  return NextResponse.json({ rows: listActivity() });
}

export async function POST(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as {
    kind?: "sign-in" | "failed" | "feature";
    detail?: string;
  };
  if (body.kind !== "feature" || !body.detail) {
    return NextResponse.json({ error: "Owner feature trail only." }, { status: 400 });
  }
  return NextResponse.json({
    row: addActivity({ kind: "feature", who: user.name, detail: body.detail }),
  });
}
