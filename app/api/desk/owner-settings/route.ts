import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { canDesignerShip, hasBuildDesk, isTester } from "@/lib/desk-role";
import { DRIVE_WRITE_ERROR } from "@/lib/drive-data";
import { cookieValue } from "@/lib/http";
import type { OwnerSettings, RepublishWait } from "@/lib/owner-desk";
import { clearRepublish, getOwnerSettings, setOwnerSettings, startRepublish } from "@/lib/owner-settings-store";

export const dynamic = "force-dynamic";

async function jsonSettings(work: () => Promise<OwnerSettings>) {
  try {
    return NextResponse.json(await work());
  } catch {
    return NextResponse.json({ error: DRIVE_WRITE_ERROR }, { status: 503 });
  }
}

export async function GET(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  return jsonSettings(() => getOwnerSettings());
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
    return jsonSettings(() => startRepublish(body.waitMinutes ?? 5, body.note || ""));
  }
  if (body.action === "back" && canDesignerShip(user)) {
    return jsonSettings(() => clearRepublish());
  }
  if (!hasBuildDesk(user)) {
    return NextResponse.json({ error: "Build desk only." }, { status: 403 });
  }
  const patch: Partial<OwnerSettings> = {};
  if ("aliasesOn" in body) patch.aliasesOn = body.aliasesOn;
  if ("followSeat" in body) patch.followSeat = body.followSeat as never;
  if ("viewAs" in body) patch.viewAs = body.viewAs as never;
  if ("viewResponsibility" in body) patch.viewResponsibility = body.viewResponsibility as never;
  if ("viewSite" in body) patch.viewSite = body.viewSite;
  if ("showInboxSuggestionBox" in body) patch.showInboxSuggestionBox = body.showInboxSuggestionBox;
  if ("showHighUsageNote" in body) patch.showHighUsageNote = body.showHighUsageNote;
  if ("usagePercent" in body) patch.usagePercent = body.usagePercent;
  if ("highUsageThreshold" in body) patch.highUsageThreshold = body.highUsageThreshold;
  return jsonSettings(() => setOwnerSettings(patch));
}
