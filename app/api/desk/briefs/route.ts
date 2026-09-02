import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { DRIVE_WRITE_ERROR } from "@/lib/drive-data";
import { hasBuildDesk } from "@/lib/desk-role";
import { cookieValue } from "@/lib/http";
import {
  isLeadBriefKind,
  leadBriefStoreKind,
  listStoredBriefs,
  publicBrief,
  saveStoredBrief,
} from "@/lib/lead-brief-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const kind = new URL(request.url).searchParams.get("kind");
  if (!isLeadBriefKind(kind)) {
    return NextResponse.json({ error: "Pick a desk." }, { status: 400 });
  }

  const briefs = hasBuildDesk(user)
    ? await listStoredBriefs(kind)
    : await listStoredBriefs(kind, user.email);
  return NextResponse.json({
    briefs: briefs.map(publicBrief),
    store: leadBriefStoreKind(),
  });
}

export async function POST(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    kind?: string;
    describe?: string;
    files?: Array<{ name?: string; type?: string; data?: string }>;
  };
  if (!isLeadBriefKind(body.kind)) {
    return NextResponse.json({ error: "Pick a desk." }, { status: 400 });
  }

  try {
    const brief = await saveStoredBrief({
      kind: body.kind,
      who: user.email,
      whoName: user.name,
      describe: body.describe,
      files: Array.isArray(body.files) ? body.files.map((file) => ({
        name: typeof file.name === "string" ? file.name : "",
        type: typeof file.type === "string" ? file.type : "",
        data: typeof file.data === "string" ? file.data : "",
      })) : [],
    });
    return NextResponse.json({
      brief: publicBrief(brief),
      store: leadBriefStoreKind(),
    });
  } catch {
    return NextResponse.json({ error: DRIVE_WRITE_ERROR }, { status: 503 });
  }
}
