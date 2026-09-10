import { NextResponse } from "next/server";
import { buildRateVaultWorkshop, findSeedRateVaultSource } from "@/lib/rate-vault-library";
import { enrichReviewWithPreview, resolveRateVaultPreview } from "@/lib/rate-vault-preview";
import { parseConfirmReview, recognizeRateVaultSource } from "@/lib/rate-vault-recognize";
import { requireRateVault } from "@/lib/rate-vault-server";
import { stubPublishRateVault, type RateVaultPreviewPackage, type RateVaultRecognitionReview } from "@/lib/rate-vault";
import {
  addRateVaultOwnerSource,
  confirmRateVaultReview,
  listRateVaultOverrides,
  listRateVaultOwnerLibrary,
  listRateVaultReviews,
  organizeRateVaultSource,
} from "@/lib/rate-vault-store";

export const dynamic = "force-dynamic";

async function workshopPayload(
  review: RateVaultRecognitionReview | null = null,
  preview: RateVaultPreviewPackage | null = resolveRateVaultPreview({ review }),
) {
  const [extras, reviews, overrides] = await Promise.all([
    listRateVaultOwnerLibrary(),
    listRateVaultReviews(),
    listRateVaultOverrides(),
  ]);
  return buildRateVaultWorkshop(extras, reviews, review, overrides, preview);
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

  if (action === "organize-source") {
    const moved = await organizeRateVaultSource({
      sourceId: body.sourceId,
      siteId: body.siteId,
      kind: body.kind,
    });
    if (!moved.ok) return NextResponse.json({ error: moved.error }, { status: moved.status });
    return NextResponse.json({ override: moved.override, workshop: await workshopPayload() });
  }

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
    const preview = resolveRateVaultPreview({ review: recognized, source: linked });
    const review = enrichReviewWithPreview(recognized, preview);
    return NextResponse.json({ review, preview, workshop: await workshopPayload(review, preview) });
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
    const preview = resolveRateVaultPreview({ review: recognized, source: linked, siteId: parsed.siteId });
    const review = enrichReviewWithPreview(recognized, preview);
    const confirmed = await confirmRateVaultReview(parsed);
    return NextResponse.json({
      review,
      preview,
      confirmed,
      writesRateBook: false,
      workshop: await workshopPayload(review, preview),
    });
  }

  return NextResponse.json({ error: "Unknown Rate Vault action." }, { status: 400 });
}
