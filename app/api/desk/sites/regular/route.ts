import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { catalogSites } from "@/lib/desk-data";
import { hasBuildDesk, isOwner } from "@/lib/desk-role";
import { cookieValue } from "@/lib/http";
import { getOwnerSettings, setSiteRegularClient } from "@/lib/owner-settings-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!hasBuildDesk(user)) return NextResponse.json({ error: "Build desk only." }, { status: 403 });
  await getOwnerSettings();
  return NextResponse.json({
    sites: catalogSites().map((site) => ({
      id: site.id,
      name: site.name,
      client: site.client,
      city: site.city,
      regularClient: Boolean(site.regularClient),
    })),
  });
}

export async function POST(request: Request) {
  const user = await readSession(cookieValue(request));
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!isOwner(user)) return NextResponse.json({ error: "Owner tools stay with the owner." }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { siteId?: string; regularClient?: boolean };
  const siteId = typeof body.siteId === "string" ? body.siteId.trim() : "";
  if (!siteId.startsWith("site-") || typeof body.regularClient !== "boolean") {
    return NextResponse.json({ error: "Pick a site and Regular or Competitive bid." }, { status: 400 });
  }
  const known = catalogSites().some((site) => site.id === siteId);
  if (!known) return NextResponse.json({ error: "Pick a site on this desk." }, { status: 400 });
  await setSiteRegularClient(siteId, body.regularClient);
  return NextResponse.json({
    ok: true,
    siteId,
    regularClient: body.regularClient,
    sites: catalogSites().map((site) => ({
      id: site.id,
      name: site.name,
      client: site.client,
      city: site.city,
      regularClient: Boolean(site.regularClient),
    })),
    note: body.regularClient ? "Regular client — budget lane." : "Competitive bid lane.",
  });
}
