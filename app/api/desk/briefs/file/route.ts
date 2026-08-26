import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { getVisibleBriefFile } from "@/lib/brief-vault";
import { cookieValue } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const fileId = new URL(request.url).searchParams.get("id") || "";
  const file = await getVisibleBriefFile(user, fileId);
  if (!file) return NextResponse.json({ error: "That file is not on this desk." }, { status: 404 });
  return new NextResponse(Uint8Array.from(file.bytes), {
    headers: {
      "content-type": file.type || "application/octet-stream",
      "content-disposition": `attachment; filename="${file.name.replace(/"/g, "")}"`,
      "cache-control": "private, no-store",
    },
  });
}
