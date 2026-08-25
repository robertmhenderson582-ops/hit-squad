import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { cookieValue } from "@/lib/http";
import { getOwnerSettings, setOwnerSettings } from "@/lib/owner-desk";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  return NextResponse.json(getOwnerSettings());
}

export async function POST(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as {
    aliasesOn?: boolean;
    followSeat?: string;
    viewAs?: string;
  };
  return NextResponse.json(
    setOwnerSettings({
      aliasesOn: body.aliasesOn,
      followSeat: body.followSeat as never,
      viewAs: body.viewAs as never,
    }),
  );
}
