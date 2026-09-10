import { NextResponse } from "next/server";
import { buildRateVaultWorkshop, findSeedRateVaultSource } from "@/lib/rate-vault-library";
import { parseConfirmReview, recognizeRateVaultSource } from "@/lib/rate-vault-recognize";
import { requireRateVault } from "@/lib/rate-vault-server";
import { stubPublishRateVault, type RateVaultRecognitionReview } from "@/lib/rate-vault";
import {
  addRateVaultOwnerSource,
  confirmRateVaultReview,
  listRateVaultOwnerLibrary,
  listRateVaultReviews,
} from "@/lib/rate-vault-store";

export const dynamic = "force-dynamic";

async function workshopPayload(review: RateVaultRecognitionReview | null = null) {
  const [extras, reviews] = await Promise.all([listRateVaultOwnerLibrary(), listRateVaultReviews()]);
  return buildRateVaultWorkshop(extras, reviews, review);
}

export async function GET(request: Request) {
  const { error } = await requireRateVault(request);
  if (error) return error;
  return NextResponse.json({ workshop: await workshopPayload() });
}

export async function POST(request: Request) {
  const { error } = await requireRateVault(request);
  if (error) return error;
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    title?: string;
    driveId?: string;
    kind?: string;
    siteId?: string;
    craft?: string;
    local?: string;
    note?: string;
    driveKind?: string;
    fileName?: string;
    type?: string;
    data?: string;
    sourceId?: string;
    review?: Record<string, unknown>;
  };
  const action = body.action || "";

  if (action === "publish") {
    return NextResponse.json({ publish: stubPublishRateVault(), workshop: await workshopPayload() });
  }

  if (action === "add-source") {
    const saved = await addRateVaultOwnerSource({
      title: body.title,
      driveId: body.driveId,
      kind: body.kind,
      siteId: body.siteId,
      craft: body.craft,
      local: body.local,
      note: body.note,
      driveKind: body.driveKind,
    });
    if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.status });
    return NextResponse.json({ source: saved.entry, workshop: await workshopPayload() });
  }

  if (action === "recognize") {
    const linked = typeof body.driveId === "string" ? findSeedRateVaultSource(body.driveId) : null;
    const recognized = await recognizeRateVaultSource({
      fileName: body.fileName || linked?.title,
      type: body.type,
      data: body.data,
      driveId: body.driveId || linked?.driveId,
      sourceId: body.sourceId || linked?.id,
    });
    if ("error" in recognized) {
      return NextResponse.json({ error: recognized.error }, { status: recognized.status });
    }
    return NextResponse.json({ review: recognized, workshop: await workshopPayload(recognized) });
  }

  if (action === "confirm") {
    const extras = await listRateVaultOwnerLibrary();
    const linked =
      (typeof body.sourceId === "string" && extras.find((row) => row.id === body.sourceId)) ||
      (typeof body.driveId === "string" ? findSeedRateVaultSource(body.driveId) : null);
    const recognized = await recognizeRateVaultSource({
      fileName: body.fileName || linked?.title,
      type: body.type,
      driveId: body.driveId || linked?.driveId,
      sourceId: body.sourceId || linked?.id,
    });
    if ("error" in recognized) {
      return NextResponse.json({ error: recognized.error }, { status: recognized.status });
    }
    const parsed = parseConfirmReview(body.review ?? body, recognized);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    if (typeof body.driveId === "string" && body.driveId.trim() && !body.driveId.startsWith("upload:")) {
      await addRateVaultOwnerSource({
        id: parsed.sourceId,
        title: body.fileName || linked?.title || parsed.sourceId,
        driveId: body.driveId,
        kind: parsed.kind,
        siteId: parsed.siteId,
        craft: parsed.craft,
        local: parsed.local,
        note: "Confirmed from Rate Vault recognition. Metadata only.",
      });
    }
    const confirmed = await confirmRateVaultReview(parsed);
    return NextResponse.json({
      review: recognized,
      confirmed,
      writesRateBook: false,
      workshop: await workshopPayload(recognized),
    });
  }

  return NextResponse.json({ error: "Unknown Rate Vault action." }, { status: 400 });
}
