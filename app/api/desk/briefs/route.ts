import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { briefsResponse, listVisibleBriefs, saveBriefResponse, saveUserBrief } from "@/lib/brief-vault";
import { checkLeadFiles, isLeadFile, isLeadKind } from "@/lib/lead-briefs";
import { cookieValue } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const kind = new URL(request.url).searchParams.get("kind");
  if (!isLeadKind(kind)) return NextResponse.json({ error: "Pick Quality or HSE." }, { status: 400 });
  const { briefs, store } = await listVisibleBriefs(user, kind);
  return NextResponse.json(briefsResponse(user, briefs, store));
}

export async function POST(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as {
    kind?: unknown;
    describe?: unknown;
    files?: unknown;
  };
  const files = Array.isArray(body.files) ? body.files.filter(isLeadFile) : [];
  const check = checkLeadFiles(files);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });
  try {
    const result = await saveUserBrief(user, { ...body, files });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(saveBriefResponse(user, result));
  } catch {
    return NextResponse.json({ error: "Could not store that brief." }, { status: 502 });
  }
}
