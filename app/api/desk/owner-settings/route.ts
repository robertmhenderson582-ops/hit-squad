import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { cookieValue } from "@/lib/http";
import { clearRepublish, getOwnerSettings, setOwnerSettings, startRepublish, type RepublishWait } from "@/lib/owner-desk";

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
    viewResponsibility?: string;
    viewSite?: string;
    action?: string;
    waitMinutes?: RepublishWait;
    note?: string;
  };
  if (body.action === "republish" && user.role === "owner") {
    return NextResponse.json(startRepublish(body.waitMinutes ?? 5, body.note || ""));
  }
  if (body.action === "back" && user.role === "owner") {
    return NextResponse.json(clearRepublish());
  }
  return NextResponse.json(
    setOwnerSettings({
      aliasesOn: body.aliasesOn,
      followSeat: body.followSeat as never,
      viewAs: body.viewAs as never,
      viewResponsibility: body.viewResponsibility as never,
      viewSite: body.viewSite,
    }),
  );
}
