import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { canDesignerShip, hasBuildDesk, isTester } from "@/lib/desk-role";
import { cookieValue } from "@/lib/http";
import type { RepublishWait } from "@/lib/owner-desk";
import { clearRepublish, getOwnerSettings, setOwnerSettings, startRepublish } from "@/lib/owner-settings-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  return NextResponse.json(await getOwnerSettings());
}

export async function POST(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (isTester(user)) {
    return NextResponse.json({ error: "Owner tools stay with the owner." }, { status: 403 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    aliasesOn?: boolean;
    followSeat?: string;
    viewAs?: string;
    viewResponsibility?: string;
    viewSite?: string;
    showInboxSuggestionBox?: boolean;
    showHighUsageNote?: boolean;
    usagePercent?: number | null;
    highUsageThreshold?: number;
    action?: string;
    waitMinutes?: RepublishWait;
    note?: string;
  };
  if (body.action === "republish" && canDesignerShip(user)) {
    return NextResponse.json(await startRepublish(body.waitMinutes ?? 5, body.note || ""));
  }
  if (body.action === "back" && canDesignerShip(user)) {
    return NextResponse.json(await clearRepublish());
  }
  if (!hasBuildDesk(user)) {
    return NextResponse.json({ error: "Build desk only." }, { status: 403 });
  }
  return NextResponse.json(
    await setOwnerSettings({
      aliasesOn: body.aliasesOn,
      followSeat: body.followSeat as never,
      viewAs: body.viewAs as never,
      viewResponsibility: body.viewResponsibility as never,
      viewSite: body.viewSite,
      showInboxSuggestionBox: body.showInboxSuggestionBox,
      showHighUsageNote: body.showHighUsageNote,
      usagePercent: body.usagePercent,
      highUsageThreshold: body.highUsageThreshold,
    }),
  );
}
