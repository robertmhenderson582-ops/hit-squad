import { NextResponse } from "next/server";
import { emptyRateVaultWorkshop, stubPublishRateVault } from "@/lib/rate-vault";
import { requireRateVault } from "@/lib/rate-vault-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { error } = await requireRateVault(request);
  if (error) return error;
  return NextResponse.json({ workshop: emptyRateVaultWorkshop() });
}

export async function POST(request: Request) {
  const { error } = await requireRateVault(request);
  if (error) return error;
  const body = (await request.json().catch(() => ({}))) as { action?: string };
  if (body.action !== "publish") {
    return NextResponse.json({ error: "Unknown Rate Vault action." }, { status: 400 });
  }
  return NextResponse.json({ publish: stubPublishRateVault() });
}
